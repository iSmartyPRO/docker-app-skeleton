import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Demo data registry and the system report against a real database:
 * seed / purge idempotency, foreign keys (children first, rows real data
 * still needs are kept), demo users going with the last module, the report
 * shape without secrets. Needs a test database (never production!):
 *
 *   PLATFORM_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/platform-demo.db.test.js
 *
 * Without PLATFORM_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.PLATFORM_DB_TEST === '1';
const skip = enabled ? false : 'set PLATFORM_DB_TEST=1 and a test database to run';

let db = null;
let demo = null;
let req = null;
let tablesMade = false;

async function setup() {
  if (db) return;
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  demo = await import('../services/demo.js');
  const { requestAs } = await import('../api/events.js');
  const { rows } = await db.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN app_roles r ON r.id = ur.role_id WHERE r.key = 'superadmin' AND u.is_active ORDER BY u.id LIMIT 1`);
  assert.ok(rows[0], 'the test database needs a superadministrator');
  req = { ...(await requestAs(rows[0].id)), locale: 'ru' };
  // Start clean: earlier runs or a person in the browser may have left demo data.
  await demo.purgeAll(req);
}

after(async () => {
  if (!db) return;
  await demo.purgeAll(req).catch(() => {});
  if (tablesMade) await db.query(`DROP TABLE IF EXISTS zz_demo_child, zz_demo_parent`);
  await db.closePool();
});

test('a module seeds once, purges once, and its rows really go', { skip }, async () => {
  await setup();
  const first = await demo.seedModule('companies', req);
  assert.equal(first.already, false);
  assert.equal(first.counts.cmp_companies, 4);
  assert.equal(first.counts.cmp_people, 3);
  const again = await demo.seedModule('companies', req);
  assert.equal(again.already, true, 'seeding twice adds nothing');
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'companies'`)).rows[0].n, 7);
  const ids = (await db.query(`SELECT record_key FROM demo_records WHERE module = 'companies' AND table_name = 'cmp_companies'`)).rows.map((row) => Number(row.record_key));
  const purged = await demo.purgeModule('companies', req);
  assert.equal(purged.removed, 7);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM cmp_companies WHERE id = ANY($1)`, [ids])).rows[0].n, 0);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM cmp_events WHERE entity_type = 'company' AND entity_id = ANY($1)`, [ids])).rows[0].n, 0, 'the module purge cleans its timeline');
  const twice = await demo.purgeModule('companies', req);
  assert.equal(twice.removed, 0);
});

test('demo users live as long as any module has demo data', { skip }, async () => {
  await setup();
  await demo.seedModule('tasks', req);
  await demo.seedModule('calendar', req);
  const users = await db.query(`SELECT username, email, password_hash FROM users WHERE id IN (SELECT record_key::int FROM demo_records WHERE module = '_users')`);
  assert.ok(users.rows.length >= 3);
  for (const row of users.rows) {
    assert.match(row.username, /^demo\./);
    assert.match(row.email, /@example\.com$/);
    assert.equal(row.password_hash, '!', 'demo users cannot sign in');
  }
  assert.equal((await demo.demoState()).active, true);
  await demo.purgeModule('tasks', req);
  assert.ok((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = '_users'`)).rows[0].n >= 1, 'calendar still uses them');
  const result = await demo.purgeModule('calendar', req);
  assert.ok(result.users >= 1);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM users WHERE username = ANY($1)`, [users.rows.map((row) => row.username)])).rows[0].n, 0);
  assert.equal((await demo.demoState()).active, false);
});

test('a failed seed takes back what it made; foreign keys decide the purge order', { skip }, async () => {
  await setup();
  await db.query(`CREATE TABLE IF NOT EXISTS zz_demo_parent (id SERIAL PRIMARY KEY, name TEXT)`);
  await db.query(`CREATE TABLE IF NOT EXISTS zz_demo_child (id SERIAL PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES zz_demo_parent(id))`);
  tablesMade = true;
  demo.registerDemo({
    module: 'zz_broken',
    async seed(ctx) {
      const { rows } = await ctx.query(`INSERT INTO zz_demo_parent (name) VALUES ('half') RETURNING id`);
      await ctx.track('zz_demo_parent', rows[0].id);
      throw new Error('boom');
    },
  });
  await assert.rejects(demo.seedModule('zz_broken', req), /boom/);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM zz_demo_parent WHERE name = 'half'`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'zz_broken'`)).rows[0].n, 0);

  demo.registerDemo({
    module: 'zz_fk',
    async seed(ctx) {
      for (const name of ['a', 'b']) {
        const parent = await ctx.query(`INSERT INTO zz_demo_parent (name) VALUES ($1) RETURNING id`, [name]);
        await ctx.track('zz_demo_parent', parent.rows[0].id);
        const child = await ctx.query(`INSERT INTO zz_demo_child (parent_id) VALUES ($1) RETURNING id`, [parent.rows[0].id]);
        await ctx.track('zz_demo_child', child.rows[0].id);
      }
    },
  });
  await demo.seedModule('zz_fk', req);
  // Real data now points at demo parent "a" (no cascade): that parent must stay.
  const parentA = (await db.query(`SELECT id FROM zz_demo_parent WHERE name = 'a' ORDER BY id DESC LIMIT 1`)).rows[0].id;
  const real = await db.query(`INSERT INTO zz_demo_child (parent_id) VALUES ($1) RETURNING id`, [parentA]);
  const result = await demo.purgeModule('zz_fk', req);
  assert.equal(result.kept, 1);
  assert.equal(result.removed, 3);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM zz_demo_child WHERE id = $1`, [real.rows[0].id])).rows[0].n, 1, 'real rows are never touched');
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'zz_fk'`)).rows[0].n, 1, 'the kept row stays tracked');
  await db.query(`DELETE FROM zz_demo_child WHERE id = $1`, [real.rows[0].id]);
  assert.equal((await demo.purgeModule('zz_fk', req)).removed, 1);
});

