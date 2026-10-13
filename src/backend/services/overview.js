import { query, tryConnectDB } from '../config/database.js';
import config from '../config/app.js';
import { APP_VERSION } from '../config/version.js';
import { getSettings, parseSettings } from './settings.js';
import { listSecurityEvents } from './security.js';
import { getUserStats, recentLogins } from './users.js';
import { hasPermission } from './permissions.js';

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
    // The server process's zone (logs, the database session); what people see follows `regional`.
    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    regional: { timeZone: parsed.regional?.timeZone || null, dateFormat: parsed.regional?.dateFormat || null, timeFormat: parsed.regional?.timeFormat || null, weekStart: parsed.regional?.weekStart ?? null },
    database: await databaseInfo(),
    rateLimit: parsed.rateLimit,
    setupTokenConfigured: Boolean(String(process.env.SETUP_TOKEN || '').trim()),
    secureCookies:
      String(config.frontend.url).startsWith('https://') || process.env.COOKIE_SECURE === 'true',
  };
}

/**
 * Console home. Everyone with console.access sees it, so the parts that need
 * more come only with their own permission: recent sign-ins (people's
 * contacts) need users.view, security events need activity.view. Hidden
 * parts keep their shape (empty) and `visible` says what was left out.
 */
export async function getOverview(permissions = []) {
  const parsed = parseSettings(await getSettings());
  const visible = {
    recentLogins: hasPermission(permissions, 'users.view'),
    security: hasPermission(permissions, 'activity.view'),
  };
  const [users, logins, security] = await Promise.all([
    getUserStats(),
    visible.recentLogins ? recentLogins(6) : [],
    visible.security ? listSecurityEvents({ limit: 6 }) : { summary: {}, events: [] },
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
    visible,
  };
}
