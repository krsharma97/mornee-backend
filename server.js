import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/routes/authRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import cartRoutes from './src/routes/cartRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import { authenticateToken } from './src/middleware/auth.js';
import pool from './src/config/database.js';
import { buildEmailShell, sendCompanyEmail } from './src/utils/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve frontend static build in production
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath, { extensions: ['html'] }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Product options (sizes, fabrics, types, occasions, colors)
app.get('/api/product-options', async (req, res) => {
  try {
    const [sizes, fabrics, types, occasions, colors] = await Promise.all([
      pool.query('SELECT name FROM product_sizes ORDER BY sort_order'),
      pool.query('SELECT name FROM product_fabrics ORDER BY name'),
      pool.query('SELECT name FROM product_types ORDER BY name'),
      pool.query('SELECT name FROM product_occasions ORDER BY name'),
      pool.query('SELECT name, hex_code FROM product_colors ORDER BY name')
    ]);
    res.json({
      sizes: sizes.rows.map(r => r.name),
      fabrics: fabrics.rows.map(r => r.name),
      types: types.rows.map(r => r.name),
      occasions: occasions.rows.map(r => r.name),
      colors: colors.rows
    });
  } catch (err) {
    console.error('Product options error:', err);
    res.status(500).json({ error: 'Failed to get product options' });
  }
});

// Get size charts from database
app.get('/api/size-charts', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM size_chart';
    const params = [];
    
    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY type, sort_order';
    const result = await pool.query(query, params);
    
    const charts = {
      women: result.rows.filter(r => r.type === 'women'),
      men: result.rows.filter(r => r.type === 'men'),
      kids: result.rows.filter(r => r.type === 'kids'),
      unisex: result.rows.filter(r => r.type === 'unisex')
    };
    
    res.json(charts);
  } catch (err) {
    console.error('Size charts error:', err);
    res.status(500).json({ error: 'Failed to get size charts' });
  }
});

// Homepage Banners API
app.get('/api/banners', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM homepage_banners WHERE is_active = true ORDER BY sort_order');
    res.json(result.rows);
  } catch (err) {
    console.error('Banners error:', err);
    res.status(500).json({ error: 'Failed to get banners' });
  }
});

app.post('/api/admin/banners', authenticateToken, async (req, res) => {
  try {
    const { image_url, title, subtitle, link, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO homepage_banners (image_url, title, subtitle, link, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [image_url, title, subtitle, link, sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Create banner error:', err);
    res.status(500).json({ error: 'Failed to create banner' });
  }
});

app.put('/api/admin/banners/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url, title, subtitle, link, sort_order, is_active } = req.body;
    const result = await pool.query(
      'UPDATE homepage_banners SET image_url = $1, title = $2, subtitle = $3, link = $4, sort_order = $5, is_active = $6 WHERE id = $7 RETURNING *',
      [image_url, title, subtitle, link, sort_order, is_active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Banner not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update banner error:', err);
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

app.delete('/api/admin/banners/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM homepage_banners WHERE id = $1', [id]);
    res.json({ message: 'Banner deleted' });
  } catch (err) {
    console.error('Delete banner error:', err);
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// Health check
app.post('/api/admin/orders/:orderId/notify', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notifyType } = req.body; // 'email' or 'sms'
    
    if (req.user.role !== 'admin' && req.user.role !== 'shop_manager') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const orderResult = await pool.query(
      `SELECT o.*, u.email as user_email, c.company_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN company_settings c ON 1=1
       WHERE o.id = $1`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderResult.rows[0];
    
    if (notifyType === 'email' || !notifyType) {
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
    
    res.json({ message: 'Notification sent successfully' });
  } catch (err) {
    console.error('Notify error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Public Policies API
app.get('/api/policies/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await pool.query('SELECT * FROM policies WHERE slug = $1 AND is_active = true', [slug]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Policy error:', err);
    res.status(500).json({ error: 'Failed to get policy' });
  }
});

app.get('/api/policies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM policies WHERE is_active = true ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Policies error:', err);
    res.status(500).json({ error: 'Failed to get policies' });
  }
});

app.put('/api/admin/policies/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { title, content, is_active } = req.body;
    const result = await pool.query(
      'UPDATE policies SET title = $1, content = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [title, content, is_active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update policy error:', err);
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// SPA fallback - serve index.html for non-API routes
// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Route not found' });
  }

  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      console.error('SPA fallback sendFile error:', err);
      res.status(err.status || 500).send('Internal server error');
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mornee running on http://localhost:${PORT}`);
  console.log(`📦 Serving frontend from: ${distPath}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'production'}`);
});

