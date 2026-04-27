const pool = require('./src/config/database.js').default;
pool.query('SELECT gateway_key, is_enabled, config_encrypted FROM payment_gateway_settings WHERE gateway_key = $1', ['razorpay'])
  .then(r => {
    if(r.rows.length > 0) {
      console.log('Razorpay Gateway:');
      console.log('  Enabled:', r.rows[0].is_enabled);
      console.log('  Config:', r.rows[0].config_encrypted ? 'Has encrypted config' : 'Empty');
      console.log('  Raw config:', r.rows[0].config_encrypted);
    } else {
      console.log('No razorpay gateway found');
    }
    process.exit(0);
  })
  .catch(e => { console.error(e); process.exit(1); });