import pool from './src/config/database.js';

async function migrate() {
  try {
    // Add parent_id column to categories
    await pool.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
    `);
    console.log('Added parent_id column');

    // Add sort_order if not exists
    await pool.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `);
    console.log('Added sort_order column');

    // Set default sort_order for existing categories (they should already have it)
    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();