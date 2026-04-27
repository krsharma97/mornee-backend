import pool from './src/config/database.js';

export default async function migrateOrderNotifications() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_notifications (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) NOT NULL UNIQUE,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default statuses if not present
  const statuses = ['processing','packed','shipped','out-for-delivery','delivered','cancelled'];
  for (const s of statuses) {
    await pool.query(
      `INSERT INTO order_notifications (status, enabled) VALUES ($1, true)
       ON CONFLICT (status) DO NOTHING`,
      [s]
    );
  }
  console.log('Order notifications table seeded');
  await pool.end();
}
