import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { decryptSecret } from '../utils/secrets.js';
import { sendOrderEmail } from '../utils/notifications.js';

const ONLINE_PAYMENT_METHODS = new Set(['phonepe', 'razorpay', 'card', 'upi', 'wallet']);

const parseEncryptedConfig = (value) => {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};

const loadGatewaySettings = async (gatewayKey) => {
  const result = await pool.query(
    'SELECT * FROM payment_gateway_settings WHERE gateway_key = $1',
    [gatewayKey]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const rawConfig = parseEncryptedConfig(row.config_encrypted);
  const config = Object.fromEntries(
    Object.entries(rawConfig).map(([key, value]) => [key, decryptSecret(value)])
  );

  return {
    gatewayKey: row.gateway_key,
    displayName: row.display_name,
    isEnabled: row.is_enabled,
    environment: row.environment,
    config
  };
};

const getRazorpayConfig = async () => {
  const dbGateway = await loadGatewaySettings('razorpay');
  const config = dbGateway?.config || {};

  return {
    isEnabled: dbGateway?.isEnabled ?? false,
    keyId: config.keyId || process.env.RAZORPAY_KEY_ID || '',
    keySecret: config.keySecret || process.env.RAZORPAY_KEY_SECRET || ''
  };
};

const getPhonePeConfig = async () => {
  const dbGateway = await loadGatewaySettings('phonepe');
  const config = dbGateway?.config || {};

  return {
    isEnabled: dbGateway?.isEnabled ?? true,
    host: config.baseUrl || process.env.PHONEPE_BASE_URL || 'https://api.phonepe.com/apis/hermes',
    merchantId: config.merchantId || process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT',
    saltKey: config.apiKey || process.env.PHONEPE_API_KEY || 'PBPG310BCFE54b7a2',
    saltIndex: Number(config.saltIndex || process.env.PHONEPE_SALT_INDEX || 1)
  };
};

const generateChecksum = (payload, saltKey, saltIndex) => {
  const stringToHash = payload + '/pg/v1/pay' + saltKey;
  const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return hash + '###' + saltIndex;
};

const appendQueryParams = (baseUrl, params) => {
  try {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  } catch (error) {
    return baseUrl;
  }
};

const verifyPaymentWithPhonePe = async (transactionId, config) => {
  try {
    const stringToHash = `/pg/v1/status/${config.merchantId}/${transactionId}${config.saltKey}`;
    const checksum = crypto.createHash('sha256').update(stringToHash).digest('hex');

    const response = await axios.get(
      `${config.host}/pg/v1/status/${config.merchantId}/${transactionId}`,
      {
        headers: {
          'X-VERIFY': checksum + '###' + config.saltIndex,
          'X-MERCHANT-ID': config.merchantId
        }
      }
    );

    const data = response.data;
    const transactionStatus = data?.data?.transactionStatus || data?.data?.status || data?.status;
    const isSuccess = data?.success === true && ['SUCCESS', 'success'].includes(transactionStatus);

    return isSuccess ? data : null;
  } catch (error) {
    console.error('PhonePe verification error:', error.response?.data || error.message);
    return null;
  }
};

const canAccessPayment = (user, orderUserId) => {
  if (!user) {
    return false;
  }

  return user.role === 'admin' || user.role === 'shop_manager' || user.userId === orderUserId;
};

const restoreReservedInventory = async (client, orderId) => {
  const itemsResult = await client.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
    [orderId]
  );

  for (const item of itemsResult.rows) {
    await client.query(
      'UPDATE products SET stock = stock + $1 WHERE id = $2',
      [item.quantity, item.product_id]
    );
  }
};

