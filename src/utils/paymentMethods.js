import pool from '../config/database.js';

export const COD_PAYMENT_METHOD = 'cod';
export const PHONEPE_PAYMENT_METHODS = new Set(['phonepe', 'card', 'upi', 'wallet']);
export const ONLINE_PAYMENT_METHODS = new Set([...PHONEPE_PAYMENT_METHODS, 'razorpay']);

export const getGatewayKeyForPaymentMethod = (paymentMethod) => {
  if (paymentMethod === 'razorpay') {
    return 'razorpay';
  }

  if (paymentMethod === COD_PAYMENT_METHOD) {
    return COD_PAYMENT_METHOD;
  }

  if (PHONEPE_PAYMENT_METHODS.has(paymentMethod)) {
    return 'phonepe';
  }

  return null;
};

export const isPaymentMethodEnabled = async (paymentMethod) => {
  const gatewayKey = getGatewayKeyForPaymentMethod(paymentMethod);
  if (!gatewayKey) {
    return false;
  }

  const result = await pool.query(
    'SELECT is_enabled FROM payment_gateway_settings WHERE gateway_key = $1',
    [gatewayKey]
  );

  return result.rows[0]?.is_enabled === true;
};
