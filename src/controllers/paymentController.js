import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { decryptSecret } from '../utils/secrets.js';

const parseEncryptedConfig = (value) => {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};

const loadGatewaySettings = async (gatewayKey) => {
  const result = await pool.query(
    'SELECT * FROM payment_gateway_settings WHERE gateway_key = $1',
    [gatewayKey]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const rawConfig = parseEncryptedConfig(row.config_encrypted);
  const config = Object.fromEntries(
    Object.entries(rawConfig).map(([key, value]) => [key, decryptSecret(value)])
  );

  return {
    gatewayKey: row.gateway_key,
    displayName: row.display_name,
    isEnabled: row.is_enabled,
    environment: row.environment,
    config
  };
};

const getRazorpayConfig = async () => {
  const dbGateway = await loadGatewaySettings('razorpay');
  const config = dbGateway?.config || {};

  return {
    isEnabled: dbGateway?.isEnabled ?? false,
    keyId: config.keyId || process.env.RAZORPAY_KEY_ID || '',
    keySecret: config.keySecret || process.env.RAZORPAY_KEY_SECRET || ''
  };
};

const getPhonePeConfig = async () => {
  const dbGateway = await loadGatewaySettings('phonepe');
  const config = dbGateway?.config || {};

  return {
    isEnabled: dbGateway?.isEnabled ?? true,
    host: config.baseUrl || process.env.PHONEPE_BASE_URL || 'https://api.phonepe.com/apis/hermes',
    merchantId: config.merchantId || process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT',
    saltKey: config.apiKey || process.env.PHONEPE_API_KEY || 'PBPG310BCFE54b7a2',
    saltIndex: Number(config.saltIndex || process.env.PHONEPE_SALT_INDEX || 1)
  };
};

const generateChecksum = (payload, saltKey, saltIndex) => {
  const stringToHash = payload + '/pg/v1/pay' + saltKey;
  const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return hash + '###' + saltIndex;
};

const verifyPaymentWithPhonePe = async (transactionId, config) => {
  try {
    const stringToHash = `/pg/v1/status/${config.merchantId}/${transactionId}${config.saltKey}`;
    const checksum = crypto.createHash('sha256').update(stringToHash).digest('hex');

    const response = await axios.get(
      `${config.host}/pg/v1/status/${config.merchantId}/${transactionId}`,
      {
        headers: {
          'X-VERIFY': checksum + '###' + config.saltIndex,
          'X-MERCHANT-ID': config.merchantId
        }
      }
    );

    const data = response.data;
    const transactionStatus = data?.data?.transactionStatus || data?.data?.status || data?.status;
    const isSuccess = data?.success === true && ['SUCCESS', 'success'].includes(transactionStatus);

    return isSuccess ? data : null;
  } catch (error) {
    console.error('PhonePe verification error:', error);
    return null;
  }
};

export const initiatePayment = async (req, res) => {
  try {
    const {
      orderId,
      amount,
      redirectUrl,
      paymentMethod = 'phonepe'
    } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount required' });
    }

    const orderCheck = await pool.query(
      'SELECT id, user_id, order_number FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderCheck.rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (paymentMethod === 'phonepe' || paymentMethod === 'card' || paymentMethod === 'upi' || paymentMethod === 'wallet') {
      const phonePe = await getPhonePeConfig();
      if (!phonePe.isEnabled) {
        return res.status(400).json({ error: 'PhonePe is disabled in admin settings' });
      }

      const transactionId = `MORNEE_${Date.now()}_${uuidv4().substring(0, 8)}`;

      const payload = {
        merchantId: phonePe.merchantId,
        merchantTransactionId: transactionId,
        merchantUserId: `USER_${order.user_id}`,
        amount: amount * 100,
        redirectUrl: redirectUrl || `${frontendUrl}/payment-success`,
        redirectMode: 'REDIRECT',
        paymentInstrument: {
          type: 'PAY_PAGE'
        }
      };

      const payloadString = JSON.stringify(payload);
      const payloadBase64 = Buffer.from(payloadString).toString('base64');
      const checksum = generateChecksum(payloadBase64, phonePe.saltKey, phonePe.saltIndex);

      await pool.query(
        `INSERT INTO payments (order_id, transaction_id, amount, payment_method, gateway_name, status, gateway_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, transactionId, amount, paymentMethod, 'phonepe', 'pending', JSON.stringify({ requestPayload: payload })]
      );

      return res.json({
        gateway: 'phonepe',
        transactionId,
        paymentUrl: `${phonePe.host}/pg/v1/pay`,
        payload: payloadBase64,
        checksum
      });
    }

    if (paymentMethod === 'razorpay') {
      const razorpay = await getRazorpayConfig();
      if (!razorpay.isEnabled) {
        return res.status(400).json({ error: 'Razorpay is disabled in admin settings' });
      }

      const razorpayOrder = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt: order.order_number,
          notes: {
            orderId: orderId,
            orderNumber: order.order_number
          }
        },
        {
          auth: {
            username: razorpay.keyId,
            password: razorpay.keySecret
          }
        }
      );

      const transactionId = razorpayOrder.data.id;

      await pool.query(
        `INSERT INTO payments (order_id, transaction_id, amount, payment_method, gateway_name, status, gateway_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, transactionId, amount, paymentMethod, 'razorpay', 'pending', JSON.stringify(razorpayOrder.data)]
      );

      return res.json({
        gateway: 'razorpay',
        transactionId,
        razorpayOrderId: razorpayOrder.data.id,
        amount: razorpayOrder.data.amount,
        currency: razorpayOrder.data.currency,
        keyId: razorpay.keyId,
        customerName: `${order.order_number}`,
        customerEmail: '',
        customerPhone: ''
      });
    }

    return res.status(400).json({
      error: `${paymentMethod} payment is not enabled. Please use COD or contact support.`
    });
  } catch (error) {
    console.error('Initiate payment error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error || 'Failed to initiate payment' });
  }
};
};

