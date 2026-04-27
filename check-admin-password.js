import pkg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'mornee_db',
});

const main = async () => {
  try {
    const res = await pool.query('SELECT email, password, role, status FROM users WHERE email = $1', ['admin@mornee.in']);
    console.log(res.rows);
    if (res.rows.length > 0) {
      const match = await bcrypt.compare('Admin@123', res.rows[0].password);
      console.log('match Admin@123 =', match);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
};

main();