export const initiatePayment = async (req, res) => {
  try {
    const {
      orderId,
      redirectUrl,
      paymentMethod = 'phonepe'
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    if (!ONLINE_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ error: 'Cash on Delivery is disabled. Please complete payment online.' });
    }

    const orderCheck = await pool.query(
      `SELECT id, user_id, order_number, final_amount, payment_status
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderCheck.rows[0];
    if (!canAccessPayment(req.user, order.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (order.payment_status === 'completed') {
      return res.status(409).json({ error: 'This order has already been paid.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const amount = Number(order.final_amount);

    if (paymentMethod === 'phonepe' || paymentMethod === 'card' || paymentMethod === 'upi' || paymentMethod === 'wallet') {
      const phonePe = await getPhonePeConfig();
      if (!phonePe.isEnabled) {
        return res.status(400).json({ error: 'PhonePe is disabled in admin settings' });
      }

      const transactionId = `MORNEE_${Date.now()}_${uuidv4().substring(0, 8)}`;
      const paymentRedirectUrl = appendQueryParams(
        redirectUrl || `${frontendUrl}/payment-success`,
        {
          transactionId,
          orderId,
          gateway: 'phonepe'
        }
      );

      const payload = {
        merchantId: phonePe.merchantId,
        merchantTransactionId: transactionId,
        merchantUserId: `USER_${order.user_id}`,
        amount: Math.round(amount * 100),
        redirectUrl: paymentRedirectUrl,
        redirectMode: 'REDIRECT',
        paymentInstrument: {
          type: 'PAY_PAGE'
        }
      };

      const payloadString = JSON.stringify(payload);
      const payloadBase64 = Buffer.from(payloadString).toString('base64');
      const checksum = generateChecksum(payloadBase64, phonePe.saltKey, phonePe.saltIndex);

      await pool.query(
        `INSERT INTO payments (order_id, transaction_id, amount, payment_method, gateway_name, status, gateway_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, transactionId, amount, paymentMethod, 'phonepe', 'pending', JSON.stringify({ requestPayload: payload })]
      );

      return res.json({
        gateway: 'phonepe',
        orderId,
        transactionId,
        paymentUrl: `${phonePe.host}/pg/v1/pay`,
        payload: payloadBase64,
        checksum
      });
    }

    if (paymentMethod === 'razorpay') {
      const razorpay = await getRazorpayConfig();
      if (!razorpay.isEnabled) {
        return res.status(400).json({ error: 'Razorpay is disabled in admin settings' });
      }

      const razorpayOrder = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt: order.order_number,
          notes: {
            orderId,
            orderNumber: order.order_number
          }
        },
        {
          auth: {
            username: razorpay.keyId,
            password: razorpay.keySecret
          }
        }
      );

      const transactionId = razorpayOrder.data.id;

      await pool.query(
        `INSERT INTO payments (order_id, transaction_id, amount, payment_method, gateway_name, status, gateway_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, transactionId, amount, paymentMethod, 'razorpay', 'pending', JSON.stringify(razorpayOrder.data)]
      );

      return res.json({
        gateway: 'razorpay',
        orderId,
        transactionId,
        razorpayOrderId: razorpayOrder.data.id,
        amount: razorpayOrder.data.amount,
        currency: razorpayOrder.data.currency,
        keyId: razorpay.keyId,
        customerName: order.order_number,
        customerEmail: '',
        customerPhone: ''
      });
    }

    return res.status(400).json({
      error: `${paymentMethod} payment is not enabled. Please complete payment online.`
    });
  } catch (error) {
    console.error('Initiate payment error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error || 'Failed to initiate payment' });
  }
};

export const handlePaymentCallback = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { transactionId, razorpayResponse } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const paymentResult = await pool.query(
      `SELECT
         p.id,
         p.order_id,
         p.amount,
         p.status,
         p.gateway_name,
         p.payment_method,
         o.user_id,
         o.order_number,
         o.final_amount,
         o.shipping_address
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.transaction_id = $1`,
      [transactionId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const paymentRecord = paymentResult.rows[0];
    if (!canAccessPayment(req.user, paymentRecord.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (paymentRecord.status === 'completed') {
      return res.json({
        message: 'Payment already processed',
        orderId: paymentRecord.order_id,
        orderNumber: paymentRecord.order_number
      });
    }

    if (paymentRecord.status === 'failed') {
      return res.status(409).json({ error: 'This payment has already been marked as failed.' });
    }

    const isRazorpay = paymentRecord.gateway_name === 'razorpay';
    let gatewayReference = transactionId;
    let verifiedResponse = {};

    if (isRazorpay) {
      if (
        !razorpayResponse?.razorpay_payment_id ||
        !razorpayResponse?.razorpay_order_id ||
        !razorpayResponse?.razorpay_signature
      ) {
        return res.status(400).json({ error: 'Incomplete Razorpay payment details.' });
      }

      if (razorpayResponse.razorpay_order_id !== transactionId) {
        return res.status(400).json({ error: 'Invalid Razorpay order reference.' });
      }

      const razorpayConfig = await getRazorpayConfig();
      const signatureData = `${razorpayResponse.razorpay_order_id}|${razorpayResponse.razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', razorpayConfig.keySecret)
        .update(signatureData)
        .digest('hex');

      if (expectedSignature !== razorpayResponse.razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }

      gatewayReference = razorpayResponse.razorpay_payment_id;
      verifiedResponse = razorpayResponse;
    } else {
      const phonePe = await getPhonePeConfig();
      const phonePeVerification = await verifyPaymentWithPhonePe(transactionId, phonePe);

      if (!phonePeVerification) {
        return res.status(400).json({ error: 'PhonePe payment could not be verified.' });
      }

      gatewayReference =
        phonePeVerification?.data?.transactionId ||
        phonePeVerification?.data?.providerReferenceId ||
        transactionId;
      verifiedResponse = phonePeVerification;
    }

    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(
      `UPDATE payments
       SET status = $1,
           gateway_reference = $2,
           gateway_response = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $4`,
      ['completed', gatewayReference, JSON.stringify(verifiedResponse), transactionId]
    );

    await client.query(
      `UPDATE orders
       SET payment_status = $1,
           order_status = $2,
           invoice_generated_at = COALESCE(invoice_generated_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['completed', 'confirmed', paymentRecord.order_id]
    );

    await client.query('DELETE FROM cart WHERE user_id = $1', [paymentRecord.user_id]);

    await client.query('COMMIT');

    sendOrderEmail(
      {
        order_number: paymentRecord.order_number,
        final_amount: paymentRecord.final_amount,
        payment_method: paymentRecord.payment_method,
        order_status: 'confirmed',
        shipping_address: paymentRecord.shipping_address
      },
      'new'
    ).catch(console.error);

    res.json({
      message: 'Payment successful. Your order is confirmed.',
      orderId: paymentRecord.order_id,
      orderNumber: paymentRecord.order_number,
      transactionId
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  } finally {
    client.release();
  }
};

export const cancelPendingPayment = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { transactionId, orderId, reason = 'cancelled' } = req.body;

    if (!transactionId && !orderId) {
      return res.status(400).json({ error: 'Transaction ID or Order ID is required' });
    }

    const paymentResult = transactionId
      ? await pool.query(
          `SELECT
             p.id,
             p.transaction_id,
             p.order_id,
             p.status,
             o.user_id,
             o.order_number
           FROM payments p
           JOIN orders o ON o.id = p.order_id
           WHERE p.transaction_id = $1`,
          [transactionId]
        )
      : await pool.query(
          `SELECT
             p.id,
             p.transaction_id,
             o.id AS order_id,
             p.status,
             o.user_id,
             o.order_number
           FROM orders o
           LEFT JOIN payments p ON p.order_id = o.id
           WHERE o.id = $1
           ORDER BY p.created_at DESC NULLS LAST
           LIMIT 1`,
          [orderId]
        );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const paymentRecord = paymentResult.rows[0];
    if (!canAccessPayment(req.user, paymentRecord.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (paymentRecord.status === 'completed') {
      return res.status(409).json({ error: 'This payment is already completed.' });
    }

    if (paymentRecord.status === 'failed') {
      return res.json({
        message: 'Payment already marked as failed.',
        orderId: paymentRecord.order_id,
        orderNumber: paymentRecord.order_number
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    if (paymentRecord.transaction_id) {
      await client.query(
        `UPDATE payments
         SET status = $1,
             gateway_response = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE transaction_id = $3`,
        [
          'failed',
          JSON.stringify({
            reason,
            cancelledAt: new Date().toISOString()
          }),
          paymentRecord.transaction_id
        ]
      );
    }

    await client.query(
      `UPDATE orders
       SET payment_status = $1,
           order_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['failed', 'cancelled', paymentRecord.order_id]
    );

    await restoreReservedInventory(client, paymentRecord.order_id);

    await client.query('COMMIT');

    res.json({
      message: 'Pending payment cancelled and reserved stock released.',
      orderId: paymentRecord.order_id,
      orderNumber: paymentRecord.order_number
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    console.error('Cancel payment error:', error);
    res.status(500).json({ error: 'Failed to cancel pending payment' });
  } finally {
    client.release();
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await pool.query(
      'SELECT * FROM payments WHERE transaction_id = $1',
      [transactionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
};

export const getEnabledMethods = async (req, res) => {
  try {
    const phonePe = await getPhonePeConfig();
    const razorpay = await getRazorpayConfig();
    const methods = [];

    if (phonePe.isEnabled) {
      methods.push({
        key: 'phonepe',
        name: 'PhonePe (Card / UPI / Wallet)',
        type: 'phonepe',
        isEnabled: true
      });
    }

    if (razorpay.isEnabled) {
      methods.push({
        key: 'razorpay',
        name: 'Razorpay',
        type: 'razorpay',
        isEnabled: true
      });
    }

    res.json(methods);
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
};