export const handlePaymentCallback = async (req, res) => {
  try {
    const { transactionId, razorpayResponse } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const paymentResult = await pool.query(
      'SELECT id, order_id, amount, status, gateway_name FROM payments WHERE transaction_id = $1',
      [transactionId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const paymentRecord = paymentResult.rows[0];
    
    if (paymentRecord.status === 'completed') {
      return res.json({ message: 'Payment already processed', orderId: paymentRecord.order_id });
    }

    const isRazorpay = paymentRecord.gateway_name === 'razorpay';
    
    if (isRazorpay && razorpayResponse?.razorpay_payment_id) {
      const razorpayConfig = await getRazorpayConfig();
      const crypto = await import('crypto');
      
      const signatureData = razorpayResponse.razorpay_order_id + '|' + razorpayResponse.razorpay_payment_id;
      const expectedSignature = crypto.createHmac('sha256', razorpayConfig.keySecret)
        .update(signatureData)
        .digest('hex');
      
      if (expectedSignature !== razorpayResponse.razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
    }

    await pool.query(
      `UPDATE payments
       SET status = $1,
           gateway_reference = $2,
           gateway_response = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $4`,
      [
        'completed',
        razorpayResponse?.razorpay_payment_id || transactionId,
        JSON.stringify(razorpayResponse || {}),
        transactionId
      ]
    );

    await pool.query(
      `UPDATE orders
       SET payment_status = $1,
           order_status = $2,
           invoice_generated_at = COALESCE(invoice_generated_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['completed', 'confirmed', paymentRecord.order_id]
    );

    const orderUserResult = await pool.query('SELECT user_id FROM orders WHERE id = $1', [paymentRecord.order_id]);
    if (orderUserResult.rows.length > 0) {
      await pool.query('DELETE FROM cart WHERE user_id = $1', [orderUserResult.rows[0].user_id]);
    }

    res.json({
      message: 'Payment successful. Invoice is ready to send or print.',
      orderId: paymentRecord.order_id,
      transactionId
    });
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await pool.query(
      'SELECT * FROM payments WHERE transaction_id = $1',
      [transactionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
};

export const getEnabledMethods = async (req, res) => {
  try {
    const phonePe = await getPhonePeConfig();
    const razorpay = await getRazorpayConfig();

    const methods = [
      {
        key: 'cod',
        name: 'Cash on Delivery',
        type: 'cod',
        isEnabled: true
      }
    ];

    if (phonePe.isEnabled) {
      methods.push({
        key: 'phonepe',
        name: 'Credit/Debit Card, UPI, Wallet',
        type: 'phonepe',
        isEnabled: true
      });
    }

    if (razorpay.isEnabled) {
      methods.push({
        key: 'razorpay',
        name: 'Razorpay',
        type: 'razorpay',
        isEnabled: true
      });
    }

    res.json(methods);
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
};
