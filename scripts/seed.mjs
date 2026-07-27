import fs from 'node:fs/promises';
import pg from 'pg';
import { loadEnvFile } from './load-env.mjs';

const { Client } = pg;
loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const policy = JSON.parse(await fs.readFile(new URL('../data/policy.json', import.meta.url), 'utf8'));
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const result = await client.query(
    `
      INSERT INTO policies (
        id,
        homeowner_id,
        status,
        term_start,
        term_end,
        annual_premium_cents,
        currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      policy.policy_id,
      policy.homeowner_id,
      policy.status,
      policy.term_start,
      policy.term_end,
      policy.annual_premium_cents,
      policy.currency,
    ],
  );

  if (result.rowCount) {
    console.log(`Seeded policy ${policy.policy_id}.`);
  } else {
    console.log(`Policy ${policy.policy_id} already exists; seed left it unchanged.`);
  }
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
