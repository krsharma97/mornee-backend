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
import { buildEmailShell, getCompanyEmailSettings, sendCompanyEmail, sendEmailWithSettings } from '../utils/email.js';

const router = express.Router();
const ORDER_NOTIFICATION_STATUSES = ['processing', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'cancelled'];

const ensureOrderNotificationRows = async () => {
  for (const status of ORDER_NOTIFICATION_STATUSES) {
    await pool.query(
      `INSERT INTO order_notifications (status, enabled)
       VALUES ($1, true)
       ON CONFLICT (status) DO NOTHING`,
      [status]
    );
  }
};
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
    if (isActive) {
      await pool.query('UPDATE email_providers SET is_active = false WHERE is_active = true');
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
    const { providerName, providerType, config, isActive } = req.body;
    if (isActive) {
      await pool.query('UPDATE email_providers SET is_active = false WHERE id <> $1', [id]);
    }
    const result = await pool.query(
      `UPDATE email_providers
       SET provider_name = COALESCE($1, provider_name),
           provider_type = COALESCE($2, provider_type),
           config = COALESCE($3, config),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [providerName, providerType, config ? JSON.stringify(config) : null, isActive, id]
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

router.post('/settings/test-email', authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      to,
      subject,
      html,
      text,
      config = {}
    } = req.body;

    const companySettings = await getCompanyEmailSettings();
    if (!companySettings) {
      return res.status(404).json({ error: 'Company settings not found' });
    }

    const mergedSettings = {
      ...companySettings,
      company_name: config.companyName ?? companySettings.company_name,
      email_provider: config.emailProvider ?? companySettings.email_provider,
      smtp_host: config.smtpHost ?? companySettings.smtp_host,
      smtp_port: config.smtpPort ?? companySettings.smtp_port,
      smtp_user: config.smtpUser ?? companySettings.smtp_user,
      smtp_password: config.smtpPassword || companySettings.smtp_password,
      notification_email: config.notificationEmail ?? companySettings.notification_email,
      email: config.email ?? companySettings.email
    };

    const recipient =
      to ||
      mergedSettings.notification_email ||
      mergedSettings.email ||
      mergedSettings.smtp_user;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient email is required for test email.' });
    }

    const finalSubject = subject || `Mornee test email via ${mergedSettings.email_provider || 'smtp'}`;
    const finalHtml = buildEmailShell({
      companyName: mergedSettings.company_name || 'Mornee',
      body: html || `
        <h2>Test Email</h2>
        <p>This is a test email from Mornee.</p>
        <p>Provider: <strong>${mergedSettings.email_provider || 'smtp'}</strong></p>
        <p>If you received this, your email configuration is working.</p>
      `
    });

    const result = await sendEmailWithSettings(mergedSettings, {
      to: recipient,
      subject: finalSubject,
      html: finalHtml,
      text
    });

    res.json({
      message: `Test email sent successfully via ${result.provider}.`,
      provider: result.provider,
      to: recipient
    });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Failed to send test email: ' + err.message });
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

router.get('/settings/order-notifications', authenticateToken, isAdmin, async (req, res) => {
  try {
    await ensureOrderNotificationRows();
    const result = await pool.query(
      'SELECT status, enabled FROM order_notifications ORDER BY status'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get order notifications error:', err);
    res.status(500).json({ error: 'Failed to load order notifications' });
  }
});

router.put('/settings/order-notifications/:status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.params;
    const { enabled } = req.body;

    if (!ORDER_NOTIFICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order notification status' });
    }

    await ensureOrderNotificationRows();

    const result = await pool.query(
      `INSERT INTO order_notifications (status, enabled)
       VALUES ($1, $2)
       ON CONFLICT (status) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_at = CURRENT_TIMESTAMP
       RETURNING status, enabled`,
      [status, Boolean(enabled)]
    );

    res.json({
      message: 'Order notification updated successfully',
      notification: result.rows[0]
    });
  } catch (err) {
    console.error('Update order notification error:', err);
    res.status(500).json({ error: 'Failed to update order notification' });
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
    const effectiveStatus = status || null;

    if (effectiveStatus) {
      await ensureOrderNotificationRows();
      const toggleResult = await pool.query(
        'SELECT enabled FROM order_notifications WHERE status = $1',
        [effectiveStatus]
      );

      if (toggleResult.rows.length > 0 && toggleResult.rows[0].enabled === false) {
        return res.status(409).json({ error: `Order notification for ${effectiveStatus} is turned off.` });
      }
    }

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
    const templateStatus = effectiveStatus || order.order_status;
    const templateResult = await pool.query(
      'SELECT * FROM order_status_templates WHERE status = $1 AND enabled = true',
      [templateStatus]
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

    await sendCompanyEmail({
      to: order.user_email,
      subject,
      html: buildEmailShell({
        companyName: order.company_name || 'Mornee',
        body
      })
    });

    if (status) {
      await pool.query('UPDATE orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, orderId]);
    }

    res.json({ message: 'Email sent successfully', status });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});
router.post(
  '/upload',
  authenticateToken,
  isAdmin,
  productImageUpload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 10 }
  ]),
  (err, req, res, next) => {
    if (err) {
      console.error('Multer error:', err.message, err.code);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  },
  uploadProductImages
);

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
