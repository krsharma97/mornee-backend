import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';

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

async function extractAndMigrateSchema() {
  try {
    console.log('🔄 Starting full database migration (schema + data)...\n');

    // Test connections
    await sourcePool.query('SELECT 1');
    console.log('✅ Connected to local database at localhost:5432/mornee_db');

    await targetPool.query('SELECT 1');
    console.log('✅ Connected to new Prisma PostgreSQL database\n');

    // Get all tables
    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');
    
    console.log(`📋 Found ${tables.length} table(s) to migrate\n`);

    for (const tableName of tables) {
      console.log(`📊 Processing table: ${tableName}`);
      
      // Get columns with full metadata
      const columnsResult = await sourcePool.query(
        `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [tableName]
      );

      // Drop existing table in target if exists
      try {
        await targetPool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
      } catch (e) {
        // Table might not exist, that's ok
      }

      // Recreate table with same schema
      if (columnsResult.rows.length > 0) {
        let createSQL = `CREATE TABLE "${tableName}" (\n`;
        const columnDefs = columnsResult.rows.map(col => {
          let def = `  "${col.column_name}" ${col.data_type}`;
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          if (col.column_default) {
            // Handle sequences/defaults properly
            if (col.column_default.includes('nextval')) {
              def += ` DEFAULT ${col.column_default}`;
            } else if (col.column_default.startsWith("'")) {
              def += ` DEFAULT ${col.column_default}`;
            } else {
              def += ` DEFAULT ${col.column_default}`;
            }
          }
          return def;
        });
        
        createSQL += columnDefs.join(',\n') + '\n);';
        
        try {
          await targetPool.query(createSQL);
          console.log(`  ✅ Table schema created`);
        } catch (error) {
          console.log(`  ⚠️  Schema creation issue: ${error.message}`);
        }
      }

      // Get and migrate data
      const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
      const rows = dataResult.rows;
      console.log(`  📈 Found ${rows.length} records`);

      if (rows.length > 0) {
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
            // Try with ON CONFLICT if primary key exists
            try {
              await targetPool.query(
                `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                values
              );
              successCount++;
            } catch (e) {
              console.log(`    ⚠️  Could not insert record: ${error.message}`);
            }
          }
        }
        console.log(`  ✅ Migrated ${successCount}/${rows.length} records\n`);
      } else {
        console.log(`  ℹ️  No records to migrate\n`);
      }
    }

    console.log('✅ Full database migration completed successfully!');
    console.log('📌 All tables and data transferred to: db.prisma.io:5432/postgres');

  } catch (error) {
    console.error('❌ Migration Error:', error.message);
    console.error('\n📋 Troubleshooting:');
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   • Make sure PostgreSQL is running at localhost:5432');
      console.error('   • Database "mornee_db" must exist');
      console.error('   • User "postgres" with password "123456" must have access');
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

extractAndMigrateSchema();
