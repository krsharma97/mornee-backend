import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts
} from '../controllers/productController.js';
import { authenticateToken, isShopManager } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/:id', getProductById);
router.post('/', authenticateToken, isShopManager, createProduct);
router.put('/:id', authenticateToken, isShopManager, updateProduct);
router.delete('/:id', authenticateToken, isShopManager, deleteProduct);

export default router;
