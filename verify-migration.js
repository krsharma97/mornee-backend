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

async function verifyMigration() {
  try {
    console.log('🔍 Verifying database migration...\n');

    const tablesResult = await sourcePool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
       ORDER BY table_name`
    );
    const tables = tablesResult.rows.map(r => r.table_name).filter(t => t !== 'pg_stat_statements');

    console.log('📊 Record Counts Comparison:\n');
    console.log('Table Name              | Local DB | Prisma DB | Status');
    console.log('-----------------------------------------------------------');

    let totalLocal = 0;
    let totalPrisma = 0;

    for (const tableName of tables) {
      try {
        const localCount = await sourcePool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        const prismaCount = await targetPool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        
        const local = parseInt(localCount.rows[0].count);
        const prisma = parseInt(prismaCount.rows[0].count);
        
        totalLocal += local;
        totalPrisma += prisma;

        const status = local === prisma ? '✅' : (prisma > 0 ? '⚠️' : '❌');
        console.log(`${tableName.padEnd(23)} | ${local.toString().padEnd(8)} | ${prisma.toString().padEnd(9)} | ${status}`);

      } catch (error) {
        console.log(`${tableName.padEnd(23)} | Error checking table`);
      }
    }

    console.log('-----------------------------------------------------------');
    console.log(`${'TOTAL'.padEnd(23)} | ${totalLocal.toString().padEnd(8)} | ${totalPrisma.toString().padEnd(9)} |`);

    console.log('\n' + (totalLocal === totalPrisma ? '✅ Migration Successful!' : '⚠️ Some tables have mismatches'));
    console.log(`\nSummary: ${totalPrisma} of ${totalLocal} records migrated to Prisma`);

  } catch (error) {
    console.error('❌ Verification Error:', error.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

verifyMigration();
