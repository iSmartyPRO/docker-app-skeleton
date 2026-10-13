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

/*
 * The .env file is read by two parsers that must agree:
 *   - dotenv (Node, config/app.js): no escape processing except \n/\r in
 *     double quotes; an unquoted value ends at "#";
 *   - Docker Compose (env_file and ${VAR} interpolation): `$` is expanded and
 *     backslash escapes are processed in double quotes and unquoted values;
 *     single quotes are literal except \' and a trailing backslash.
 * So: plain when only safe characters, else single quotes when the value has
 * no single quote and does not end with a backslash, else double quotes when
 * the value has none of $ \ " (then both read it literally). Anything else
 * (and line breaks) cannot be written so that both read the same value.
 */
const PLAIN_RE = /^[\w./:@%+-]*$/;

export function quoteEnvValue(value) {
  const raw = String(value ?? '');
  if (PLAIN_RE.test(raw)) return raw;
  if (/[\r\n\0]/.test(raw)) throw envValueError('line breaks');
  if (!raw.includes("'") && !raw.endsWith('\\')) return `'${raw}'`;
  if (!/[$\\"]/.test(raw)) return `"${raw}"`;
  throw envValueError(`both ' and one of $ \\ "`);
}

function envValueError(what) {
  const error = new Error(`This value cannot be stored in .env (it contains ${what}). Choose one without them.`);
  error.statusCode = 400;
  error.code = 'ENV_VALUE_UNSAFE';
  return error;
}

export function upsertEnvLine(content, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    // A function, so "$&", "$$" or "$1" in the value are not replacement patterns.
    return content.replace(pattern, () => line);
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
  // Everything is checked before anything is written or applied.
  for (const [key, value] of Object.entries(values)) content = upsertEnvLine(content, key, value);
  writeFileSync(envPath, content, 'utf-8');
  for (const [key, value] of Object.entries(values)) process.env[key] = String(value);
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
