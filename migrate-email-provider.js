import pool from './src/config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE company_settings 
      ADD COLUMN IF NOT EXISTS email_provider VARCHAR(50) DEFAULT 'smtp'
    `);
    console.log('Added email_provider column');
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

migrate();