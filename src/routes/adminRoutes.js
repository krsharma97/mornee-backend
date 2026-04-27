import express from 'express';
import {
  getDashboard,
  getUsers,
  createStaffUser,
  updateUserRole,
  getCategories,
  createCategory,
  updateCategory,
  getAnalytics,
  getSettings,
  updateCompanySettings,
  updatePaymentGateway,
  uploadProductImages
} from '../controllers/adminController.js';
import pool from '../config/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';
import { productImageUpload } from '../middleware/upload.js';

const router = express.Router();
// Health check endpoint (no auth required) for frontend health checks
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/dashboard', authenticateToken, isAdmin, getDashboard);
router.get('/users', authenticateToken, isAdmin, getUsers);
router.post('/users', authenticateToken, isAdmin, createStaffUser);
router.put('/users/:userId', authenticateToken, isAdmin, updateUserRole);
router.get('/categories', getCategories);
router.post('/categories', authenticateToken, isAdmin, createCategory);
router.put('/categories/:categoryId', authenticateToken, isAdmin, updateCategory);
router.get('/analytics', authenticateToken, isAdmin, getAnalytics);
router.get('/settings', authenticateToken, isAdmin, getSettings);
router.put('/settings/company', authenticateToken, isAdmin, updateCompanySettings);
router.put('/settings/gateways/:gatewayKey', authenticateToken, isAdmin, updatePaymentGateway);
router.post('/settings/gateways', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gatewayKey, displayName, environment = 'test', config = {} } = req.body;
    if (!gatewayKey || !displayName) {
      return res.status(400).json({ error: 'Gateway key and display name required' });
    }
    const existing = await pool.query('SELECT * FROM payment_gateway_settings WHERE gateway_key = $1', [gatewayKey]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Gateway already exists' });
    }
    const { encryptSecret } = await import('../utils/secrets.js');
    const encryptedConfig = JSON.stringify(
      Object.fromEntries(Object.entries(config).map(([k, v]) => [k, encryptSecret(String(v))]))
    );
    const result = await pool.query(
      `INSERT INTO payment_gateway_settings (gateway_key, display_name, environment, config_encrypted, is_enabled)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [gatewayKey, displayName, environment, encryptedConfig, false]
    );
    res.status(201).json({ message: 'Payment gateway created', gateway: result.rows[0] });
  } catch (err) {
    console.error('Create gateway error:', err);
    res.status(500).json({ error: 'Failed to create payment gateway' });
  }
});
router.delete('/settings/gateways/:gatewayKey', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gatewayKey } = req.params;
    const result = await pool.query('DELETE FROM payment_gateway_settings WHERE gateway_key = $1 RETURNING gateway_key', [gatewayKey]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gateway not found' });
    }
    res.json({ message: 'Payment gateway deleted', gateway_key: gatewayKey });
  } catch (err) {
    console.error('Delete gateway error:', err);
    res.status(500).json({ error: 'Failed to delete payment gateway' });
  }
});

// Email provider management endpoints
router.get('/settings/email-providers', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, provider_name, provider_type, config, is_active, created_at FROM email_providers ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (err) {
    console.error('Get email providers error:', err);
    res.status(500).json({ error: 'Failed to get email providers' });
  }
});
router.post('/settings/email-providers', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { providerName, providerType, config = {}, isActive = false } = req.body;
    if (!providerName || !providerType) {
      return res.status(400).json({ error: 'Provider name and type required' });
    }
    const result = await pool.query(
      `INSERT INTO email_providers (provider_name, provider_type, config, is_active)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [providerName, providerType, JSON.stringify(config), isActive]
    );
    res.status(201).json({ message: 'Email provider created', provider: result.rows[0] });
  } catch (err) {
    console.error('Create email provider error:', err);
    res.status(500).json({ error: 'Failed to create email provider' });
  }
});
router.put('/settings/email-providers/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { providerName, config, isActive } = req.body;
    const result = await pool.query(
      `UPDATE email_providers SET provider_name = COALESCE($1, provider_name), config = COALESCE($2, config), is_active = COALESCE($3, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [providerName, config ? JSON.stringify(config) : null, isActive, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email provider not found' });
    }
    res.json({ message: 'Email provider updated', provider: result.rows[0] });
  } catch (err) {
    console.error('Update email provider error:', err);
    res.status(500).json({ error: 'Failed to update email provider' });
  }
});
router.delete('/settings/email-providers/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM email_providers WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email provider not found' });
    }
    res.json({ message: 'Email provider deleted' });
  } catch (err) {
    console.error('Delete email provider error:', err);
    res.status(500).json({ error: 'Failed to delete email provider' });
  }
});

// Order status email templates
router.get('/order-templates', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM order_status_templates ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

router.put('/order-templates/:status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.params;
    const { subject, body_html, enabled } = req.body;
    const result = await pool.query(
      `INSERT INTO order_status_templates (status, subject, body_html, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (status) DO UPDATE SET
         subject = $2, body_html = $3, enabled = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [status, subject || '', body_html || '', enabled !== undefined ? enabled : true]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Send order status email to customer
router.post('/orders/:orderId/send-email', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const orderResult = await pool.query(
      `SELECT o.*, u.first_name, u.last_name, u.email as user_email,
              c.smtp_host, c.smtp_port, c.smtp_user, c.smtp_password,
              c.notification_email, c.email_provider, c.company_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN company_settings c ON c.id = 1
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const templateResult = await pool.query(
      'SELECT * FROM order_status_templates WHERE status = $1 AND enabled = true',
      [status]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'No email template found for this status' });
    }

    const tmpl = templateResult.rows[0];

    // Build placeholders
    const customerName = `${order.first_name || ''} ${order.last_name || ''}`.trim() || 'Customer';
    const replacements = {
      '{{customer_name}}': customerName,
      '{{order_number}}': order.order_number,
      '{{order_total}}': Number(order.final_amount || 0).toLocaleString('en-IN'),
      '{{courier_name}}': order.courier_name || 'N/A',
      '{{awb_number}}': order.awb_number || 'N/A',
      '{{order_items}}': 'Your Mornee order items'
    };

    let subject = tmpl.subject;
    let body = tmpl.body_html;
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
      body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
    }

    const companyName = order.company_name || 'Mornee';
    const senderEmail = order.notification_email || order.smtp_user || 'support@mornee.in';

    // Send email
    if (order.smtp_host && (order.smtp_user || order.email_provider)) {
      const transporter = nodemailer.createTransport(
        order.email_provider === 'smtp'
          ? {
              host: order.smtp_host,
              port: order.smtp_port || 587,
              secure: order.smtp_port === 465,
              auth: { user: order.smtp_user, pass: order.smtp_password }
            }
          : {
              host: order.smtp_host,
              port: order.smtp_port || 587,
              auth: { user: order.smtp_user, pass: order.smtp_password }
            }
      );

      await transporter.sendMail({
        from: `"${companyName}" <${senderEmail}>`,
        to: order.user_email,
        subject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                 <div style="background: #4d2f8e; color: white; padding: 20px; text-align: center;">
                   <h1 style="margin: 0;">${companyName}</h1>
                 </div>
                 <div style="padding: 30px;">${body}</div>
                 <div style="background: #f8f3fb; padding: 20px; text-align: center; font-size: 12px; color: #8d738b;">
                   <p style="margin: 0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                 </div>
               </div>`
      });

      // Update order status if provided
      if (status) {
        await pool.query('UPDATE orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, orderId]);
      }

      res.json({ message: 'Email sent successfully', status });
    } else {
      res.json({ message: 'Email template ready but SMTP not configured', status, subject, body });
    }
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});
router.post('/upload', authenticateToken, isAdmin, productImageUpload.array('images', 10), uploadProductImages);

router.get('/public/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url, sort_order, parent_id FROM categories WHERE is_active = true ORDER BY sort_order, name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get public categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

export default router;
