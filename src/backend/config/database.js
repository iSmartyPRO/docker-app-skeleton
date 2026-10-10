import pg from 'pg';
import config from './app.js';

const { Pool } = pg;

let pool = null;

function createPool(credentials = null) {
  const pgConfig = credentials || {
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
  };

  const next = new Pool({
    host: pgConfig.host,
    port: Number(pgConfig.port) || 5432,
    database: pgConfig.database,
    user: pgConfig.user,
    password: pgConfig.password ?? '',
    connectionTimeoutMillis: 5000,
  });

  next.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });

  return next;
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}

export async function reconfigurePool(credentials) {
  await closePool();

  // Keep process.env in sync for subsequent reads of config
  if (credentials) {
    process.env.POSTGRES_HOST = String(credentials.host);
    process.env.POSTGRES_PORT = String(credentials.port);
    process.env.POSTGRES_DB = String(credentials.database);
    process.env.POSTGRES_USER = String(credentials.user);
    process.env.POSTGRES_PASSWORD = String(credentials.password ?? '');
    delete process.env.DATABASE_URL;

    config.postgres.host = process.env.POSTGRES_HOST;
    config.postgres.port = Number(process.env.POSTGRES_PORT);
    config.postgres.database = process.env.POSTGRES_DB;
    config.postgres.user = process.env.POSTGRES_USER;
    config.postgres.password = process.env.POSTGRES_PASSWORD;
  }

  pool = createPool(credentials);
  return pool;
}

export const connectDB = async (silent = false) => {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT current_database() AS database, version() AS version'
    );
    if (!silent) {
      console.log(`PostgreSQL connected: ${result.rows[0].database}`);
    }
    return getPool();
  } finally {
    client.release();
  }
};

export const tryConnectDB = async () => {
  try {
    await connectDB(true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

export const testConnection = async (credentials) => {
  const testPool = createPool(credentials);
  try {
    const client = await testPool.connect();
    try {
      const result = await client.query(
        'SELECT current_database() AS database, version() AS version'
      );
      return {
        ok: true,
        database: result.rows[0].database,
        version: result.rows[0].version,
      };
    } finally {
      client.release();
    }
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await testPool.end().catch(() => {});
  }
};

export const query = (text, params) => getPool().query(text, params);

/**
 * Runs `fn(client)` inside a transaction. Throwing rolls everything back, which
 * lets callers apply a change first and validate invariants afterwards.
 */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
