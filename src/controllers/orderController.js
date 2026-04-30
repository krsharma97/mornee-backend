import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { buildEmailShell, sendCompanyEmail } from '../utils/email.js';
import {
  COD_PAYMENT_METHOD,
  isPaymentMethodEnabled
} from '../utils/paymentMethods.js';
import { sendOrderEmail } from '../utils/notifications.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseJsonSafe = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatAddressHtml = (address) => {
  const parsed = parseJsonSafe(address);
  const lines = [
    parsed.fullName || parsed.name,
    parsed.phone,
    parsed.addressLine1 || parsed.address1,
    parsed.addressLine2 || parsed.address2,
    [parsed.city, parsed.state, parsed.postalCode || parsed.pincode].filter(Boolean).join(', '),
    parsed.country || 'India'
  ].filter(Boolean);

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
};

const canAccessOrder = (user, orderUserId) => {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'shop_manager') return true;
  return user.userId === orderUserId;
};

const ensureInvoiceNumber = async (order, client = pool) => {
  if (order.invoice_number) {
    return order.invoice_number;
  }

  const companyResult = await client.query('SELECT invoice_prefix FROM company_settings WHERE id = 1');
  const invoicePrefix = companyResult.rows[0]?.invoice_prefix || 'INV';
  const invoiceNumber = `${invoicePrefix}-${String(order.id).padStart(5, '0')}`;

  await client.query(
    `UPDATE orders
     SET invoice_number = $1,
         invoice_generated_at = COALESCE(invoice_generated_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [invoiceNumber, order.id]
  );

  return invoiceNumber;
};

const getOrderDocumentPayload = async (orderId) => {
  const [orderResult, itemsResult, paymentResult, companyResult] = await Promise.all([
    pool.query(
      `SELECT o.*, u.email, u.first_name, u.last_name, u.phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    ),
    pool.query(
      `SELECT oi.*, p.name, p.image_url, p.tax_percent
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [orderId]
    ),
    pool.query(
      `SELECT *
       FROM payments
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [orderId]
    ),
    pool.query('SELECT * FROM company_settings WHERE id = 1')
  ]);

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];
  order.items = itemsResult.rows;
  order.payment = paymentResult.rows[0] || null;
  order.company = companyResult.rows[0] || null;
  order.shippingAddressParsed = parseJsonSafe(order.shipping_address);
  order.billingAddressParsed = parseJsonSafe(order.billing_address || order.shipping_address);
  
  const taxPercents = order.items.map(i => i.tax_percent).filter(t => t != null);
  order.tax_percent = taxPercents.length > 0 ? taxPercents[0] : (order.company?.default_tax_percent || 0);
  
  return order;
};

