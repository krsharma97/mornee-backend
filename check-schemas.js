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

async function checkSchemas() {
  try {
    console.log('🔍 Checking schema differences...\n');

    const tables = ['products', 'company_settings', 'payment_gateway_settings'];

    for (const tableName of tables) {
      console.log(`\n📊 Table: ${tableName}`);
      console.log('─'.repeat(60));

      // Get source columns
      const sourceColumns = await sourcePool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [tableName]
      );

      // Get target columns
      const targetColumns = await targetPool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [tableName]
      );

      console.log('\nLocal DB columns:');
      sourceColumns.rows.forEach(col => {
        console.log(`  • ${col.column_name} (${col.data_type})${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      });

      console.log('\nPrisma DB columns:');
      targetColumns.rows.forEach(col => {
        console.log(`  • ${col.column_name} (${col.data_type})${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      });

      // Find differences
      const sourceColNames = new Set(sourceColumns.rows.map(c => c.column_name));
      const targetColNames = new Set(targetColumns.rows.map(c => c.column_name));

      const missingInTarget = [...sourceColNames].filter(c => !targetColNames.has(c));
      const extraInTarget = [...targetColNames].filter(c => !sourceColNames.has(c));

      if (missingInTarget.length > 0) {
        console.log('\n❌ Missing in Prisma DB:');
        missingInTarget.forEach(col => console.log(`  • ${col}`));
      }

      if (extraInTarget.length > 0) {
        console.log('\n⚠️  Extra in Prisma DB:');
        extraInTarget.forEach(col => console.log(`  • ${col}`));
      }

      if (missingInTarget.length === 0 && extraInTarget.length === 0) {
        console.log('\n✅ Schemas match perfectly!');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

checkSchemas();
