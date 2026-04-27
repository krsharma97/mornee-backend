import pool from './src/config/database.js';

export default async function migrateSizeChart() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS size_chart (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      size VARCHAR(20) NOT NULL,
      chest VARCHAR(20),
      waist VARCHAR(20),
      hip VARCHAR(20),
      bust VARCHAR(20),
      shoulder VARCHAR(20),
      length VARCHAR(20),
      sort_order INT DEFAULT 0
    )
  `);

  const charts = [
    { type: 'women', size: 'XS', bust: '32-34', waist: '26-28', hip: '34-36', sort_order: 1 },
    { type: 'women', size: 'S', bust: '34-36', waist: '28-30', hip: '36-38', sort_order: 2 },
    { type: 'women', size: 'M', bust: '36-38', waist: '30-32', hip: '38-40', sort_order: 3 },
    { type: 'women', size: 'L', bust: '38-40', waist: '32-34', hip: '40-42', sort_order: 4 },
    { type: 'women', size: 'XL', bust: '40-42', waist: '34-36', hip: '42-44', sort_order: 5 },
    { type: 'women', size: 'XXL', bust: '42-44', waist: '36-38', hip: '44-46', sort_order: 6 },
    { type: 'women', size: '3XL+', bust: '44-50', waist: '38-46', hip: '46-55', sort_order: 7 },
    { type: 'men', size: 'S', chest: '36-38', waist: '30-32', shoulder: '17-17.5', sort_order: 1 },
    { type: 'men', size: 'M', chest: '38-40', waist: '32-34', shoulder: '17.5-18', sort_order: 2 },
    { type: 'men', size: 'L', chest: '40-42', waist: '34-36', shoulder: '18-18.5', sort_order: 3 },
    { type: 'men', size: 'XL', chest: '42-44', waist: '36-38', shoulder: '18.5-19', sort_order: 4 },
    { type: 'men', size: 'XXL', chest: '44-46', waist: '38-40', shoulder: '19-19.5', sort_order: 5 },
    { type: 'men', size: '3XL', chest: '46-48', waist: '40-42', shoulder: '19.5-20', sort_order: 6 },
    { type: 'kids', size: '10-14', length: '50-75', waist: '38-46', hip: '40-48', sort_order: 1 },
    { type: 'kids', size: '16-18', length: '75-95', waist: '46-50', hip: '50-54', sort_order: 2 },
    { type: 'kids', size: '20-22', length: '95-110', waist: '50-54', hip: '54-58', sort_order: 3 },
    { type: 'kids', size: '24-28', length: '110-128', waist: '54-58', hip: '58-64', sort_order: 4 },
    { type: 'kids', size: '30-36', length: '128-152', waist: '58-64', hip: '64-72', sort_order: 5 },
    { type: 'unisex', size: 'S', sort_order: 1 },
    { type: 'unisex', size: 'M', sort_order: 2 },
    { type: 'unisex', size: 'L', sort_order: 3 },
    { type: 'unisex', size: 'XL', sort_order: 4 },
    { type: 'unisex', size: 'XXL', sort_order: 5 },
  ];

  for (const chart of charts) {
    await pool.query(
      `INSERT INTO size_chart (type, size, chest, waist, hip, bust, shoulder, length, sort_order) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [chart.type, chart.size, chart.chest || null, chart.waist || null, chart.hip || null, 
       chart.bust || null, chart.shoulder || null, chart.length || null, chart.sort_order]
    );
  }
  console.log('Size chart migration complete');
}