const renderInvoiceHtml = (order) => {
  const itemsHtml = order.items
    .map(
    .map(
      (item) => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="Product" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #eee3eb;" />` : ''}
              <span>${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td>${escapeHtml(item.size || '-')}</td>
          <td>${escapeHtml(item.color || '-')}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.price)}</td>
          <td>${formatCurrency(Number(item.price) * Number(item.quantity))}</td>
        </tr>
      `
    )
    .join('');

  const company = order.company || {};
  const payment = order.payment || {};

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Invoice ${escapeHtml(order.invoice_number)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f8f2f6; color: #2f2237; }
        .page { max-width: 960px; margin: 24px auto; background: #fff; border-radius: 24px; padding: 32px; }
        .topbar { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
        .badge { display: inline-block; padding: 8px 14px; border-radius: 999px; background: #f1e5ff; color: #4d2f8e; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; }
        h1, h2, h3, p { margin: 0; }
        .muted { color: #7f6d81; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
        .card { background: #fbf6f8; border-radius: 18px; padding: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid #eee3eb; font-size: 14px; }
        th { color: #7f6d81; font-weight: 600; }
        .totals { margin-top: 20px; margin-left: auto; width: 320px; }
        .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .grand { font-size: 18px; font-weight: 700; color: #4d2f8e; border-top: 1px solid #eee3eb; margin-top: 8px; padding-top: 12px; }
        .actions { margin-top: 24px; display: flex; gap: 12px; }
        .btn { border: none; border-radius: 999px; padding: 12px 20px; background: #4d2f8e; color: #fff; font-weight: 700; cursor: pointer; }
        .btn.secondary { background: #f1e5ff; color: #4d2f8e; }
        @media print { body { background: #fff; } .page { margin: 0; border-radius: 0; box-shadow: none; } .actions { display: none; } }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="topbar">
          <div>
            <span class="badge">Invoice</span>
            <div style="margin-top:16px; display: flex; align-items: center; gap: 16px;">
              <img src="/favicon.png" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; border-radius: 8px;" onerror="this.style.display='none'" />
              <h1 style="margin: 0;">${escapeHtml(company.company_name || 'Mornee')}</h1>
            </div>
            <p class="muted" style="margin-top:8px;">${escapeHtml(company.legal_name || company.company_name || 'Mornee')}</p>
            <p class="muted" style="margin-top:8px;">${escapeHtml(company.address_line1 || '')} ${escapeHtml(company.address_line2 || '')}</p>
            <p class="muted">${escapeHtml([company.city, company.state, company.postal_code].filter(Boolean).join(', '))}</p>
            <p class="muted">${escapeHtml(company.country || 'India')} | GST: ${escapeHtml(company.gst || 'Not set')} | PAN: ${escapeHtml(company.pan || 'Not set')}</p>
            <p class="muted">HSN Code: ${escapeHtml(company.hsn_code || 'Not set')}</p>
          </div>
          <div style="text-align:right;">
            <h2>${escapeHtml(order.invoice_number)}</h2>
            <p class="muted" style="margin-top:8px;">Order: ${escapeHtml(order.order_number)}</p>
            <p class="muted">Date: ${new Date(order.created_at).toLocaleDateString('en-IN')}</p>
            <p class="muted">Payment: ${escapeHtml(order.payment_status || 'pending')}</p>
            <p class="muted">Method: ${escapeHtml(order.payment_method || payment.payment_method || '-')}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Bill To</h3>
            <div class="muted" style="margin-top:10px;">${formatAddressHtml(order.billingAddressParsed)}</div>
            <div class="muted" style="margin-top:10px;">${escapeHtml(order.email)}</div>
          </div>
          <div class="card">
            <h3>Ship To</h3>
            <div class="muted" style="margin-top:10px;">${formatAddressHtml(order.shippingAddressParsed)}</div>
            <div class="muted" style="margin-top:10px;">Phone: ${escapeHtml(order.phone || order.shippingAddressParsed.phone || '-')}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Size</th>
              <th>Color</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><strong>${formatCurrency(order.total_amount)}</strong></div>
          <div class="totals-row"><span>Tax (${order.tax_percent || 0}%)</span><strong>${formatCurrency(order.tax_amount)}</strong></div>
          <div class="totals-row"><span>Shipping</span><strong>${formatCurrency(order.shipping_amount)}</strong></div>
          <div class="totals-row"><span>Discount</span><strong>${formatCurrency(order.discount_amount)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><span>${formatCurrency(order.final_amount)}</span></div>
        </div>

        <div class="actions">
          <button class="btn" onclick="window.print()">Print / Save as PDF</button>
          <button class="btn secondary" onclick="window.close()">Close</button>
        </div>
      </div>
    </body>
  </html>`;
};

const renderShippingLabelHtml = (order) => {
  const company = order.company || {};
  const shippingAddress = order.shippingAddressParsed || {};

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Shipping Label ${escapeHtml(order.order_number)}</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f6f2f7; margin: 0; padding: 24px; }
        .label { max-width: 820px; margin: 0 auto; background: white; border: 3px solid #2f2237; border-radius: 24px; padding: 28px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .block { border: 1px solid #eadce6; border-radius: 18px; padding: 18px; min-height: 180px; }
        .heading { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: #8d738b; }
        .big { font-size: 28px; font-weight: 800; margin-top: 10px; color: #2f2237; }
        .text { margin-top: 10px; font-size: 16px; line-height: 1.6; color: #3f3150; }
        .meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 20px; flex-wrap: wrap; }
        .pill { background: #f1e5ff; color: #4d2f8e; padding: 10px 14px; border-radius: 999px; font-weight: 700; }
        .actions { margin-top: 24px; display: flex; gap: 12px; }
        .btn { border: none; border-radius: 999px; padding: 12px 20px; background: #4d2f8e; color: #fff; font-weight: 700; cursor: pointer; }
        .btn.secondary { background: #f1e5ff; color: #4d2f8e; }
        @media print { body { background: #fff; padding: 0; } .actions { display: none; } .label { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="row">
          <div class="block">
            <div class="heading">Ship From</div>
            <div class="big">${escapeHtml(company.company_name || 'Mornee')}</div>
            <div class="text">
              <div>${escapeHtml(company.address_line1 || '')}</div>
              <div>${escapeHtml(company.address_line2 || '')}</div>
              <div>${escapeHtml([company.city, company.state, company.postal_code].filter(Boolean).join(', '))}</div>
              <div>${escapeHtml(company.country || 'India')}</div>
              <div>Phone: ${escapeHtml(company.phone || '-')}</div>
            </div>
          </div>
          <div class="block">
            <div class="heading">Ship To</div>
            <div class="big">${escapeHtml(shippingAddress.fullName || shippingAddress.name || `${order.first_name || ''} ${order.last_name || ''}`.trim() || 'Customer')}</div>
            <div class="text">
              <div>${escapeHtml(shippingAddress.addressLine1 || shippingAddress.address1 || '')}</div>
              <div>${escapeHtml(shippingAddress.addressLine2 || shippingAddress.address2 || '')}</div>
              <div>${escapeHtml([shippingAddress.city, shippingAddress.state, shippingAddress.postalCode || shippingAddress.pincode].filter(Boolean).join(', '))}</div>
              <div>${escapeHtml(shippingAddress.country || 'India')}</div>
              <div>Phone: ${escapeHtml(shippingAddress.phone || order.phone || '-')}</div>
            </div>
          </div>
        </div>

        <div class="meta">
          <div class="pill">Order ${escapeHtml(order.order_number)}</div>
          <div class="pill">Invoice ${escapeHtml(order.invoice_number || '-')}</div>
          <div class="pill">Status ${escapeHtml(order.order_status || 'placed')}</div>
          <div class="pill">Payment ${escapeHtml(order.payment_status || 'pending')}</div>
        </div>

        <div class="meta">
          <div><strong>Courier:</strong> ${escapeHtml(order.courier_name || 'Not set')}</div>
          <div><strong>AWB:</strong> ${escapeHtml(order.awb_number || 'Not set')}</div>
          <div><strong>Qty:</strong> ${escapeHtml(order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</div>
        </div>

        <div class="actions">
          <button class="btn" onclick="window.print()">Print / Save as PDF</button>
          <button class="btn secondary" onclick="window.close()">Close</button>
        </div>
      </div>
    </body>
  </html>`;
};

export const createOrder = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const userId = req.user?.userId || 0; // Use 0 for guest checkout
    const {
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      items,
      total_amount,
      payment_method
    } = req.body;

    if (!shipping_address || !items || items.length === 0) {
      return res.status(400).json({ error: 'Shipping address and items required' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required.' });
    }

    if (!(await isPaymentMethodEnabled(payment_method))) {
      return res.status(400).json({
        error: payment_method === COD_PAYMENT_METHOD
          ? 'Cash on Delivery is disabled right now.'
          : 'Selected payment method is not available right now.'
      });
    }

    const isCodOrder = payment_method === COD_PAYMENT_METHOD;

    await client.query('BEGIN');
    transactionStarted = true;

    // Validate stock for all items
    for (const item of items) {
      const productResult = await client.query(
        'SELECT price, discount_price, stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(404).json({ error: `Product ${item.product_id} not found` });
      }

      const product = productResult.rows[0];
      if (product.stock < item.quantity) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
      }
    }

    // Calculate amounts
    const subtotal = total_amount;
    const taxAmount = Math.round(subtotal * 0.12 * 100) / 100; // 12% tax
    const shippingAmount = subtotal > 499 ? 0 : 50; // Free shipping over ₹499
    const discountAmount = 0;
    const finalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

    const orderNumber = `ORD-${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;

    const orderResult = await client.query(
      `INSERT INTO orders
       (order_number, user_id, total_amount, discount_amount, tax_amount, shipping_amount, final_amount, payment_method, payment_status, shipping_address, order_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, order_number, final_amount`,
      [
        orderNumber,
        userId,
        subtotal,
        discountAmount,
        taxAmount,
        shippingAmount,
        finalAmount,
        payment_method,
        'pending',
        JSON.stringify(shipping_address),
        isCodOrder ? 'confirmed' : 'payment_pending'
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of items) {
      const productResult = await client.query(
        'SELECT price, discount_price FROM products WHERE id = $1',
        [item.product_id]
      );
      const product = productResult.rows[0];
      const price = product.discount_price || product.price;

      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, quantity, price, size, color)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.product_id, item.quantity, price, item.size, item.color]
      );

      // Reserve stock until payment succeeds or fails.
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    if (isCodOrder && userId) {
      await client.query('DELETE FROM cart WHERE user_id = $1', [userId]);
    }

    await client.query('COMMIT');

    if (isCodOrder) {
      sendOrderEmail(
        {
          order_number: orderNumber,
          final_amount: finalAmount,
          payment_method,
          order_status: 'confirmed',
          customer_name,
          shipping_address: JSON.stringify(shipping_address)
        },
        'new'
      ).catch(console.error);
    }

    res.status(201).json({
      id: orderId,
      order_number: orderNumber,
      final_amount: finalAmount,
      message: isCodOrder
        ? 'Order placed successfully. Payment will be collected on delivery.'
        : 'Order created. Complete payment to confirm it.'
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
};

export const getOrders = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, Number(limit), offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM orders WHERE user_id = $1',
      [userId]
    );

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsResult = await pool.query(
      `SELECT oi.*, p.name, p.image_url FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0];
    order.items = itemsResult.rows;

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, courierName, awbNumber, dispatchNotes } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const ALLOWED_STATUSES = ['processing','packed','shipped','out-for-delivery','delivered','cancelled'];
    if (orderStatus && !ALLOWED_STATUSES.includes(orderStatus)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET order_status = COALESCE($1, order_status),
           courier_name = COALESCE($2, courier_name),
           awb_number = COALESCE($3, awb_number),
           dispatch_notes = COALESCE($4, dispatch_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [orderStatus, courierName, awbNumber, dispatchNotes, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = result.rows[0];
    // Attempt to notify the customer automatically via Email if SMTP is configured
    try {
      const notificationResult = await pool.query(
        'SELECT enabled FROM order_notifications WHERE status = $1',
        [updatedOrder.order_status]
      );
      const notificationsEnabled =
        notificationResult.rows.length === 0 || notificationResult.rows[0].enabled !== false;

      if (!notificationsEnabled) {
        return res.json({
          message: 'Order status updated',
          order: updatedOrder
        });
      }

      const notifyRes = await pool.query(
        `SELECT o.*, u.email as user_email, c.company_name
         FROM orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN company_settings c ON 1=1
         WHERE o.id = $1`,
        [orderId]
      );
      const order = notifyRes.rows[0];
      if (order?.user_email) {
        await sendCompanyEmail({
          to: order.user_email,
          subject: `Order ${order.order_number} Status Update`,
          html: buildEmailShell({
            companyName: order.company_name || 'Mornee',
            body: `
              <h2>Your Order ${order.order_number}</h2>
              <p>Current Status: <strong>${order.order_status}</strong></p>
              <p>Amount: ₹${order.final_amount}</p>
              <p>Track your order at: https://mornee.in/orders</p>
            `
          })
        });
      }
    } catch (notifyErr) {
      // Do not block the API response on notification failure
      console.error('Auto-notify failed:', notifyErr);
    }

    res.json({
      message: 'Order status updated',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `SELECT o.*, u.email, u.first_name, u.last_name
                 FROM orders o
                 JOIN users u ON u.id = o.user_id`;
    const params = [];

    if (status) {
      query += ' WHERE o.order_status = $1';
      params.push(status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM orders');

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
};

export const getOrderInvoiceDownload = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await getOrderDocumentPayload(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!canAccessOrder(req.user, order.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    order.invoice_number = await ensureInvoiceNumber(order);
    const html = renderInvoiceHtml(order);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${order.invoice_number}.html"`);
    res.send(html);
  } catch (error) {
    console.error('Get order invoice download error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

export const getOrderInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await getOrderDocumentPayload(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!canAccessOrder(req.user, order.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    order.invoice_number = await ensureInvoiceNumber(order);
    const html = renderInvoiceHtml(order);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Get order invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

export const getOrderShippingLabel = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await getOrderDocumentPayload(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!canAccessOrder(req.user, order.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    order.invoice_number = await ensureInvoiceNumber(order);
    await pool.query(
      `UPDATE orders
       SET label_generated_at = COALESCE(label_generated_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId]
    );

    const html = renderShippingLabelHtml(order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Get shipping label error:', error);
    res.status(500).json({ error: 'Failed to generate shipping label' });
  }
};

export const bulkUpdateOrderStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { orderIds, orderStatus } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Order IDs are required as an array' });
    }

    const ALLOWED_STATUSES = ['processing', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'cancelled'];
    if (orderStatus && !ALLOWED_STATUSES.includes(orderStatus)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    await client.query('BEGIN');

    for (const orderId of orderIds) {
      await client.query(
        `UPDATE orders
         SET order_status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [orderStatus, orderId]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: `${orderIds.length} orders updated to ${orderStatus} successfully`,
      updatedCount: orderIds.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk update order error:', error);
    res.status(500).json({ error: 'Failed to update orders' });
  } finally {
    client.release();
  }
};
