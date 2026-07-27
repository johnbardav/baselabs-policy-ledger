import pg from 'pg';
import { loadEnvFile } from './load-env.mjs';

const { Client } = pg;
loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60000);
const startedAt = Date.now();

if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

while (Date.now() - startedAt < timeoutMs) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('Database is ready.');
    process.exit(0);
  } catch {
    await client.end().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

console.error(`Database was not ready after ${timeoutMs} ms.`);
process.exit(1);
