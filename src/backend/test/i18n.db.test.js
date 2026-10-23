import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database part of localization: the superadministrator's language settings
 * are stored and read back (the old default_locale key kept in step), a
 * person may choose any supported language, and server texts follow the
 * person's language only while it is enabled. Needs a test database (never
 * production!):
 *
 *   I18N_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/i18n.db.test.js
 *
 * Without I18N_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.I18N_DB_TEST === '1';
const skip = enabled ? false : 'set I18N_DB_TEST=1 and a test database to run';

let db = null;
let saved = null;
const userIds = [];

after(async () => {
  if (!db) return;
  if (saved) {
    for (const key of ['localization', 'default_locale', 'modules']) {
      const row = saved.find((item) => item.key === key);
      if (row) await db.query(`UPDATE app_settings SET value = $2 WHERE key = $1`, [key, row.value]);
      else await db.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
    }
    (await import('../services/settings.js')).invalidateSettings();
  }
  if (userIds.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  await db.closePool();
});

test('database: language settings, personal languages and recipients', { skip }, async () => {
  db = await import('../config/database.js');
  const settings = await import('../services/settings.js');
  const users = await import('../services/users.js');
  saved = (await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [['localization', 'default_locale', 'modules']])).rows;

  await settings.updateAdminSettings({ localization: { enabled: ['ky', 'ru', 'en'], default: 'browser', fallback: 'ru' } });
  let parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.deepEqual(parsed.localization, { enabled: ['ky', 'ru', 'en'], default: 'browser', fallback: 'ru' });
  assert.equal(parsed.defaultLocale, 'auto');
  assert.deepEqual(settings.toPublicSettings(parsed).localization.enabled, ['ky', 'ru', 'en']);
  assert.equal((await db.query(`SELECT value FROM app_settings WHERE key = 'default_locale'`)).rows[0].value, 'auto');

  // A refused patch saves nothing.
  await assert.rejects(settings.updateAdminSettings({ localization: { enabled: [] } }), { statusCode: 400, code: 'LOCALIZATION_EMPTY' });
  parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.deepEqual(parsed.localization.enabled, ['ky', 'ru', 'en']);

  // The old single key still works and lands in the new block.
  await settings.updateAdminSettings({ defaultLocale: 'ru' });
  parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.equal(parsed.localization.default, 'ru');

  // A person may pick any supported language.
  const name = `i18n${Date.now().toString(36)}`;
  const { rows } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', $1) RETURNING id`, [name, `${name}@test.invalid`]);
  userIds.push(rows[0].id);
  await users.updateUser(rows[0].id, { locale: 'ky' });
  let row = (await db.query(`SELECT locale FROM users WHERE id = $1`, [rows[0].id])).rows[0];
  assert.equal(row.locale, 'ky');
  assert.equal(await settings.localeFor(row), 'ky');
  await users.updateUser(rows[0].id, { locale: 'xx' });
  assert.equal((await db.query(`SELECT locale FROM users WHERE id = $1`, [rows[0].id])).rows[0].locale, 'ky', 'an unknown code is ignored');

  // Kyrgyz switched off: the person gets the portal default.
  await settings.updateAdminSettings({ localization: { enabled: ['ru', 'en'], default: 'ru' } });
  row = (await db.query(`SELECT locale FROM users WHERE id = $1`, [rows[0].id])).rows[0];
  assert.equal(await settings.localeFor(row), 'ru');
  assert.equal(await settings.localeFor(null, { acceptLanguage: 'en-US,en;q=0.9' }), 'ru', 'a fixed default wins over the browser');
  await settings.updateAdminSettings({ localization: { enabled: ['ru', 'en'], default: 'browser', fallback: 'en' } });
  assert.equal(await settings.localeFor(null, { acceptLanguage: 'de-DE,ru;q=0.5' }), 'ru');
  assert.equal(await settings.localeFor(null, { acceptLanguage: 'de-DE' }), 'en');
});

test('database: CRM stock lists of an existing portal are stored once and never relabelled', { skip }, async () => {
  db = db || (await import('../config/database.js'));
  const settings = await import('../services/settings.js');
  const { CRM_DEFAULTS } = await import('../modules/catalog.js');
  if (!saved) saved = (await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [['localization', 'default_locale', 'modules']])).rows;
  const modules = JSON.parse(saved.find((row) => row.key === 'modules')?.value || '{}');
  // A portal from before: CRM on, its settings never saved, the language English.
  const legacy = { ...modules, crm: { enabled: true } };
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('modules', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(legacy)]);
  await settings.updateAdminSettings({ localization: { enabled: ['en', 'ru'], default: 'en', fallback: 'en' } });
  assert.deepEqual(await settings.migrateCrmStockLists(), ['sources', 'lostReasons']);
  assert.deepEqual(await settings.migrateCrmStockLists(), [], 'idempotent');
  settings.invalidateSettings();
  let parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.deepEqual(parsed.modules.crm.settings.sources, CRM_DEFAULTS.sources, 'the Russian lists the deals hold');
  assert.deepEqual(parsed.modules.crm.settings.lostReasons, CRM_DEFAULTS.lostReasons);
  assert.equal(parsed.modules.crm.enabled, true);
  // A later language change relabels nothing; setup's localisation refuses once deals exist.
  await settings.updateAdminSettings({ localization: { enabled: ['en', 'ru', 'tr'], default: 'tr', fallback: 'en' } });
  parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.deepEqual(parsed.modules.crm.settings.sources, CRM_DEFAULTS.sources);
  const deals = (await db.query(`SELECT to_regclass('public.crm_deals') AS t`)).rows[0].t;
  if (deals && (await db.query(`SELECT 1 FROM crm_deals LIMIT 1`)).rows.length) {
    assert.equal(await settings.localizeCrmStockLists('tr'), false);
  }
  // The start-up path runs it too (ensureSettingsTable).
  await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'modules'`, [JSON.stringify(legacy)]);
  await settings.ensureSettingsTable();
  parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  assert.deepEqual(parsed.modules.crm.settings.sources, CRM_DEFAULTS.sources);
});

test('database: the last request language is stored for messages outside requests', { skip }, async () => {
  db = db || (await import('../config/database.js'));
  const settings = await import('../services/settings.js');
  const name = `i18nl${Date.now().toString(36)}`;
  const { rows } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', $1) RETURNING id, locale, last_locale`, [name, `${name}@test.invalid`]);
  userIds.push(rows[0].id);
  assert.equal(settings.rememberRequestLocale(rows[0], 'ru'), true);
  let row = null;
  for (let i = 0; i < 50 && row?.last_locale !== 'ru'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    row = (await db.query(`SELECT locale, last_locale FROM users WHERE id = $1`, [rows[0].id])).rows[0];
  }
  assert.equal(row.last_locale, 'ru');
  assert.equal(settings.recipientLocale(row, { enabled: ['en', 'ru'], default: 'browser', fallback: 'en' }), 'ru');
});
