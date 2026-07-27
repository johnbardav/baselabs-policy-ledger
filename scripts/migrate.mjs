import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadEnvFile } from './load-env.mjs';

const { Client } = pg;
loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Copy .env.example to .env and configure it.');
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });
const migrationsDirectory = path.resolve('migrations');
let lockAcquired = false;

try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [742013]);
  lockAcquired = true;
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file],
    );

    if (alreadyApplied.rowCount) {
      console.log(`skip ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Database migrations are up to date.');
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (lockAcquired) {
    await client.query('SELECT pg_advisory_unlock($1)', [742013]).catch(() => undefined);
  }
  await client.end().catch(() => undefined);
}
