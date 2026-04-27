import nodemailer from 'nodemailer';
import pool from '../config/database.js';

let transporter = null;

const initTransporter = async () => {
  if (transporter) return transporter;
  
  const companyResult = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  const company = companyResult.rows[0] || {};
  
  if (company.smtp_host && company.smtp_user && company.smtp_password) {
    transporter = nodemailer.createTransport({
      host: company.smtp_host,
      port: company.smtp_port || 587,
      secure: company.smtp_port === 465,
      auth: {
        user: company.smtp_user,
        pass: company.smtp_password
      }
    });
  }
  return transporter;
};

export const sendOrderEmail = async (order, type = 'new') => {
  try {
    const transport = await initTransporter();
    if (!transport) {
      console.log('Email not configured - skipping email');
      return;
    }
    
    const companyResult = await pool.query('SELECT * FROM company_settings WHERE id = 1');
    const company = companyResult.rows[0] || {};
    const companyEmail = company.email || company.smtp_user;
    
    if (!companyEmail) {
      console.log('Company email not set - skipping email');
      return;
    }
    
    let subject, html;
    
    if (type === 'new') {
      subject = `New Order ${order.order_number} - Mornee`;
      html = `
        <h2>New Order Received!</h2>
        <p>Order Number: <strong>${order.order_number}</strong></p>
        <p>Customer: ${order.customer_name || order.email}</p>
        <p>Amount: ₹${order.final_amount}</p>
        <p>Payment Method: ${order.payment_method}</p>
        <p>Status: ${order.order_status}</p>
        <p>Shipping Address: ${order.shipping_address}</p>
      `;
    } else if (type === 'status') {
      subject = `Order ${order.order_number} Status Update - Mornee`;
      html = `
        <h2>Order Status Updated</h2>
        <p>Order Number: <strong>${order.order_number}</strong></p>
        <p>New Status: <strong>${order.order_status}</strong></p>
        <p>Track your order at: https://mornee.in/orders</p>
      `;
    }
    
    await transport.sendMail({
      from: companyEmail,
      to: companyEmail,
      subject: subject,
      html: html
    });
    
    console.log(`Email sent for order ${order.order_number}`);
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

export default { sendOrderEmail };