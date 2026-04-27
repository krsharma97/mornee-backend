import bcrypt from 'bcryptjs';
import pool from '../src/config/database.js';

const adminEmail = 'admin@mornee.in';
const adminPassword = 'Admin@123';

const categories = [
  {
    name: "Dresses",
    slug: 'dresses',
    description: 'Elegant dresses for every occasion.',
    imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80',
    sortOrder: 1
  },
  {
    name: "Accessories",
    slug: 'accessories',
    description: 'Beautiful accessories to complete your look.',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
    sortOrder: 2
  },
  {
    name: 'Kurta Sets',
    slug: 'kurta-sets',
    description: 'Traditional and modern kurta sets.',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    sortOrder: 3
  }
];

const products = [
  {
    categorySlug: "kurta-sets",
    name: 'Hoodi and Trouser Set',
    slug: 'hoodi-and-trouser-set',
    description: 'Comfortable hoodi and trouser set for casual wear.',
    price: 550,
    discountPrice: null,
    stock: 10,
    sku: 'MOR-KURTA-001',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: true,
    rating: 4.5,
    reviewCount: 10,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Gray']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Kurta Bottom Dupatta Set',
    slug: 'kurta-bottom-dupatta-set',
    description: 'Elegant kurta bottom dupatta set for traditional occasions.',
    price: 1150,
    discountPrice: 1000,
    stock: 15,
    sku: 'MOR-KURTA-002',
    imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: true,
    rating: 4.8,
    reviewCount: 25,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Lime']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Party Wear Kurta Bottom Dupatta Set',
    slug: 'party-wear-kurta-bottom-dupatta-set',
    description: 'Beautiful party wear kurta bottom dupatta set.',
    price: 1595,
    discountPrice: null,
    stock: 8,
    sku: 'MOR-KURTA-003',
    imageUrl: 'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: true,
    rating: 4.9,
    reviewCount: 30,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Red', 'Gold']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Pure Cotton Kurta Bottom Dupatta Set',
    slug: 'pure-cotton-kurta-bottom-dupatta-set',
    description: 'Pure cotton kurta bottom dupatta set for comfort.',
    price: 1495,
    discountPrice: null,
    stock: 12,
    sku: 'MOR-KURTA-004',
    imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.6,
    reviewCount: 18,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['White', 'Blue']
  },
  {
    categorySlug: "dresses",
    name: 'Solid Color V-Neck Bow Tie Waist Dress',
    slug: 'solid-color-v-neck-bow-tie-waist-dress',
    description: 'Elegant V-neck dress with bow tie waist.',
    price: 1799,
    discountPrice: 1699,
    stock: 10,
    sku: 'MOR-DRESS-001',
    imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: true,
    rating: 4.7,
    reviewCount: 22,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Brown']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Unstitched Warm Suit and Bottom with Stole',
    slug: 'unstitched-warm-suit-and-bottom-with-stole',
    description: 'Premium winter collection unstitched suit with stole.',
    price: 1050,
    discountPrice: 850,
    stock: 20,
    sku: 'MOR-KURTA-005',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.5,
    reviewCount: 15,
    sizes: ['Free Size'],
    colors: ['Lavender', 'Olive Green', 'Pastel Lavender', 'Peach']
  },
  {
    categorySlug: "accessories",
    name: 'Vihan Bangle Set of 2',
    slug: 'vihan-bangle-set-of-2',
    description: 'Beautiful bangle set for traditional wear.',
    price: 999,
    discountPrice: 899,
    stock: 25,
    sku: 'MOR-ACC-001',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: true,
    rating: 4.8,
    reviewCount: 40,
    sizes: ['Free Size'],
    colors: ['Golden']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Warm Kurta Bottom and Dupatta Set',
    slug: 'warm-kurta-bottom-and-dupatta-set',
    description: 'Warm kurta set for winter season.',
    price: 1050,
    discountPrice: null,
    stock: 18,
    sku: 'MOR-KURTA-006',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.4,
    reviewCount: 12,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Red', 'Blue']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Warm Kurta Set with Stole',
    slug: 'warm-kurta-set-with-stole',
    description: 'Warm kurta set with stole for winter.',
    price: 1250,
    discountPrice: 1050,
    stock: 14,
    sku: 'MOR-KURTA-007',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.6,
    reviewCount: 20,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Desert Sand', 'Lime', 'Pink']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Warm Kurta Set with Stole Woolen',
    slug: 'warm-kurta-set-with-stole-woolen',
    description: 'Woolen warm kurta set with stole.',
    price: 1250,
    discountPrice: 1050,
    stock: 16,
    sku: 'MOR-KURTA-008',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.7,
    reviewCount: 18,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Peacock Blue', 'Wine']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Warm Unstitched Dress Material',
    slug: 'warm-unstitched-dress-material',
    description: 'Unstitched dress material for winter.',
    price: 1050,
    discountPrice: null,
    stock: 22,
    sku: 'MOR-KURTA-009',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.3,
    reviewCount: 8,
    sizes: ['Free Size'],
    colors: ['Various']
  },
  {
    categorySlug: "dresses",
    name: 'White Bralette Top',
    slug: 'white-bralette-top',
    description: 'Elegant white bralette top.',
    price: 1199,
    discountPrice: 1099,
    stock: 30,
    sku: 'MOR-DRESS-002',
    imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.5,
    reviewCount: 35,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['White']
  },
  {
    categorySlug: "kurta-sets",
    name: 'Women\'s Hoodies Set with Cap & Pocketed Hood',
    slug: 'womens-hoodies-set-with-cap-pocketed-hood',
    description: 'Comfortable hoodies set with cap and pocketed hood.',
    price: 550,
    discountPrice: 525,
    stock: 20,
    sku: 'MOR-KURTA-010',
    imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.4,
    reviewCount: 28,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Brown', 'Olive Green', 'Peacock Blue']
  },
  {
    categorySlug: "accessories",
    name: 'Woolen Shawl',
    slug: 'woolen-shawl',
    description: 'Warm woolen shawl for winter.',
    price: 700,
    discountPrice: null,
    stock: 15,
    sku: 'MOR-ACC-002',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80'],
    isFeatured: false,
    rating: 4.6,
    reviewCount: 50,
    sizes: ['Free Size'],
    colors: ['Various']
  }
];

