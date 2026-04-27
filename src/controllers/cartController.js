import pool from '../config/database.js';

export const getCart = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT 
        c.id, c.product_id, c.quantity, c.size, c.color,
        p.name, p.price, p.discount_price, p.image_url, p.stock
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.added_at DESC`,
      [userId]
    );

    const cartItems = result.rows;
    const total = cartItems.reduce((sum, item) => {
      const price = item.discount_price || item.price;
      return sum + (price * item.quantity);
    }, 0);

    res.json({ items: cartItems, total });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
};

export const addToCart = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productId, quantity = 1, size, color } = req.body;

    // Check if product exists
    const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if already in cart
    const existingItem = await pool.query(
      `SELECT id, quantity FROM cart 
       WHERE user_id = $1 AND product_id = $2 AND size = $3 AND color = $4`,
      [userId, productId, size || null, color || null]
    );

    let result;
    if (existingItem.rows.length > 0) {
      // Update quantity
      result = await pool.query(
        `UPDATE cart 
         SET quantity = quantity + $1 
         WHERE id = $2
         RETURNING *`,
        [quantity, existingItem.rows[0].id]
      );
    } else {
      // Add new item
      result = await pool.query(
        `INSERT INTO cart (user_id, product_id, quantity, size, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, productId, quantity, size || null, color || null]
      );
    }

    res.status(201).json({
      message: 'Item added to cart',
      cartItem: result.rows[0]
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.params;
    const { quantity } = req.body;

    // Check ownership
    const itemCheck = await pool.query('SELECT user_id FROM cart WHERE id = $1', [itemId]);
    if (itemCheck.rows.length === 0 || itemCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (quantity <= 0) {
      await pool.query('DELETE FROM cart WHERE id = $1', [itemId]);
      return res.json({ message: 'Item removed from cart' });
    }

    const result = await pool.query(
      'UPDATE cart SET quantity = $1 WHERE id = $2 RETURNING *',
      [quantity, itemId]
    );

    res.json({
      message: 'Cart item updated',
      cartItem: result.rows[0]
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Failed to update cart' });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.params;

    // Check ownership
    const itemCheck = await pool.query('SELECT user_id FROM cart WHERE id = $1', [itemId]);
    if (itemCheck.rows.length === 0 || itemCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await pool.query('DELETE FROM cart WHERE id = $1', [itemId]);

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
};

export const clearCart = async (req, res) => {
  try {
    const userId = req.user.userId;

    await pool.query('DELETE FROM cart WHERE user_id = $1', [userId]);

    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
};