test('seed-all follows dependency order and purge-all clears everything', { skip }, async () => {
  await setup();
  assert.deepEqual(demo.seedOrder(['dashboard', 'kb', 'tasks', 'calendar', 'companies']).indexOf('dashboard'), 4, 'the dashboard comes last');
  const results = await demo.seedAll(['companies', 'tasks', 'calendar', 'kb', 'dashboard', 'crm'], req);
  assert.deepEqual(results.map((item) => item.module).slice(0, 4).sort(), ['calendar', 'companies', 'kb', 'tasks']);
  const overview = await demo.demoOverview();
  assert.equal(overview.active, true);
  assert.ok(overview.modules.find((item) => item.module === 'kb').total >= 4);
  await demo.purgeAll(req);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records`)).rows[0].n, 0);
  assert.equal((await demo.demoOverview()).active, false);
});

test('two seeds of one module at once: only one fills it', { skip }, async () => {
  await setup();
  let runs = 0;
  demo.registerDemo({
    module: 'zz_race',
    async seed(ctx) {
      runs += 1;
      await new Promise((done) => setTimeout(done, 150));
      const { rows } = await ctx.query(`SELECT 1 AS id`);
      await ctx.track('zz_race_rows', rows[0].id);
    },
  });
  const results = await Promise.all([demo.seedModule('zz_race', req), demo.seedModule('zz_race', req)]);
  assert.equal(runs, 1);
  assert.deepEqual(results.map((item) => item.already).sort(), [false, true]);
  await demo.purgeModule('zz_race', req);
});

test('while seeding only demo people are notified', { skip }, async () => {
  await setup();
  const { notify } = await import('../services/notifications.js');
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', 'Real person') RETURNING id`, [`zzreal${Date.now().toString(36)}`]);
  const realUser = rows[0].id;
  let demoUser = null;
  demo.registerDemo({
    module: 'zz_notify',
    async seed(ctx) {
      demoUser = await ctx.demoUser('notifyme', { displayName: 'Demo person' });
      await ctx.query(`SELECT 1`);
      await notify({ userIds: [realUser, demoUser], kind: 'tasks.assigned', module: 'tasks', render: () => ({ title: 'demo' }) });
      await ctx.track('zz_none', 1);
    },
  });
  try {
    await demo.seedModule('zz_notify', req);
    const n = async (id) => (await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND title = 'demo'`, [id])).rows[0].n;
    assert.equal(await n(realUser), 0, 'the real person heard nothing');
    assert.equal(await n(demoUser), 1, 'the demo person sees it in the app');
    // Outside a seed notify works as always.
    await notify({ userIds: [realUser], kind: 'tasks.assigned', module: 'tasks', external: false, render: () => ({ title: 'demo' }) });
    assert.equal(await n(realUser), 1);
  } finally {
    await demo.purgeModule('zz_notify', req);
    await db.query(`DELETE FROM notifications WHERE user_id = $1`, [realUser]);
    await db.query(`DELETE FROM users WHERE id = $1`, [realUser]);
  }
});

test('the dashboard demo leaves a starting layout the administrator saved since', { skip }, async () => {
  await setup();
  const { rows: had } = await db.query(`SELECT widgets, updated_by, updated_at FROM dash_default WHERE id = 1`);
  if (had[0]) await db.query(`DELETE FROM dash_default WHERE id = 1`);
  try {
    await demo.seedModule('dashboard', req);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM dash_default`)).rows[0].n, 1);
    // Untouched: the purge removes it.
    await demo.purgeModule('dashboard', req);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM dash_default`)).rows[0].n, 0);
    // Saved by an administrator (the note kept on top): the purge keeps it.
    await demo.seedModule('dashboard', req);
    await db.query(`UPDATE dash_default SET widgets = widgets || '[{"id":"mine","type":"note","w":6,"h":2,"settings":{}}]'::jsonb, updated_at = NOW() + INTERVAL '5 seconds' WHERE id = 1`);
    await demo.purgeModule('dashboard', req);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM dash_default`)).rows[0].n, 1, 'the edited layout stays');
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'dashboard'`)).rows[0].n, 0, 'and is no longer demo');
  } finally {
    await db.query(`DELETE FROM dash_default WHERE id = 1`);
    if (had[0]) await db.query(`INSERT INTO dash_default (id, widgets, updated_by, updated_at) VALUES (1, $1, $2, $3)`, [JSON.stringify(had[0].widgets), had[0].updated_by, had[0].updated_at]);
  }
});

test('the system report has every section and no secrets', { skip }, async () => {
  await setup();
  const { systemReport } = await import('../services/systemInfo.js');
  const report = await systemReport({ fresh: true });
  for (const key of ['versions', 'modules', 'resources', 'counts', 'jobs', 'integrations', 'queues', 'checks', 'demo']) assert.ok(key in report, key);
  assert.ok(report.versions.core && report.versions.node && report.versions.postgres);
  assert.ok(report.resources.database.sizeBytes > 0);
  assert.ok(report.resources.database.topTables.length > 0);
  assert.ok(report.modules.every((row) => row.version && row.minCore && 'enabled' in row));
  const text = JSON.stringify(report);
  for (const secret of [process.env.JWT_SECRET, process.env.POSTGRES_PASSWORD, process.env.ENCRYPTION_KEY].filter((value) => value && value.length > 6)) {
    assert.ok(!text.includes(secret), 'a secret leaked into the report');
  }
  const cached = await systemReport();
  assert.equal(cached.generatedAt, report.generatedAt, 'cached for 30 s');
});
