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

async function robustMigration() {
  try {
    console.log('🔄 Starting robust data migration (retry with FK disabled)...\n');

    // Disable all FK constraints
    console.log('⚙️  Disabling foreign key constraints...');
    try {
      await targetPool.query('SET session_replication_role = REPLICA');
      console.log('✅ FK constraints disabled\n');
    } catch (e) {
      console.log('⚠️  Could not disable FK constraints\n');
    }

    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
       ORDER BY table_name`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');

    console.log('📊 Migrating data...\n');

    for (const tableName of tables) {
      try {
        const dataResult = await sourcePool.query(`SELECT * FROM "${tableName}"`);
        const rows = dataResult.rows;

        if (rows.length === 0) continue;

        console.log(`  ${tableName}: ${rows.length} records`);

        let successCount = 0;
        let errorCount = 0;

        for (const row of rows) {
          try {
            const columns = Object.keys(row);
            const values = Object.values(row).map(v => {
              // Handle special types
              if (v === null) return null;
              if (typeof v === 'object') return JSON.stringify(v);
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
            errorCount++;
            if (errorCount <= 2) {
              console.log(`    Error: ${error.message}`);
            }
          }
        }

        console.log(`  → ${successCount}/${rows.length} migrated ${errorCount > 0 ? '⚠️' : '✅'}`);

      } catch (error) {
        console.log(`  ${tableName}: Error - ${error.message}`);
      }
    }

    // Re-enable FK constraints
    console.log('\n⚙️  Re-enabling foreign key constraints...');
    try {
      await targetPool.query('SET session_replication_role = DEFAULT');
      console.log('✅ FK constraints re-enabled\n');
    } catch (e) {
      console.log('⚠️  Could not re-enable FK constraints\n');
    }

    console.log('✅ Migration retry completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

robustMigration();
