export interface AppEnvironment {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  logLevel: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function readEnvironment(): AppEnvironment {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure it.');
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parsePositiveInteger(process.env.PORT, 3000, 'PORT'),
    databaseUrl,
    dbPoolMax: parsePositiveInteger(process.env.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
