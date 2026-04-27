import pool from './src/config/database.js';

async function migrate() {
  try {
    // Sizes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_sizes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        sort_order INT DEFAULT 0
      )
    `);
    
    // Fabrics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_fabrics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);
    
    // Product types table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);
    
    // Occasions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_occasions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);
    
    // Standard colors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_colors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        hex_code VARCHAR(10)
      )
    `);
    
    console.log('Tables created!');
    
    // Seed standard data
    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free Size', 'One Size', '30', '32', '34', '36', '38', '40', '42', '44',
      '3-4Y', '5-6Y', '7-8Y', '9-10Y', '11-12Y', '13-14Y'];
    for (let i = 0; i < sizes.length; i++) {
      await pool.query(`INSERT INTO product_sizes (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [sizes[i], i]);
    }
    
    const fabrics = ['Cotton', 'Linen', 'Silk', 'Chiffon', 'Georgette', 'Crepe', 'Satin', 'Velvet', 'Wool', 'Cashmere', 
      'Polyester', 'Rayon', 'Modal', 'Bamboo', 'Mulmul', 'Organza', 'Net', 'Jacquard', 'Cotton Silk', 'Cotton Linen'];
    for (const f of fabrics) {
      await pool.query(`INSERT INTO product_fabrics (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [f]);
    }
    
    const types = ['Western Wear', 'Ethnic Wear', 'Casual', 'Formal', 'Party', 'Festive', 'Wedding', 'Sports', 'Sleepwear', 'Innerwear', 
      'Winter Wear', 'Summer Wear', 'Beachwear', 'Curated Set', 'Co-ord Set', 'Anarkali', 'A-Line', 'Kurti', 'Palazzo Set'];
    for (const t of types) {
      await pool.query(`INSERT INTO product_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [t]);
    }
    
    const occasions = ['Casual', 'Formal', 'Party', 'Wedding', 'Festival', 'Daily', 'Office', 'Beach', 'Pool Party', 'Birthday', 
      'Anniversary', 'Date Night', 'Friends Gathering', 'Puja', 'Karwachauth', 'Diwali', 'Holi', 'Navratri'];
    for (const o of occasions) {
      await pool.query(`INSERT INTO product_occasions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [o]);
    }
    
    const colors = [
      ['Red', '#FF0000'], ['Blue', '#0000FF'], ['Green', '#008000'], ['Yellow', '#FFFF00'], ['Orange', '#FFA500'],
      ['Pink', '#FFC0CB'], ['Purple', '#800080'], ['Brown', '#A52A2A'], ['Black', '#000000'], ['White', '#FFFFFF'],
      ['Navy', '#000080'], ['Maroon', '#800000'], ['Beige', '#F5F5DC'], ['Grey', '#808080'], ['Gold', '#FFD700'],
      ['Silver', '#C0C0C0'], ['Lavender', '#E6E6FA'], ['Peach', '#FFDAB9'], ['Olive', '#808000'],
      ['Burgundy', '#800020'], ['Mint', '#98FF98'], ['Coral', '#FF7F50'], ['Sky Blue', '#87CEEB'],
      ['Ivory', '#FFFFF0'], ['Rose', '#FF007F'], ['Wine', '#722F37'], ['Turquoise', '#40E0D0'],
      ['Mustard', '#FFDB58'], ['Teal', '#008080'], ['Cream', '#FFFDD0'], ['Magenta', '#FF00FF']
    ];
    for (const c of colors) {
      await pool.query(`INSERT INTO product_colors (name, hex_code) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [c[0], c[1]]);
    }
    
    console.log('Standard data seeded!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();