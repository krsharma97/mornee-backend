import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const normalizeDbUrl = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  if (process.env.DB_SSL?.toLowerCase() === 'false') {
    try {
      const parsedUrl = new URL(databaseUrl);
      parsedUrl.searchParams.delete('sslmode');
      return parsedUrl.toString();
    } catch (error) {
      return databaseUrl;
    }
  }

  return databaseUrl;
};

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: normalizeDbUrl(),
      ssl:
        process.env.DB_SSL?.toLowerCase() === 'false'
          ? false
          : {
              rejectUnauthorized: false,
            },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'mornee_db',
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
