import pool from './src/config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE company_settings 
      ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS default_tax_percent DECIMAL(5,2) DEFAULT 5.00
    `);
    console.log('Added hsn_code and default_tax_percent to company_settings');

    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2)
    `);
    console.log('Added tax_percent to products');

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();