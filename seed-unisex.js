import pool from './src/config/database.js';

const charts = [
  { size: 'XS', bust: '31-33', waist: '24-26', hip: '34-36', sort_order: 1 },
  { size: 'S', bust: '33-35', waist: '26-28', hip: '36-38', sort_order: 2 },
  { size: 'M', bust: '35-37', waist: '28-30', hip: '38-40', sort_order: 3 },
  { size: 'L', bust: '37-39', waist: '30-32', hip: '40-42', sort_order: 4 },
  { size: 'XL', bust: '39-41', waist: '32-34', hip: '42-44', sort_order: 5 },
  { size: 'XXL', bust: '41-43', waist: '34-36', hip: '44-46', sort_order: 6 },
];

async function migrate() {
  await pool.query("DELETE FROM size_chart WHERE type = 'unisex'");
  
  for (const chart of charts) {
    await pool.query(
      'INSERT INTO size_chart (type, size, bust, waist, hip, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
      ['unisex', chart.size, chart.bust, chart.waist, chart.hip, chart.sort_order]
    );
  }
  console.log('Added Unisex size chart');
  await pool.end();
}

migrate();