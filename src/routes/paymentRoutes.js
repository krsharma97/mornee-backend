import express from 'express';
import {
  initiatePayment,
  handlePaymentCallback,
  getPaymentStatus,
  getEnabledMethods
} from '../controllers/paymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/methods', getEnabledMethods);
router.post('/initiate', authenticateToken, initiatePayment);
router.post('/callback', handlePaymentCallback);
router.get('/:transactionId/status', getPaymentStatus);

export default router;
