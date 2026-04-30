import pool from './src/config/database.js';

pool.query(`
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'order_notifications'
`).then(r => {
  console.log('order_notifications columns:');
  r.rows.forEach(c => console.log(' ', c.column_name));
  pool.end();
}).catch(e => {
  console.error(e.message);
  pool.end();
});
