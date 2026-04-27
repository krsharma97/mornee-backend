import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const sourcePool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'mornee_db',
});

const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function finalMigration() {
  try {
    console.log('🔄 Starting final data migration with proper array handling...\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    try {
      await targetPool.query('SET session_replication_role = REPLICA');
      await targetPool.query('TRUNCATE categories, users, products CASCADE');
      console.log('✅ Cleared existing data\n');
    } catch (e) {
      console.log(`⚠️  Could not clear: ${e.message}\n`);
    }

    const tables = ['categories', 'users', 'products'];

    for (const tableName of tables) {
      try {
        const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
        const rows = dataResult.rows;

        if (rows.length === 0) {
          console.log(`  ${tableName}: 0 records`);
          continue;
        }

        console.log(`  ${tableName}: ${rows.length} records`);

        let successCount = 0;

        for (const row of rows) {
          try {
            const columns = Object.keys(row);
            const values = Object.values(row).map((v, idx) => {
              if (v === null) return null;
              const colName = columns[idx];

              // Handle array columns - convert to proper PostgreSQL array format
              if (Array.isArray(v)) {
                return v;
              }

              // Handle JSONB columns
              if (typeof v === 'object' && v !== null) {
                return JSON.stringify(v);
              }

              return v;
            });

            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const columnList = columns.map(col => `"${col}"`).join(', ');

            await targetPool.query(
              `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`,
              values
            );
            successCount++;
          } catch (error) {
            // Log detailed error for first 2 records only
            if (successCount === 0) {
              console.log(`    Error on record 1: ${error.message}`);
            }
          }
        }

        console.log(`  ✅ Migrated ${successCount}/${rows.length} records\n`);

      } catch (error) {
        console.log(`  ${tableName}: ${error.message}\n`);
      }
    }

    // Re-enable constraints
    try {
      await targetPool.query('SET session_replication_role = DEFAULT');
    } catch (e) {}

    console.log('✅ Final migration completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

finalMigration();
