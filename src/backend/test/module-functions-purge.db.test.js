import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

await activateAll();

/*
 * «Удалить данные» drops a module's functions with its tables (backup.js moduleFunctions / dropModuleData):
 * Warehouse's journal trigger function wh_moves_immutable() does not outlive wh_moves; a function under a
 * module's prefix is found without being declared; a trigger of another table that runs one refuses the
 * removal (nothing dropped); core and other modules' functions are never touched. Also Procurement's public
 * API the demo purges of Contracts and Masterplan go through (forgetContracts / forgetProjects).
 * A test database only (never production!) — it drops the Warehouse tables of that database:
 *
 *   MODULES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/module-functions-purge.db.test.js
 */

const skip = process.env.MODULES_DB_TEST === '1' ? false : 'set MODULES_DB_TEST=1 and a test database to run';
let db = null;

after(async () => {
  if (!db) return;
  await db.query(`DROP TABLE IF EXISTS pkfn_items, pkfn_other_table, zzother_t`);
  await db.query(`DROP FUNCTION IF EXISTS pkfn_guard(), pkfn_helper(integer), zzother_fn()`);
  await db.closePool();
});

const functionsNamed = async (names) => (await db.query(`SELECT proname FROM pg_proc WHERE proname = ANY($1) ORDER BY 1`, [names])).rows.map((row) => row.proname);

test('database: purging a module drops its functions after its tables', { skip }, async () => {
  db = await import('../config/database.js');
  await (await import('../platform/packages/store.js')).ensurePackageTables();
  const { dropModuleData, moduleFunctions } = await import('../platform/packages/backup.js');
  const { normalizeManifest } = await import('../platform/packages/manifestFile.js');

  // Manifest `functions`: the module's own names only.
  assert.deepEqual(normalizeManifest({ id: 'pkfn', name: { en: 'x', ru: 'x' }, version: '1.0.0', core: '1.0.0', category: 'other', functions: ['pkfn_guard'] }).manifest.functions, ['pkfn_guard']);
  assert.match(normalizeManifest({ id: 'pkfn', name: { en: 'x', ru: 'x' }, version: '1.0.0', core: '1.0.0', category: 'other', functions: ['users_fn'] }).problems.join(';'), /function "users_fn" must start with "pkfn_"/);

  // A module of its own with a trigger function and a helper (prefix), and a stranger's function.
  await db.query(`CREATE TABLE pkfn_items (id SERIAL PRIMARY KEY, n INT)`);
  await db.query(`CREATE OR REPLACE FUNCTION pkfn_guard() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await db.query(`CREATE OR REPLACE FUNCTION pkfn_helper(x integer) RETURNS integer AS $$ SELECT x + 1 $$ LANGUAGE sql`);
  await db.query(`CREATE OR REPLACE FUNCTION zzother_fn() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await db.query(`CREATE TRIGGER pkfn_items_trg BEFORE UPDATE ON pkfn_items FOR EACH ROW EXECUTE FUNCTION pkfn_guard()`);
  assert.deepEqual((await moduleFunctions('pkfn', { functions: ['pkfn_guard'] })).map((fn) => fn.signature), ['pkfn_guard()', 'pkfn_helper(integer)']);

  // A trigger of another table runs the module's function: refused, nothing dropped.
  await db.query(`CREATE TABLE zzother_t (id INT)`);
  await db.query(`CREATE TRIGGER zzother_trg BEFORE UPDATE ON zzother_t FOR EACH ROW EXECUTE FUNCTION pkfn_guard()`);
  await assert.rejects(dropModuleData('pkfn', { tables: ['pkfn_%'] }), (err) => err.code === 'FOREIGN_KEYS' && /zzother_t\.zzother_trg/.test(err.message));
  assert.ok(Boolean((await db.query(`SELECT to_regclass('pkfn_items') AS t`)).rows[0].t), 'the table is still there');
  await db.query(`DROP TRIGGER zzother_trg ON zzother_t`);

  const report = {};
  assert.deepEqual(await dropModuleData('pkfn', { tables: ['pkfn_%'] }, { report }), ['pkfn_items']);
  assert.deepEqual(report.functions, ['pkfn_guard()', 'pkfn_helper(integer)']);
  assert.deepEqual(await functionsNamed(['pkfn_guard', 'pkfn_helper', 'zzother_fn']), ['zzother_fn'], "another module's function stays");

  // Warehouse: the journal's trigger function goes with wh_moves.
  const { ensureWarehouseSchema } = await import('../modules/warehouse/schema.js');
  await ensureWarehouseSchema();
  assert.deepEqual(await functionsNamed(['wh_moves_immutable']), ['wh_moves_immutable']);
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../modules/warehouse/module.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.functions, ['wh_moves_immutable']);
  // Warehouse's tables reference Procurement's? Only plain ids — nothing refuses the drop.
  const dropped = {};
  const tables = await dropModuleData('warehouse', { tables: config.tables, functions: config.functions }, { report: dropped });
  assert.ok(tables.includes('wh_moves'));
  assert.deepEqual(dropped.functions, ['wh_moves_immutable()']);
  assert.deepEqual(await functionsNamed(['wh_moves_immutable']), []);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename LIKE 'wh\\_%'`)).rows[0].n, 0);
  // Installed again: migration 001 makes it all again.
  await ensureWarehouseSchema();
  assert.deepEqual(await functionsNamed(['wh_moves_immutable']), ['wh_moves_immutable']);
});

test('database: Procurement API — requests forget contracts and projects (demo purges of Contracts / Masterplan)', { skip }, async () => {
  db ||= await import('../config/database.js');
  await (await import('../services/legalEntities.js')).ensureLegalEntitiesTable();
  await (await import('../modules/procurement/schema.js')).ensureProcurementSchema();
  const api = await import('../modules/procurement/api.js');
  const author = (await db.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0]?.id;
  assert.ok(author, 'the test database needs a user');
  const tag = `PKFN-${Date.now()}`;
  const insert = async (fields) => {
    const keys = Object.keys(fields);
    const { rows } = await db.query(
      `INSERT INTO proc_requests (seq, number, title, author_id, ${keys.join(', ')}) VALUES (0, $1, $2, $3,${keys.map((_, i) => `$${i + 4}`).join(', ')}) RETURNING id`,
      [`${tag}-${Math.random().toString(36).slice(2, 7)}`, tag, author, ...keys.map((key) => fields[key])]
    );
    return rows[0].id;
  };
  const a = await insert({ contract_id: 990001, contract_label: 'Д-1', project_id: 990101, project_label: 'Проект', object_id: 990201, object_label: 'Объект' });
  const b = await insert({ contract_id: 990002, contract_label: 'Д-2', project_id: 990102, project_label: 'Другой' });
  try {
    assert.equal(await api.forgetContracts([990001, 'x', -1]), 1);
    assert.equal(await api.forgetProjects([990101]), 1);
    assert.equal(await api.forgetContracts([]), 0);
    const { rows } = await db.query(`SELECT id, contract_id, contract_label, project_id, project_label, object_id, object_label FROM proc_requests WHERE id = ANY($1) ORDER BY id`, [[a, b]]);
    assert.deepEqual(rows.map((row) => [row.contract_id, row.contract_label, row.project_id, row.project_label, row.object_id, row.object_label]), [
      [null, null, null, null, null, null],
      [990002, 'Д-2', 990102, 'Другой', null, null],
    ]);
  } finally {
    await db.query(`DELETE FROM proc_requests WHERE id = ANY($1)`, [[a, b]]);
  }
});
