import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixSchema() {
  try {
    console.log('🔧 Fixing Prisma database schema...\n');

    // Fix products table - add missing columns
    console.log('📝 Updating products table...');
    const productsAlters = [
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(100)`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS fabric VARCHAR(100)`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS occasion VARCHAR(100)`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS size_chart_json JSONB`,
    ];

    for (const alter of productsAlters) {
      try {
        await targetPool.query(alter);
        console.log(`  ✅ ${alter.split('ADD COLUMN')[1].split('VARCHAR')[0].trim()}`);
      } catch (e) {
        console.log(`  ⚠️  ${e.message}`);
      }
    }

    // Fix company_settings table - drop and recreate with proper schema
    console.log('\n📝 Updating company_settings table...');
    try {
      await targetPool.query(`DROP TABLE IF EXISTS company_settings CASCADE`);
      console.log('  ✅ Dropped old company_settings');

      await targetPool.query(`
        CREATE TABLE company_settings (
          id SERIAL PRIMARY KEY,
          company_name VARCHAR(255),
          legal_name VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(20),
          website VARCHAR(255),
          address_line1 VARCHAR(255),
          address_line2 VARCHAR(255),
          city VARCHAR(100),
          state VARCHAR(100),
          postal_code VARCHAR(20),
          country VARCHAR(100),
          pan VARCHAR(50),
          gst VARCHAR(50),
          invoice_prefix VARCHAR(50),
          support_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✅ Created new company_settings table');
    } catch (e) {
      console.log(`  ⚠️  ${e.message}`);
    }

    // Fix payment_gateway_settings table - drop and recreate with proper schema
    console.log('\n📝 Updating payment_gateway_settings table...');
    try {
      await targetPool.query(`DROP TABLE IF EXISTS payment_gateway_settings CASCADE`);
      console.log('  ✅ Dropped old payment_gateway_settings');

      await targetPool.query(`
        CREATE TABLE payment_gateway_settings (
          id SERIAL PRIMARY KEY,
          gateway_key VARCHAR(100) NOT NULL UNIQUE,
          display_name VARCHAR(255) NOT NULL,
          is_enabled BOOLEAN DEFAULT false,
          environment VARCHAR(50),
          config_encrypted TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✅ Created new payment_gateway_settings table');
    } catch (e) {
      console.log(`  ⚠️  ${e.message}`);
    }

    console.log('\n✅ Schema fixes completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await targetPool.end();
  }
}

fixSchema();
