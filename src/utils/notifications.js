import { buildEmailShell, getCompanyEmailSettings, sendEmailWithSettings } from './email.js';

export const sendOrderEmail = async (order, type = 'new') => {
  try {
    const company = await getCompanyEmailSettings();
    if (!company) {
      console.log('Company settings not configured - skipping email');
      return;
    }

    const recipient = company.notification_email || company.email || company.smtp_user;
    if (!recipient) {
      console.log('Notification recipient not configured - skipping email');
      return;
    }

    let subject = `Mornee Notification`;
    let body = '<p>No content available.</p>';

    if (type === 'new') {
      subject = `New Order ${order.order_number} - Mornee`;
      body = `
        <h2>New Order Received!</h2>
        <p>Order Number: <strong>${order.order_number}</strong></p>
        <p>Customer: ${order.customer_name || order.email || 'N/A'}</p>
        <p>Amount: ₹${order.final_amount}</p>
        <p>Payment Method: ${order.payment_method || 'N/A'}</p>
        <p>Status: ${order.order_status || 'N/A'}</p>
        <p>Shipping Address: ${order.shipping_address || 'N/A'}</p>
      `;
    } else if (type === 'status') {
      subject = `Order ${order.order_number} Status Update - Mornee`;
      body = `
        <h2>Order Status Updated</h2>
        <p>Order Number: <strong>${order.order_number}</strong></p>
        <p>New Status: <strong>${order.order_status}</strong></p>
        <p>Track your order at: https://mornee.in/orders</p>
      `;
    }

    await sendEmailWithSettings(company, {
      to: recipient,
      subject,
      html: buildEmailShell({
        companyName: company.company_name || 'Mornee',
        body
      })
    });

    console.log(`Email sent for order ${order.order_number}`);
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

export default { sendOrderEmail };
