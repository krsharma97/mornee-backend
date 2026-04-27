import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from '../controllers/cartController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getCart);
router.post('/', authenticateToken, addToCart);
router.put('/:itemId', authenticateToken, updateCartItem);
router.delete('/:itemId', authenticateToken, removeFromCart);
router.delete('/', authenticateToken, clearCart);

export default router;
