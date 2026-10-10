import { query, tryConnectDB } from '../config/database.js';
import config from '../config/app.js';
import { APP_VERSION } from '../config/version.js';
import { getSettings, parseSettings } from './settings.js';
import { listSecurityEvents } from './security.js';
import { getUserStats, recentLogins } from './users.js';

const startedAt = Date.now();

async function databaseInfo() {
  const db = await tryConnectDB();
  if (!db.ok) return { connected: false };
  const result = await query(`
    SELECT current_database() AS name,
           current_setting('server_version') AS version,
           pg_database_size(current_database())::bigint AS size
  `);
  const row = result.rows[0];
  return {
    connected: true,
    name: row.name,
    version: row.version,
    sizeBytes: Number(row.size),
    host: config.postgres.host,
  };
}

export async function getSystemInfo() {
  const parsed = parseSettings(await getSettings());
  return {
    version: APP_VERSION,
    node: process.version,
    environment: config.server.nodeEnv,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    database: await databaseInfo(),
    rateLimit: parsed.rateLimit,
    setupTokenConfigured: Boolean(String(process.env.SETUP_TOKEN || '').trim()),
    secureCookies:
      String(config.frontend.url).startsWith('https://') || process.env.COOKIE_SECURE === 'true',
  };
}

export async function getOverview() {
  const parsed = parseSettings(await getSettings());
  const [users, logins, security] = await Promise.all([
    getUserStats(),
    recentLogins(6),
    listSecurityEvents({ limit: 6 }),
  ]);
  const integrations = Object.fromEntries(
    Object.entries(parsed.integrations || {}).map(([key, value]) => [key, Boolean(value?.enabled)])
  );

  return {
    app: {
      name: parsed.appName,
      version: APP_VERSION,
      accessMode: parsed.accessMode || 'closed',
      template: parsed.appearance?.template || 'navy',
    },
    users,
    recentLogins: logins,
    security: {
      last24h: security.summary,
      total24h: Object.values(security.summary).reduce((sum, n) => sum + n, 0),
      recent: security.events,
      whitelistEnabled: Boolean(parsed.security?.whitelistEnabled),
    },
    integrations,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}
