import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ENV_KEYS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
];

export function resolveEnvPath() {
  const candidates = [
    process.env.ENV_FILE_PATH,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '../../.env'), // repo root when run from src/backend
    '/app/.env',
  ].filter(Boolean);

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  return candidates[0] || resolve(process.cwd(), '.env');
}

function quoteEnvValue(value) {
  const raw = String(value ?? '');
  if (!/[^\w./:@%+-]/.test(raw)) return raw;
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}\n${line}\n`;
}

function commentOutKey(content, key) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(content)) return content;
  return content.replace(pattern, (match) =>
    match.startsWith('#') ? match : `# ${match}`
  );
}

/** Upsert arbitrary keys into .env and process.env. */
export function writeEnvValues(values) {
  const envPath = resolveEnvPath();
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  for (const [key, value] of Object.entries(values)) {
    content = upsertEnvLine(content, key, value);
    process.env[key] = String(value);
  }
  writeFileSync(envPath, content, 'utf-8');
  return envPath;
}

/**
 * Persist Postgres bootstrap settings into .env (and process.env).
 */
export function writePostgresEnv(credentials) {
  const envPath = resolveEnvPath();
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  const values = {
    POSTGRES_HOST: String(credentials.host),
    POSTGRES_PORT: String(credentials.port),
    POSTGRES_DB: String(credentials.database),
    POSTGRES_USER: String(credentials.user),
    POSTGRES_PASSWORD: String(credentials.password ?? ''),
  };

  for (const key of ENV_KEYS) {
    content = upsertEnvLine(content, key, values[key]);
  }

  // Prefer discrete POSTGRES_* over DATABASE_URL after wizard save
  content = commentOutKey(content, 'DATABASE_URL');

  writeFileSync(envPath, content, 'utf-8');

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  delete process.env.DATABASE_URL;

  return envPath;
}

export function getCurrentDbConfigPublic() {
  return {
    host: process.env.POSTGRES_HOST || '',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || '',
    user: process.env.POSTGRES_USER || '',
    // never expose password
    passwordSet: Boolean(process.env.POSTGRES_PASSWORD),
  };
}
