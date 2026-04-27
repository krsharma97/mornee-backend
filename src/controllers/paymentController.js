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
      'SELECT id, user_id FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (paymentMethod !== 'phonepe') {
      return res.status(400).json({
        error: `${paymentMethod} payment initiation is not wired yet. Save the gateway in admin settings first, then we can connect the checkout flow to it.`
      });
    }

    const phonePe = await getPhonePeConfig();
    if (!phonePe.isEnabled) {
      return res.status(400).json({ error: 'PhonePe is disabled in admin settings' });
    }

    const transactionId = `MORNEE_${Date.now()}_${uuidv4().substring(0, 8)}`;

    const payload = {
      merchantId: phonePe.merchantId,
      merchantTransactionId: transactionId,
      merchantUserId: `USER_${orderCheck.rows[0].user_id}`,
      amount: amount * 100,
      redirectUrl: redirectUrl || `${process.env.FRONTEND_URL}/payment-success`,
      redirectMode: 'REDIRECT',
      mobileNumber: '9625783464',
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    const payloadString = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadString).toString('base64');
    const checksum = generateChecksum(payloadBase64, phonePe.saltKey, phonePe.saltIndex);

    await pool.query(
      `INSERT INTO payments (
        order_id, transaction_id, amount, payment_method, gateway_name, status, gateway_response
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, transactionId, amount, paymentMethod, 'phonepe', 'pending', JSON.stringify({ requestPayload: payload })]
    );

    res.json({
      transactionId,
      paymentUrl: `${phonePe.host}/pg/v1/pay`,
      payload: payloadBase64,
      checksum
    });
  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
};

export const handlePaymentCallback = async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const paymentResult = await pool.query(
      'SELECT id, order_id, amount, status FROM payments WHERE transaction_id = $1',
      [transactionId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const paymentRecord = paymentResult.rows[0];
    if (paymentRecord.status !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    const phonePe = await getPhonePeConfig();
    const verificationResult = await verifyPaymentWithPhonePe(transactionId, phonePe);

    if (!verificationResult) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    await pool.query(
      `UPDATE payments
       SET status = $1,
           gateway_name = 'phonepe',
           gateway_reference = $2,
           gateway_response = $3,
           phonepe_response = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $4`,
      [
        'completed',
        verificationResult.data?.transactionId || transactionId,
        JSON.stringify(verificationResult),
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
