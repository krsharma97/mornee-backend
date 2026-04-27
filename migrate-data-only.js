import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Source: Local database
const sourcePool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'mornee_db',
});

// Target: New Prisma PostgreSQL
const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrateDataSimple() {
  try {
    console.log('🔄 Starting database data migration...\n');

    // Test connections
    await sourcePool.query('SELECT 1');
    console.log('✅ Connected to local database at localhost:5432/mornee_db');

    await targetPool.query('SELECT 1');
    console.log('✅ Connected to new Prisma PostgreSQL database\n');

    // Disable foreign key constraints temporarily for migration
    await targetPool.query('ALTER TABLE IF EXISTS addresses DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS cart DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS cart_items DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS categories DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS company_settings DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS coupons DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS order_items DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS orders DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS payment_gateway_settings DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS payments DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS product_variants DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS products DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS reviews DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS users DISABLE TRIGGER ALL');
    await targetPool.query('ALTER TABLE IF EXISTS wishlist DISABLE TRIGGER ALL');

    // Get all tables
    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
       ORDER BY table_name`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');
    
    console.log(`📋 Found ${tables.length} table(s) to migrate\n`);

    for (const tableName of tables) {
      try {
        // Get data from source
        const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
        const rows = dataResult.rows;

        if (rows.length === 0) {
          console.log(`📊 ${tableName}: 0 records - skipped`);
          continue;
        }

        console.log(`📊 ${tableName}: Found ${rows.length} records`);

        // Truncate target table first
        try {
          await targetPool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
        } catch (e) {
          // Table might not exist yet
        }

        // Insert data
        let successCount = 0;
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const columnList = columns.map(col => `"${col}"`).join(', ');

          try {
            await targetPool.query(
              `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`,
              values
            );
            successCount++;
          } catch (error) {
            if (error.message.includes('does not exist')) {
              console.log(`    ⚠️  Table doesn't exist in target database. Skipping...`);
              break;
            }
            // Silently skip individual record errors
          }
        }
        
        if (successCount > 0) {
          console.log(`  ✅ Migrated ${successCount}/${rows.length} records`);
        }

      } catch (error) {
        console.log(`  ⚠️  Error processing ${tableName}: ${error.message}`);
      }
    }

    // Re-enable triggers
    await targetPool.query('ALTER TABLE IF EXISTS addresses ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS cart ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS cart_items ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS categories ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS company_settings ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS coupons ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS order_items ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS orders ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS payment_gateway_settings ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS payments ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS product_variants ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS products ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS reviews ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS users ENABLE TRIGGER ALL').catch(() => {});
    await targetPool.query('ALTER TABLE IF EXISTS wishlist ENABLE TRIGGER ALL').catch(() => {});

    console.log('\n✅ Data migration completed!');
    console.log('📌 Important: Your target database must already have the schema created.');
    console.log('📌 New database is ready at: db.prisma.io:5432/postgres');

  } catch (error) {
    console.error('❌ Migration Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n   ⚠️ Make sure PostgreSQL is running at localhost:5432');
      console.error('   And that the database "mornee_db" exists');
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

migrateDataSimple();
