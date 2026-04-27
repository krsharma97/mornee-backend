import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { decryptSecret, encryptSecret } from '../utils/secrets.js';

const allowedRoles = ['customer', 'shop_manager', 'admin'];
const allowedStatuses = ['active', 'inactive', 'suspended'];

// Canonical per-status order notifications
const ORDER_STATUSES = ['processing','packed','shipped','out-for-delivery','delivered','cancelled'];

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

const parseGatewayConfig = (row) => {
  const rawConfig = parseEncryptedConfig(row?.config_encrypted);
  const config = Object.fromEntries(
    Object.entries(rawConfig).map(([key, value]) => [key, decryptSecret(value)])
  );

  return {
    id: row.id,
    gateway_name: row.gateway_key || row.gateway_name,
    displayName: row.display_name,
    is_active: row.is_enabled,
    environment: row.environment,
    credentials: config,
    merchant_id: row.merchant_id,
    api_key: row.api_key
  };
};

const serializeGatewayConfig = (config = {}) => {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(config)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, encryptSecret(value)])
    )
  );
};

export const getDashboard = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const orderStats = await pool.query(
      `SELECT COUNT(*) as total_orders,
              SUM(final_amount) as total_revenue,
              AVG(final_amount) as avg_order_value
       FROM orders`
    );

    const userStats = await pool.query(
      'SELECT COUNT(*) as total_users FROM users WHERE role = $1',
      ['customer']
    );

    const productStats = await pool.query(
      'SELECT COUNT(*) as total_products FROM products'
    );

    const recentOrders = await pool.query(
      `SELECT o.*, u.email, u.first_name, u.last_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 10`
    );

    res.json({
      stats: {
        totalOrders: orderStats.rows[0].total_orders,
        totalRevenue: parseFloat(orderStats.rows[0].total_revenue || 0),
        avgOrderValue: parseFloat(orderStats.rows[0].avg_order_value || 0),
        totalUsers: userStats.rows[0].total_users,
        totalProducts: productStats.rows[0].total_products
      },
      recentOrders: recentOrders.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export const getUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, role } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT id, email, first_name, last_name, phone, role, status, created_at FROM users';
    const params = [];

    if (role) {
      query += ' WHERE role = $1';
      params.push(role);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM users');

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

export const createStaffUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      email,
      password,
      firstName = '',
      lastName = '',
      phone = '',
      role = 'shop_manager'
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (!['admin', 'shop_manager'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or shop_manager' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, email, first_name, last_name, phone, role, status, created_at`,
      [email.trim().toLowerCase(), hashedPassword, firstName, lastName, phone, role]
    );

    res.status(201).json({
      message: 'Staff user created successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Create staff user error:', error);
    res.status(500).json({ error: 'Failed to create staff user' });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { role, status } = req.body;

    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role supplied' });
    }

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status supplied' });
    }

    const result = await pool.query(
      `UPDATE users
       SET role = COALESCE($1, role),
           status = COALESCE($2, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, email, first_name, last_name, role, status`,
      [role, status, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Get per-status order notification settings
// Admin order notification endpoints removed to restore baseline stability

export const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY sort_order, name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
};

export const createCategory = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, slug, description, imageUrl, sortOrder, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name required' });
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, image_url, sort_order, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, slug || name.toLowerCase().replace(/\s+/g, '-'), description, imageUrl, sortOrder || 0, parentId || null]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
};

export const updateCategory = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { categoryId } = req.params;
    const { name, description, imageUrl, isActive, sortOrder, parentId } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
    if (imageUrl !== undefined) { updates.push(`image_url = $${paramIndex++}`); values.push(imageUrl); }
    if (isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(isActive); }
    if (sortOrder !== undefined) { updates.push(`sort_order = $${paramIndex++}`); values.push(sortOrder); }
    if (parentId !== undefined) { updates.push(`parent_id = $${paramIndex++}`); values.push(parentId); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(categoryId);
    const result = await pool.query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [overview, orderStatusBreakdown, salesByDay, topProducts, categoryRevenue, lowStock, recentCustomers] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(DISTINCT o.id) as total_orders,
          SUM(o.final_amount) as total_revenue,
          AVG(o.final_amount) as avg_order_value,
          COUNT(DISTINCT CASE WHEN DATE(o.created_at) >= $1 THEN o.user_id END) as orders_last_30d,
          SUM(CASE WHEN DATE(o.created_at) >= $1 THEN o.final_amount ELSE 0 END) as revenue_last_30d
        FROM orders o
      `, [thirtyDaysAgo]),
      pool.query(`
        SELECT order_status, COUNT(*) as count, SUM(final_amount) as revenue
        FROM orders GROUP BY order_status ORDER BY count DESC
      `),
      pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as revenue
        FROM orders
        WHERE created_at >= $1
        GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
      `, [thirtyDaysAgo]),
      pool.query(`
        SELECT p.id, p.name, p.image_url, COUNT(oi.id) as sales, SUM(oi.quantity) as units_sold, SUM(oi.price * oi.quantity) as revenue
        FROM products p LEFT JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id, p.name, p.image_url ORDER BY revenue DESC NULLS LAST LIMIT 10
      `),
      pool.query(`
        SELECT c.name, COUNT(oi.id) as items_sold, SUM(oi.price * oi.quantity) as revenue
        FROM categories c LEFT JOIN products p ON c.id = p.category_id
        LEFT JOIN order_items oi ON p.id = oi.product_id
        GROUP BY c.id, c.name ORDER BY revenue DESC NULLS LAST
      `),
      pool.query(`
        SELECT p.id, p.name, p.stock, p.image_url, p.price, COALESCE(p.discount_price, p.price) as current_price
        FROM products p WHERE p.is_active = true AND p.stock <= 10 ORDER BY p.stock ASC LIMIT 10
      `),
      pool.query(`
        SELECT COUNT(*) as total_customers,
          COUNT(CASE WHEN created_at >= $1 THEN 1 END) as new_last_30d
        FROM users WHERE role = 'customer'
      `, [thirtyDaysAgo])
    ]);

    res.json({
      overview: {
        totalOrders: overview.rows[0].total_orders || 0,
        totalRevenue: parseFloat(overview.rows[0].total_revenue || 0),
        avgOrderValue: parseFloat(overview.rows[0].avg_order_value || 0),
        ordersLast30d: overview.rows[0].orders_last_30d || 0,
        revenueLast30d: parseFloat(overview.rows[0].revenue_last_30d || 0)
      },
      orderStatusBreakdown: orderStatusBreakdown.rows,
      salesByDay: salesByDay.rows,
      topProducts: topProducts.rows,
      categoryRevenue: categoryRevenue.rows,
      lowStock: lowStock.rows,
      customers: recentCustomers.rows[0]
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

export const getSettings = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [companyResult, gatewaysResult] = await Promise.all([
      pool.query('SELECT * FROM company_settings WHERE id = 1'),
      pool.query('SELECT * FROM payment_gateway_settings ORDER BY gateway_key')
    ]);

    const gateways = gatewaysResult.rows.map(row => ({
      id: row.id,
      gateway_name: row.gateway_key || row.display_name,
      displayName: row.display_name,
      is_active: row.is_enabled || false,
      merchant_id: row.merchant_id || '',
      api_key: row.api_key || ''
    }));

    // Load per-status notification settings (default to empty if table missing)
    let notis = [];
    try {
      const notiRes = await pool.query('SELECT status, enabled FROM order_notifications ORDER BY status');
      notis = notiRes.rows.map(r => ({ status: r.status, enabled: r.enabled }));
    } catch (err) {
      // Table may not exist yet - that's ok
    }
    res.json({
      company: companyResult.rows[0] || null,
      gateways: gateways,
      order_notifications: notis
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load admin settings' });
  }
};

// Order notifications handled inline in adminRoutes.js

export const updateCompanySettings = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      companyName,
      legalName,
      email,
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      pan,
      gst,
      invoicePrefix,
      supportNotes,
      hsnCode,
      defaultTaxPercent,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      notificationEmail,
      emailProvider
    } = req.body;

    const result = await pool.query(
      `UPDATE company_settings
       SET company_name = $1,
           legal_name = $2,
           email = $3,
           phone = $4,
           website = $5,
           address_line1 = $6,
           address_line2 = $7,
           city = $8,
           state = $9,
           postal_code = $10,
           country = $11,
           pan = $12,
           gst = $13,
           invoice_prefix = COALESCE(NULLIF($14, ''), invoice_prefix),
           support_notes = $15,
           hsn_code = COALESCE(NULLIF($16, ''), hsn_code),
           default_tax_percent = COALESCE($17, default_tax_percent),
           smtp_host = $18,
           smtp_port = $19,
           smtp_user = $20,
           notification_email = $22,
           email_provider = $23,
           ${smtpPassword ? 'smtp_password = $21,' : ''}
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [
        companyName,
        legalName,
        email,
        phone,
        website,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        pan,
        gst,
        invoicePrefix,
        supportNotes,
        hsnCode,
        defaultTaxPercent,
        smtpHost,
        smtpPort,
        smtpUser,
        ...(smtpPassword ? [smtpPassword] : []),
        notificationEmail,
        emailProvider || 'smtp'
      ]
    );

    res.json({
      message: 'Company settings updated successfully',
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Update company settings error:', error);
    res.status(500).json({ error: 'Failed to update company settings' });
  }
};

export const updatePaymentGateway = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { gatewayKey } = req.params;
    const { displayName, isEnabled, environment, config = {} } = req.body;

    const existing = await pool.query(
      'SELECT * FROM payment_gateway_settings WHERE gateway_key = $1',
      [gatewayKey]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Gateway not found' });
    }

    const mergedConfig = {
      ...parseGatewayConfig(existing.rows[0]).config,
      ...config
    };

    const result = await pool.query(
      `UPDATE payment_gateway_settings
       SET display_name = COALESCE($1, display_name),
           is_enabled = COALESCE($2, is_enabled),
           environment = COALESCE($3, environment),
           config_encrypted = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE gateway_key = $5
       RETURNING *`,
      [
        displayName,
        isEnabled,
        environment,
        serializeGatewayConfig(mergedConfig),
        gatewayKey
      ]
    );

    res.json({
      message: 'Payment gateway updated successfully',
      gateway: parseGatewayConfig(result.rows[0])
    });
  } catch (error) {
    console.error('Update payment gateway error:', error);
    res.status(500).json({ error: 'Failed to update payment gateway settings' });
  }
};

export const uploadProductImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const images = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `${baseUrl}/uploads/products/${file.filename}`
    }));

    res.status(201).json({
      message: 'Images uploaded successfully',
      images
    });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
};
// Order notification placeholders at bottom - removed to avoid duplicate exports
