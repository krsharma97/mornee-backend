import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const uploadsPath = path.resolve(__dirname, '../uploads/products');

try {
  await fs.mkdir(uploadsPath, { recursive: true });

  const existingUsersTable = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `);

  if (existingUsersTable.rows[0]?.exists) {
    console.log('Database schema already exists. Skipping schema creation.');
  } else {
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await pool.query(schemaSql);
    console.log('Database schema applied successfully.');
  }

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fabric VARCHAR(100),
    ADD COLUMN IF NOT EXISTS occasion VARCHAR(100),
    ADD COLUMN IF NOT EXISTS care_instructions TEXT,
    ADD COLUMN IF NOT EXISTS size_chart_json JSONB DEFAULT '[]'::jsonb
  `);

  await pool.query(`
    ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS variant_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS price_adjustment DECIMAL(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INT PRIMARY KEY DEFAULT 1,
      company_name VARCHAR(255),
      legal_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(30),
      website VARCHAR(255),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal_code VARCHAR(20),
      country VARCHAR(100) DEFAULT 'India',
      pan VARCHAR(30),
      gst VARCHAR(30),
      invoice_prefix VARCHAR(20) DEFAULT 'INV',
      support_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT company_settings_singleton CHECK (id = 1)
    )
  `);

  await pool.query(`
    ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255),
    ADD COLUMN IF NOT EXISTS smtp_port INT,
    ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255),
    ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255),
    ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS email_provider VARCHAR(50) DEFAULT 'smtp'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_gateway_settings (
      id SERIAL PRIMARY KEY,
      gateway_key VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      merchant_id VARCHAR(255),
      api_key VARCHAR(255),
      is_enabled BOOLEAN DEFAULT false,
      environment VARCHAR(20) DEFAULT 'test',
      config_encrypted TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE payment_gateway_settings
    ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS api_key VARCHAR(255)
  `);

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS label_generated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dispatch_notes TEXT
  `);

  await pool.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS gateway_name VARCHAR(50),
    ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS gateway_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS masked_payment_details VARCHAR(255),
    ADD COLUMN IF NOT EXISTS gateway_response JSONB DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    INSERT INTO company_settings (id, company_name, legal_name, country, invoice_prefix)
    VALUES (1, 'Mornee', 'Mornee', 'India', 'INV')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO payment_gateway_settings (gateway_key, display_name, is_enabled, environment)
    VALUES
      ('phonepe', 'PhonePe', false, 'test'),
      ('razorpay', 'Razorpay', false, 'test'),
      ('cod', 'Cash on Delivery', false, 'live')
    ON CONFLICT (gateway_key) DO NOTHING
  `);

  console.log('Extended catalog fields ensured successfully.');
  console.log('Admin settings, payment gateways, and order document fields ensured successfully.');

  // Create order_notifications table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_notifications (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) NOT NULL UNIQUE,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default statuses
  const statuses = ['processing','packed','shipped','out-for-delivery','delivered','cancelled'];
  for (const s of statuses) {
    await pool.query(
      `INSERT INTO order_notifications (status, enabled) VALUES ($1, true) ON CONFLICT (status) DO NOTHING`,
      [s]
    );
  }
  console.log('Order notifications table ready.');

  // Order status email templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_status_templates (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) NOT NULL UNIQUE,
      subject VARCHAR(255) DEFAULT '',
      body_html TEXT DEFAULT '',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default email templates for each status
  const defaultTemplates = [
    {
      status: 'processing',
      subject: 'Your Mornee Order is Being Processed',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Great news! Your order <strong>#{{order_number}}</strong> of <strong>₹{{order_total}}</strong> has been received and is now being processed.</p><p>We'll keep you updated at every step. You can track your order anytime at: <a href="https://mornee.in/orders">mornee.in/orders</a></p><p>Thank you for shopping with Mornee!</p><p>— The Mornee Team</p>`
    },
    {
      status: 'packed',
      subject: 'Your Mornee Order is Packed & Ready',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Your order <strong>#{{order_number}}</strong> has been packed and is ready for pickup by our courier partner.</p><p>Items: {{order_items}}</p><p>Total: ₹{{order_total}}</p><p>We'll share tracking details soon. Track your order: <a href="https://mornee.in/orders">mornee.in/orders</a></p><p>— The Mornee Team</p>`
    },
    {
      status: 'shipped',
      subject: 'Your Mornee Order Has Been Shipped!',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Your order <strong>#{{order_number}}</strong> has been shipped!</p><p>Courier: {{courier_name}}<br>Tracking/AWB: {{awb_number}}</p><p>Items: {{order_items}}</p><p>Total: ₹{{order_total}}</p><p>Track your package: <a href="https://mornee.in/orders">mornee.in/orders</a></p><p>— The Mornee Team</p>`
    },
    {
      status: 'out-for-delivery',
      subject: 'Your Mornee Order is Out for Delivery!',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Exciting news! Your order <strong>#{{order_number}}</strong> is out for delivery and will reach you today.</p><p>Courier: {{courier_name}}<br>AWB: {{awb_number}}</p><p>Please ensure someone is available to receive it. Track: <a href="https://mornee.in/orders">mornee.in/orders</a></p><p>— The Mornee Team</p>`
    },
    {
      status: 'delivered',
      subject: 'Your Mornee Order Has Been Delivered!',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Your order <strong>#{{order_number}}</strong> has been delivered!</p><p>Items: {{order_items}}</p><p>Total: ₹{{order_total}}</p><p>We hope you love your purchase! If you have any questions, we're here to help: <a href="https://mornee.in/contact">mornee.in/contact</a></p><p>Leave a review and share your experience! <a href="https://mornee.in/shop">mornee.in/shop</a></p><p>— The Mornee Team</p>`
    },
    {
      status: 'cancelled',
      subject: 'Your Mornee Order Has Been Cancelled',
      body_html: `<h2>Hi {{customer_name}},</h2><p>Your order <strong>#{{order_number}}</strong> has been cancelled.</p><p>If payment was made, it will be refunded within 5-7 business days.</p><p>For any queries, contact us: <a href="https://mornee.in/contact">mornee.in/contact</a></p><p>— The Mornee Team</p>`
    }
  ];

  for (const t of defaultTemplates) {
    await pool.query(
      `INSERT INTO order_status_templates (status, subject, body_html, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (status) DO NOTHING`,
      [t.status, t.subject, t.body_html]
    );
  }
  console.log('Order status email templates ready.');

  // Email providers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_providers (
      id SERIAL PRIMARY KEY,
      provider_name VARCHAR(100) NOT NULL,
      provider_type VARCHAR(50) NOT NULL,
      config JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Email providers table ready.');

} catch (error) {
  console.error('Failed to apply database schema:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