function toSqlArray(values) {
  return Array.isArray(values) ? values : [];
}

try {
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const adminResult = await pool.query(
    `INSERT INTO users (email, password, first_name, last_name, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email)
     DO UPDATE SET
       password = EXCLUDED.password,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, email, role`,
    [adminEmail, hashedPassword, 'Mornee', 'Admin', 'admin', 'active']
  );

  const adminUser = adminResult.rows[0];

  for (const category of categories) {
    await pool.query(
      `INSERT INTO categories (name, slug, description, image_url, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (slug)
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         image_url = EXCLUDED.image_url,
         sort_order = EXCLUDED.sort_order,
         is_active = true`,
      [category.name, category.slug, category.description, category.imageUrl, category.sortOrder]
    );
  }

  const categoryLookupResult = await pool.query(
    'SELECT id, slug FROM categories WHERE slug = ANY($1::text[])',
    [categories.map((category) => category.slug)]
  );

  const categoryMap = new Map(
    categoryLookupResult.rows.map((row) => [row.slug, row.id])
  );

  for (const product of products) {
    const categoryId = categoryMap.get(product.categorySlug);

    if (!categoryId) {
      throw new Error(`Missing category for product seed: ${product.name}`);
    }

    const discountPercent = product.discountPrice
      ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
      : 0;

    await pool.query(
      `INSERT INTO products (
        category_id,
        shop_manager_id,
        name,
        slug,
        description,
        price,
        discount_price,
        discount_percent,
        stock,
        sku,
        image_url,
        gallery_images,
        is_active,
        is_featured,
        rating,
        review_count,
        sizes,
        colors
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, $14, $15, $16, $17
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        shop_manager_id = EXCLUDED.shop_manager_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        discount_price = EXCLUDED.discount_price,
        discount_percent = EXCLUDED.discount_percent,
        stock = EXCLUDED.stock,
        sku = EXCLUDED.sku,
        image_url = EXCLUDED.image_url,
        gallery_images = EXCLUDED.gallery_images,
        is_active = true,
        is_featured = EXCLUDED.is_featured,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        sizes = EXCLUDED.sizes,
        colors = EXCLUDED.colors,
        updated_at = CURRENT_TIMESTAMP`,
      [
        categoryId,
        adminUser.id,
        product.name,
        product.slug,
        product.description,
        product.price,
        product.discountPrice,
        discountPercent,
        product.stock,
        product.sku,
        product.imageUrl,
        toSqlArray(product.galleryImages),
        product.isFeatured,
        product.rating,
        product.reviewCount,
        toSqlArray(product.sizes),
        toSqlArray(product.colors)
      ]
    );
  }

  console.log(`Admin user ready: ${adminEmail} / ${adminPassword}`);
  console.log(`Seeded ${categories.length} categories and ${products.length} sample products.`);
} catch (error) {
  console.error('Failed to seed database:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
