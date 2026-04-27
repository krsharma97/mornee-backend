import express from 'express';
import {
  initiatePayment,
  handlePaymentCallback,
  getPaymentStatus
} from '../controllers/paymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/initiate', authenticateToken, initiatePayment);
router.post('/callback', handlePaymentCallback);
router.get('/:transactionId/status', getPaymentStatus);

export default router;
