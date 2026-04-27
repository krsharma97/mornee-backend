import pool from './src/config/database.js';

async function seedGateways() {
  try {
    // Ensure table exists with correct schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_gateway_settings (
        id SERIAL PRIMARY KEY,
        gateway_key VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100),
        merchant_id VARCHAR(255),
        api_key VARCHAR(255),
        is_enabled BOOLEAN DEFAULT false,
        environment VARCHAR(20) DEFAULT 'test',
        config_encrypted JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Table created/verified');

    const gateways = [
      {
        key: 'razorpay',
        name: 'Razorpay',
        merchant_id: 'rzp_test_placeholder',
        api_key: 'rzp_test_key_placeholder'
      },
      {
        key: 'phonepe',
        name: 'PhonePe',
        merchant_id: '',
        api_key: ''
      },
      {
        key: 'cod',
        name: 'Cash on Delivery (COD)',
        merchant_id: null,
        api_key: null
      }
    ];

    for (const gw of gateways) {
      const check = await pool.query(
        'SELECT id FROM payment_gateway_settings WHERE gateway_key = $1',
        [gw.key]
      );

      if (check.rows.length === 0) {
        await pool.query(
          `INSERT INTO payment_gateway_settings (gateway_key, display_name, merchant_id, api_key, is_enabled, config_encrypted)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [gw.key, gw.name, gw.merchant_id, gw.api_key, gw.key === 'cod', JSON.stringify({})]
        );
        console.log(`Added: ${gw.name}`);
      } else {
        await pool.query(
          `UPDATE payment_gateway_settings SET display_name = $1 WHERE gateway_key = $2`,
          [gw.name, gw.key]
        );
        console.log(`Updated: ${gw.name}`);
      }
    }

    console.log('\nSeeding complete!');
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

seedGateways();