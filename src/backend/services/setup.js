import {
  tryConnectDB,
  testConnection,
  reconfigurePool,
  query,
} from '../config/database.js';
import { writeEnvValues, writePostgresEnv, getCurrentDbConfigPublic } from './envFile.js';
import { getSettings, invalidateSettings, parseSettings, setSetting } from './settings.js';
import { hasAdminUser, createAdminUser, assertUsername } from './users.js';
import { bootstrapSchema } from './schema.js';
import { seedDemoUsers, seedRbac } from './rbac.js';
import { DEFAULT_LOCALIZATION, localeOrDefault } from './i18n/index.js';

function normalizeDbCredentials(body) {
  const host = String(body.host || '').trim();
  const port = Number(body.port) || 5432;
  const database = String(body.database || '').trim();
  const user = String(body.user || '').trim();
  const password = body.password != null ? String(body.password) : '';

  if (!host || !database || !user) {
    const error = new Error('host, database and user are required');
    error.statusCode = 400;
    throw error;
  }

  return { host, port, database, user, password };
}

// Once setup has finished it must never reopen — otherwise a database outage
// would expose /api/setup/database to anyone and let them repoint the app.
// The flag lives in .env (SETUP_LOCKED) so it survives restarts and outages.
let setupLocked = String(process.env.SETUP_LOCKED || '').trim() === 'true';

function lockSetup() {
  if (setupLocked) return;
  setupLocked = true;
  try {
    writeEnvValues({ SETUP_LOCKED: 'true' });
  } catch (err) {
    console.warn('Could not persist SETUP_LOCKED to .env:', err.message);
  }
}

export function isSetupLocked() {
  return setupLocked;
}

export async function getSetupStatus() {
  if (setupLocked) {
    return { needsSetup: false, step: 'done' };
  }

  const db = await tryConnectDB();
  let adminExists = false;
  let settings = null;

  if (db.ok) {
    try {
      await bootstrapSchema();
      adminExists = await hasAdminUser();
      settings = parseSettings(await getSettings());
    } catch (err) {
      console.error('Setup status secondary checks failed:', err.message);
    }
  }

  const needsDatabase = !db.ok;
  const needsAdmin = db.ok && !adminExists;
  const needsAccess =
    db.ok && adminExists && settings?.accessMode !== 'open' && settings?.accessMode !== 'closed';
  const needsSetup = needsDatabase || needsAdmin || needsAccess;

  let step = 'done';
  if (needsDatabase) step = 'database';
  else if (needsAdmin) step = 'admin';
  else if (needsAccess) step = 'access';

  if (!needsSetup) {
    lockSetup();
    return { needsSetup: false, step: 'done' };
  }

  return {
    needsSetup,
    step,
    databaseConnected: db.ok,
    databaseError: db.ok ? null : 'Cannot connect to the database',
    hasAdmin: adminExists,
    database: getCurrentDbConfigPublic(),
    app: settings
      ? {
          name: settings.appName,
          version: settings.appVersion,
          description: settings.appDescription,
        }
      : null,
  };
}

export async function testDatabase(body) {
  const credentials = normalizeDbCredentials(body);
  return testConnection(credentials);
}

export async function saveDatabase(body) {
  const status = await getSetupStatus();
  if (status.hasAdmin) {
    const error = new Error('Setup is already complete');
    error.statusCode = 403;
    throw error;
  }

  const credentials = normalizeDbCredentials(body);
  const test = await testConnection(credentials);
  if (!test.ok) {
    const error = new Error(test.error || 'Connection failed');
    error.statusCode = 400;
    throw error;
  }

  writePostgresEnv(credentials);
  await reconfigurePool(credentials);
  await bootstrapSchema();

  return {
    ok: true,
    database: test.database,
    version: test.version,
  };
}

export async function completeSetup(body) {
  const db = await tryConnectDB();
  if (!db.ok) {
    const error = new Error(
      'Database is not connected. Configure database first.'
    );
    error.statusCode = 400;
    throw error;
  }

  if (await hasAdminUser()) {
    const error = new Error('Setup is already complete');
    error.statusCode = 403;
    throw error;
  }

  const username = assertUsername(body.username);
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const passwordConfirm = String(body.passwordConfirm || '');

  if (!password || password.length < 10 || password.length > 200) {
    const error = new Error('Password must be at least 10 characters');
    error.statusCode = 400;
    throw error;
  }

  if (password !== passwordConfirm) {
    const error = new Error('Passwords do not match');
    error.statusCode = 400;
    throw error;
  }

  await bootstrapSchema();
  const user = await createAdminUser({ username, email, password });
  // Groups (and module starter content) use the language of the wizard.
  const locale = localeOrDefault(body.locale);
  await query(`UPDATE users SET locale = $2 WHERE id = $1`, [user.id, locale]);
  // The installer's language becomes the portal default.
  await query(`INSERT INTO app_settings (key, value) VALUES ('default_locale', $1) ON CONFLICT (key) DO NOTHING`, [locale]);
  const enabled = [...new Set([locale, ...DEFAULT_LOCALIZATION.enabled])];
  await query(`INSERT INTO app_settings (key, value) VALUES ('localization', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify({ enabled, default: locale, fallback: 'en' })]);
  invalidateSettings();
  await seedRbac({ locale });
  // Sample accounts only when asked for (the wizard's checkbox starts off).
  const demoUsers = body.demoUsers === true ? await seedDemoUsers() : 0;

  await query(
    `
    INSERT INTO app_settings (key, value)
    VALUES ('setup_completed', 'true')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  );

  return { ok: true, user, demoUsers };
}

export async function saveAccessMode(body) {
  const db = await tryConnectDB();
  if (!db.ok) {
    const error = new Error('Database is not connected. Configure database first.');
    error.statusCode = 400;
    throw error;
  }
  if (!(await hasAdminUser())) {
    const error = new Error('Create an administrator first');
    error.statusCode = 400;
    throw error;
  }

  const mode = String(body.accessMode || '').trim();
  if (mode !== 'open' && mode !== 'closed') {
    const error = new Error('accessMode must be open or closed');
    error.statusCode = 400;
    throw error;
  }

  await setSetting('access_mode', mode);
  lockSetup();
  return { ok: true, accessMode: mode };
}
