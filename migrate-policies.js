import pool from './src/config/database.js';

await pool.query(`
  CREATE TABLE IF NOT EXISTS policies (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  INSERT INTO policies (slug, title, content) VALUES
  ('privacy-policy', 'Privacy Policy', '<section>
    <h2>1. Information We Collect</h2>
    <p>We collect information you provide directly to us, including your name, email address, phone number, shipping address, and payment information when you make a purchase. We also collect device and usage information to improve your shopping experience.</p>
  </section>

  <section>
    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>Process and fulfill your orders</li>
      <li>Send order confirmations and shipping updates</li>
      <li>Respond to your inquiries and provide customer support</li>
      <li>Send promotional communications (with your consent)</li>
      <li>Improve our website and services</li>
    </ul>
  </section>

  <section>
    <h2>3. Information Sharing</h2>
    <p>We do not sell your personal information. We may share your data with service providers who assist in operating our business (payment processors, shipping partners), and when required by law.</p>
  </section>

  <section>
    <h2>4. Data Security</h2>
    <p>We implement appropriate security measures to protect your personal information. All payment transactions are processed through secure, encrypted connections.</p>
  </section>

  <section>
    <h2>5. Your Rights</h2>
    <p>You have the right to access, correct, or delete your personal data. Contact us at hello@mornee.in for any privacy-related requests.</p>
  </section>

  <section>
    <h2>6. Cookies</h2>
    <p>We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookie preferences through your browser settings.</p>
  </section>

  <section>
    <h2>7. Contact Us</h2>
    <p>For privacy concerns, reach us at:</p>
    <p><strong>Mornee</strong><br/>Maruti Kunj, Krishna Kunj<br/>Gurgaon, Haryana 122001<br/>Email: hello@mornee.in</p>
  </section>')
  ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP
`);

await pool.query(`
  INSERT INTO policies (slug, title, content) VALUES
  ('terms-of-service', 'Terms of Service', '<section>
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using the Mornee website and services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
  </section>

  <section>
    <h2>2. Use of Site</h2>
    <p>You may use this website only for lawful purposes. You agree not to use the site in any way that violates applicable laws or regulations.</p>
  </section>

  <section>
    <h2>3. Account Responsibilities</h2>
    <p>You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.</p>
  </section>

  <section>
    <h2>4. Orders and Payment</h2>
    <p>All orders are subject to availability. We reserve the right to refuse or cancel any order for any reason. Payment must be received before shipment.</p>
  </section>

  <section>
    <h2>5. Intellectual Property</h2>
    <p>All content on this website is the property of Mornee and is protected by copyright laws.</p>
  </section>

  <section>
    <h2>6. Limitation of Liability</h2>
    <p>Mornee shall not be liable for any indirect, incidental, or consequential damages arising from the use of this website.</p>
  </section>

  <section>
    <h2>7. Contact Information</h2>
    <p>For questions about these terms, contact us at hello@mornee.in</p>
  </section>')
  ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP
`);

await pool.query(`
  INSERT INTO policies (slug, title, content) VALUES
  ('refund-policy', 'Refund Policy', '<section>
    <h2>1. Return Window</h2>
    <p>Returns accepted within 7 days of delivery. Items must be unworn, unwashed, and with original tags attached.</p>
  </section>

  <section>
    <h2>2. Eligible Items</h2>
    <p>Items must be in original condition with all tags attached. Personal care items, sale items, and custom orders are not eligible for return.</p>
  </section>

  <section>
    <h2>3. Refund Process</h2>
    <p>Once we receive and inspect your return, we will process your refund within 5-7 business days. Refunds will be credited to your original payment method.</p>
  </section>

  <section>
    <h2>4. Exchanges</h2>
    <p>Exchange requests are subject to availability. If you need a different size or color, please request an exchange.</p>
  </section>

  <section>
    <h2>5. Shipping Costs</h2>
    <p>Shipping charges are non-refundable. Return shipping costs will be deducted from your refund.</p>
  </section>

  <section>
    <h2>6. Defective Items</h2>
    <p>If you receive a defective item, contact us immediately for a replacement or full refund. We will cover return shipping for defective items.</p>
  </section>')
  ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP
`);

console.log('Policies table created and seeded with full content');
await pool.end();