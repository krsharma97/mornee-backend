import pool from './src/config/database.js';

await pool.query(`
  CREATE TABLE IF NOT EXISTS homepage_banners (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    link VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  INSERT INTO homepage_banners (image_url, title, subtitle, sort_order) VALUES
  ('https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1400&q=80', 'New Arrivals 2026', 'Trending kurtis & designer suits', 1),
  ('https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1400&q=80', 'Kids Summer Collection', 'Adorable dresses & party wear', 2),
  ('https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1400&q=80', 'Accessories Edit', 'Complete your look', 3)
  ON CONFLICT DO NOTHING
`);

console.log('homepage_banners table created and seeded');
await pool.end();