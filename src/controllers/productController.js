import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const parseArrayField = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return value;
};

const buildSlug = (name) =>
  `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${uuidv4().substring(0, 8)}`;

const normalizeVariant = (variant) => ({
  variantName: variant.variantName || variant.variant_name || null,
  size: variant.size || null,
  color: variant.color || null,
  sku: variant.sku || uuidv4().substring(0, 12),
  stock: Number(variant.stock || 0),
  priceAdjustment: Number(variant.priceAdjustment || variant.price_adjustment || 0),
  imageUrl: variant.imageUrl || variant.image_url || null,
  isActive: variant.isActive ?? variant.is_active ?? true
});

const syncVariants = async (client, productId, variants) => {
  await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

  for (const variant of variants) {
    const normalized = normalizeVariant(variant);

    await client.query(
      `INSERT INTO product_variants
       (product_id, variant_name, size, color, sku, stock, price_adjustment, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        productId,
        normalized.variantName,
        normalized.size,
        normalized.color,
        normalized.sku,
        normalized.stock,
        normalized.priceAdjustment,
        normalized.imageUrl,
        normalized.isActive
      ]
    );
  }
};

export const getProducts = async (req, res) => {
  try {
    const { category, page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT p.*,
             c.name AS category_name,
             (
               SELECT COUNT(*)
               FROM product_variants pv
               WHERE pv.product_id = p.id AND COALESCE(pv.is_active, true) = true
             ) AS variants_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = true
    `;
    const params = [];

    if (category) {
      query += ' AND p.category_id = $' + (params.length + 1);
      params.push(category);
    }

    if (search) {
      // Basic fuzzy search on name/description, plus a normalization pass to catch cases like t-shirt vs tshirt
      const searchParam = `%${search}%`;
      const norm = search.replace(/[-\s]/g, '');
      const normParam = `%${norm}%`;
      const idx1 = params.length + 1;
      const idx2 = idx1 + 1;
      query += ` AND (p.name ILIKE $${idx1} OR p.description ILIKE $${idx1} OR LOWER(regexp_replace(p.name, '[-\\s]', '', 'g')) LIKE LOWER($${idx2}) OR LOWER(regexp_replace(p.description, '[-\\s]', '', 'g')) LIKE LOWER($${idx2}))`;
      params.push(searchParam, normParam);
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE is_active = true');

    res.json({
      products: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    const variantsResult = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY color NULLS LAST, size NULLS LAST',
      [id]
    );

    const reviewsResult = await pool.query(
      'SELECT * FROM reviews WHERE product_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 5',
      [id, 'approved']
    );

    res.json({
      ...product,
      variants: variantsResult.rows,
      reviews: reviewsResult.rows
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
};

export const createProduct = async (req, res) => {
  const client = await pool.connect();

  try {
    const shopManagerId = req.user.userId;
    const {
      categoryId,
      name,
      description,
      price,
      discountPrice,
      stock,
      sku,
      sizes,
      colors,
      imageUrl,
      galleryImages,
      productType,
      fabric,
      occasion,
      careInstructions,
      sizeChart,
      variants,
      isFeatured,
      isActive,
      taxPercent
    } = req.body;

    if (!name || !categoryId || price === undefined || price === null || price === '') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedVariants = parseJsonField(variants, []);
    const parsedSizeChart = parseJsonField(sizeChart, []);
    const parsedSizes = parseArrayField(sizes);
    const parsedColors = parseArrayField(colors);
    const parsedGalleryImages = parseArrayField(galleryImages);
    const computedStock = stock !== undefined && stock !== null && stock !== ''
      ? Number(stock)
      : Array.isArray(parsedVariants)
        ? parsedVariants.reduce((sum, item) => sum + Number(item.stock || 0), 0)
        : 0;
    const numericPrice = Number(price);
    const numericDiscountPrice =
      discountPrice !== undefined && discountPrice !== null && discountPrice !== ''
        ? Number(discountPrice)
        : null;
    const discountPercent = numericDiscountPrice
      ? Math.round(((numericPrice - numericDiscountPrice) / numericPrice) * 100)
      : 0;

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO products
       (
         category_id, shop_manager_id, name, slug, description, price, discount_price,
         discount_percent, stock, sku, image_url, gallery_images, sizes, colors,
         product_type, fabric, occasion, care_instructions, size_chart_json,
         is_featured, is_active, tax_percent
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19,
         $20, $21, $22
       )
       RETURNING *`,
      [
        Number(categoryId),
        shopManagerId,
        name,
        buildSlug(name),
        description || null,
        numericPrice,
        numericDiscountPrice,
        discountPercent,
        computedStock,
        sku || uuidv4().substring(0, 12),
        imageUrl || null,
        parsedGalleryImages,
        parsedSizes,
        parsedColors,
        productType || null,
        fabric || null,
        occasion || null,
        careInstructions || null,
        JSON.stringify(Array.isArray(parsedSizeChart) ? parsedSizeChart : []),
        Boolean(isFeatured),
        isActive === undefined ? true : Boolean(isActive),
        taxPercent ? Number(taxPercent) : null
      ]
    );

    const product = result.rows[0];

    if (Array.isArray(parsedVariants) && parsedVariants.length > 0) {
      await syncVariants(client, product.id, parsedVariants);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  } finally {
    client.release();
  }
};

export const updateProduct = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const shopManagerId = req.user.userId;

    const existingResult = await client.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existing = existingResult.rows[0];

    if (Number(existing.shop_manager_id) !== Number(shopManagerId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to update this product' });
    }

    const parsedVariants =
      req.body.variants !== undefined ? parseJsonField(req.body.variants, []) : undefined;
    const parsedSizeChart =
      req.body.sizeChart !== undefined ? parseJsonField(req.body.sizeChart, []) : undefined;

    const nextPrice =
      req.body.price !== undefined && req.body.price !== null && req.body.price !== ''
        ? Number(req.body.price)
        : Number(existing.price);
    const nextDiscountPrice =
      req.body.discountPrice !== undefined
        ? (req.body.discountPrice === null || req.body.discountPrice === '' ? null : Number(req.body.discountPrice))
        : existing.discount_price;
    const nextStock =
      req.body.stock !== undefined && req.body.stock !== null && req.body.stock !== ''
        ? Number(req.body.stock)
        : existing.stock;
    const nextSizes =
      req.body.sizes !== undefined ? parseArrayField(req.body.sizes) : existing.sizes;
    const nextColors =
      req.body.colors !== undefined ? parseArrayField(req.body.colors) : existing.colors;
    const nextGalleryImages =
      req.body.galleryImages !== undefined ? parseArrayField(req.body.galleryImages) : existing.gallery_images;
    const discountPercent = nextDiscountPrice
      ? Math.round(((nextPrice - nextDiscountPrice) / nextPrice) * 100)
      : 0;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE products
       SET category_id = $1,
           name = $2,
           description = $3,
           price = $4,
           discount_price = $5,
           discount_percent = $6,
           stock = $7,
           sku = $8,
           image_url = $9,
           gallery_images = $10,
           sizes = $11,
           colors = $12,
           product_type = $13,
           fabric = $14,
           occasion = $15,
           care_instructions = $16,
           size_chart_json = $17,
           is_active = $18,
           is_featured = $19,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $20
       RETURNING *`,
      [
        req.body.categoryId !== undefined ? Number(req.body.categoryId) : existing.category_id,
        req.body.name ?? existing.name,
        req.body.description ?? existing.description,
        nextPrice,
        nextDiscountPrice,
        discountPercent,
        nextStock,
        req.body.sku ?? existing.sku,
        req.body.imageUrl ?? existing.image_url,
        nextGalleryImages,
        nextSizes,
        nextColors,
        req.body.productType ?? existing.product_type,
        req.body.fabric ?? existing.fabric,
        req.body.occasion ?? existing.occasion,
        req.body.careInstructions ?? existing.care_instructions,
        JSON.stringify(parsedSizeChart !== undefined ? parsedSizeChart : existing.size_chart_json || []),
        req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active,
        req.body.isFeatured !== undefined ? Boolean(req.body.isFeatured) : existing.is_featured,
        id
      ]
    );

    if (parsedVariants !== undefined) {
      await syncVariants(client, id, Array.isArray(parsedVariants) ? parsedVariants : []);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Product updated successfully',
      product: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  } finally {
    client.release();
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const shopManagerId = req.user.userId;

    const checkResult = await pool.query(
      'SELECT shop_manager_id FROM products WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (Number(checkResult.rows[0].shop_manager_id) !== Number(shopManagerId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this product' });
    }

    await pool.query('DELETE FROM products WHERE id = $1', [id]);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM products
       WHERE is_active = true AND is_featured = true
       ORDER BY created_at DESC LIMIT 12`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({ error: 'Failed to get featured products' });
  }
};
