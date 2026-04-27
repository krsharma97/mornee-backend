import pkg from 'pg';
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
    const cols = await pool.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'categories' ORDER BY ordinal_position;`);
    console.log('COLUMNS:', cols.rows);
    const rows = await pool.query('SELECT id, name, slug, sort_order, parent_id, is_active FROM categories ORDER BY sort_order, id');
    console.log('ROWS:', rows.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
};

main();