import pool from './src/config/database.js';

const imageMap = {
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/dress1/800/1000',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/shirt1/800/1000',
  'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/coords1/800/1000',
  'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/chinos1/800/1000',
  'https://images.unsplash.com/photo-1514090458221-65bb69cf63e6?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/jacket1/800/1000',
  'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/bag1/800/1000',
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/kurta1/800/1000',
  'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/kurta2/800/1000',
  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80': 'https://picsum.photos/seed/fabric1/800/1000',
};

const fixImages = async () => {
  let updated = 0;
  for (const [old, replacement] of Object.entries(imageMap)) {
    const result = await pool.query(
      'UPDATE products SET image_url = $1 WHERE image_url = $2',
      [replacement, old]
    );
    if (result.rowCount > 0) {
      console.log(`Updated ${result.rowCount} products with: ${replacement}`);
      updated += result.rowCount;
    }
  }
  console.log(`Total updated: ${updated}`);
  process.exit(0);
};

fixImages();