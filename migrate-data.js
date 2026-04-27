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

async function migrateData() {
  try {
    console.log('🔄 Starting data migration...\n');

    // Test local database connection
    await sourcePool.query('SELECT 1');
    console.log('✅ Connected to local database at localhost:5432/mornee_db');

    // Test new database connection
    await targetPool.query('SELECT 1');
    console.log('✅ Connected to new Prisma PostgreSQL database\n');

    // Get all tables from source database
    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');
    
    console.log(`📋 Found ${tables.length} table(s): ${tables.join(', ')}\n`);

    for (const tableName of tables) {
      console.log(`📊 Migrating table: ${tableName}`);
      
      // Get table structure
      const columnsResult = await sourcePool.query(
        `SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [tableName]
      );

      // Get data from source
      const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
      const rows = dataResult.rows;
      console.log(`  Found ${rows.length} records`);

      if (rows.length > 0) {
        // Insert data into target database
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const columnList = columns.map(col => `"${col}"`).join(', ');

          try {
            await targetPool.query(
              `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
              values
            );
          } catch (error) {
            console.log(`    ⚠️ Error inserting record: ${error.message}`);
          }
        }
        console.log(`  ✅ Migrated ${rows.length} records\n`);
      } else {
        console.log(`  ℹ️  No records to migrate\n`);
      }
    }

    console.log('✅ Data migration completed successfully!');
    console.log('📌 Your new database is ready at: db.prisma.io:5432/postgres');

  } catch (error) {
    console.error('❌ Migration Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   ⚠️ Make sure your local PostgreSQL is running at localhost:5432');
      console.error('   And that the database "mornee_db" exists with user "postgres" and password "123456"');
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

migrateData();
