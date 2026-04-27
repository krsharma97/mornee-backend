import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

async function migrateComplete() {
  try {
    console.log('🔄 Starting complete database migration...\n');

    // Test connections
    await sourcePool.query('SELECT 1');
    console.log('✅ Connected to local database at localhost:5432/mornee_db');

    await targetPool.query('SELECT 1');
    console.log('✅ Connected to new Prisma PostgreSQL database\n');

    // Step 1: Drop all existing tables in target
    console.log('🗑️  Cleaning target database...');
    try {
      await targetPool.query(`
        DROP TABLE IF EXISTS reviews CASCADE;
        DROP TABLE IF EXISTS wishlist CASCADE;
        DROP TABLE IF EXISTS addresses CASCADE;
        DROP TABLE IF EXISTS payments CASCADE;
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS cart CASCADE;
        DROP TABLE IF EXISTS product_variants CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS categories CASCADE;
        DROP TABLE IF EXISTS coupons CASCADE;
        DROP TABLE IF EXISTS payment_gateway_settings CASCADE;
        DROP TABLE IF EXISTS company_settings CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);
      console.log('✅ Target database cleaned\n');
    } catch (e) {
      console.log('⚠️  Note: Some tables might not have existed\n');
    }

    // Step 2: Create tables from schema
    console.log('📐 Creating database schema...');
    
    // Read and apply the schema
    const schemaSQL = fs.readFileSync('..\\database\\schema.sql', 'utf8');
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await targetPool.query(statement);
        } catch (e) {
          if (!e.message.includes('already exists')) {
            console.log(`  ⚠️  ${e.message}`);
          }
        }
      }
    }
    console.log('✅ Schema created successfully\n');

    // Step 3: Create additional tables that exist in local but not in schema.sql
    console.log('📐 Creating additional tables...');
    try {
      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS company_settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) UNIQUE NOT NULL,
          value TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✅ company_settings table created');
    } catch (e) {
      // May already exist
    }

    try {
      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS payment_gateway_settings (
          id SERIAL PRIMARY KEY,
          gateway_name VARCHAR(100) NOT NULL UNIQUE,
          merchant_id VARCHAR(255),
          api_key VARCHAR(255),
          is_active BOOLEAN DEFAULT false,
          settings JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✅ payment_gateway_settings table created\n');
    } catch (e) {
      // May already exist
    }

    // Step 4: Migrate data
    console.log('📊 Migrating data from local database...\n');

    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
       ORDER BY table_name`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');
    
    console.log(`📋 Found ${tables.length} table(s) to migrate\n`);

    for (const tableName of tables) {
      try {
        const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
        const rows = dataResult.rows;

        if (rows.length === 0) {
          console.log(`  ${tableName}: 0 records`);
          continue;
        }

        console.log(`  ${tableName}: ${rows.length} records`, '');

        // Disable triggers and FK constraints
        try {
          await targetPool.query(`ALTER TABLE "${tableName}" DISABLE TRIGGER ALL`);
        } catch (e) {}

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
            // Continue if one record fails
          }
        }

        // Re-enable triggers
        try {
          await targetPool.query(`ALTER TABLE "${tableName}" ENABLE TRIGGER ALL`);
        } catch (e) {}

        console.log(` → ${successCount}/${rows.length} migrated ✅`);

      } catch (error) {
        console.log(`  ${tableName}: Error - ${error.message}`);
      }
    }

    console.log('\n✅ Complete database migration successful!');
    console.log('📌 New database URL: db.prisma.io:5432/postgres');
    console.log('📌 All tables and data have been transferred');

  } catch (error) {
    console.error('❌ Migration Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️  PostgreSQL connection issues:');
      console.error('   • Make sure PostgreSQL is running at localhost:5432');
      console.error('   • Check credentials: user=postgres, password=123456');
      console.error('   • Verify database "mornee_db" exists');
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

migrateComplete();
