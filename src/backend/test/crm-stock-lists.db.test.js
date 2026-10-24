import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * CRM migration 001 writing its stock lists into settings.modules.crm from the install's prepare child
 * (schema.js storeStockLists): only the missing lists are merged into the row as the database has it,
 * under the lock the settings service saves the modules row with — an administrator's save running at
 * the same time neither loses them nor is lost. A test database only (never production!):
 *
 *   CRM_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/crm-stock-lists.db.test.js
 */

const skip = process.env.CRM_DB_TEST === '1' ? false : 'set CRM_DB_TEST=1 and a test database to run';
let db = null;
let saved = null;

after(async () => {
  if (!db) return;
  if (saved !== null) await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'modules'`, [saved]);
  (await import('../services/settings.js')).invalidateSettings();
  await db.closePool();
});

test('database: CRM stock lists are merged into the modules row without clobbering a concurrent settings save', { skip }, async () => {
  db = await import('../config/database.js');
  const settings = await import('../services/settings.js');
  const { ensureCrmSchema, storeStockLists } = await import('../modules/crm/schema.js');
  await settings.ensureSettingsTable();
  await ensureCrmSchema();
  saved = (await db.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0]?.value ?? null;
  const read = async () => JSON.parse((await db.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0].value);
  const base = { ...(saved ? JSON.parse(saved) : {}), crm: { enabled: true, settings: { sources: ['Мой источник'], other: 1 } }, kb: { enabled: false } };
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('modules', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(base)]);
  settings.invalidateSettings();

  // The migration's transaction holds the settings lock until it commits; an administrator's save waits.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let saveDone = false;
  const migration = db.withTransaction(async (client) => {
    const written = await storeStockLists({ query: (text, params) => client.query(text, params) });
    assert.deepEqual(written, ['lostReasons'], 'only the missing list');
    await gate;
  });
  // Let the migration take the lock first.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const save = settings.updateAdminSettings({ modules: { kb: { enabled: true } } }).then(() => {
    saveDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(saveDone, false, 'the save waits for the migration');
  release();
  await migration;
  await save;
  assert.equal(saveDone, true);

  const after = await read();
  assert.equal(after.kb.enabled, true, "the administrator's change is there");
  assert.deepEqual(after.crm.settings.sources, ['Мой источник'], 'a stored list is never replaced');
  assert.ok(Array.isArray(after.crm.settings.lostReasons) && after.crm.settings.lostReasons.length > 0, 'the stock list survived the save');
  assert.equal(after.crm.settings.other, 1);

  // A list stored between the read and the write wins over the stock one (jsonb merge, not a copy of the read).
  const next = await read();
  delete next.crm.settings.lostReasons;
  await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'modules'`, [JSON.stringify(next)]);
  await db.withTransaction(async (client) => {
    const q = {
      query: async (text, params) => {
        // Right before the write, someone else's value lands in the row (same transaction, so no lock wait).
        if (/INSERT INTO app_settings/.test(text)) {
          await client.query(`UPDATE app_settings SET value = jsonb_set(value::jsonb, '{crm,settings,lostReasons}', '["Их причина"]')::text WHERE key = 'modules'`);
        }
        return client.query(text, params);
      },
    };
    assert.deepEqual(await storeStockLists(q), ['lostReasons']);
  });
  assert.deepEqual((await read()).crm.settings.lostReasons, ['Их причина']);
});
