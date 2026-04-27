import pool from './src/config/database.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE company_settings 
      ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(100),
      ADD COLUMN IF NOT EXISTS smtp_port INT,
      ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(100),
      ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255),
      ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255)
    `);
    console.log('Added SMTP columns');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();