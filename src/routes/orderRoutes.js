import express from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getAllOrders,
  getOrderInvoice,
  getOrderInvoiceDownload,
  getOrderShippingLabel
} from '../controllers/orderController.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';
import { extractToken, verifyToken } from '../utils/jwt.js';

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractToken(authHeader) || req.query.token;
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
};

router.post('/', optionalAuth, createOrder);
router.get('/', authenticateToken, getOrders);
router.get('/all', authenticateToken, isAdmin, getAllOrders);
router.get('/:orderId/invoice', optionalAuth, getOrderInvoice);
router.get('/:orderId/invoice-download', optionalAuth, getOrderInvoiceDownload);
router.get('/:orderId/shipping-label', optionalAuth, getOrderShippingLabel);
router.get('/:orderId', authenticateToken, getOrderById);
router.put('/:orderId/status', authenticateToken, isAdmin, updateOrderStatus);

export default router;
