import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const main = async () => {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
    console.log('TABLES:', tables.rows.map((row) => row.table_name));
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await pool.end();
  }
};

main();