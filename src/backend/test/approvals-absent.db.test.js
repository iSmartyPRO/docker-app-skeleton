import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

await activateAll();

/*
 * An approval whose document type nobody registers any more — the package of
 * its module (Contracts, Procurement, Warehouse…) is not installed. Every
 * action that changes the process (decide, answer, withdraw, restart and the
 * inbox's bulk approve) is refused with 409 MODULE_ABSENT naming the module,
 * the process stays as it was, and API tokens neither see nor touch it. The
 * module coming back (the type registered again) makes it work as before.
 *
 *   APPROVALS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/approvals-absent.db.test.js
 */

const enabled = process.env.APPROVALS_DB_TEST === '1';
const skip = enabled ? false : 'set APPROVALS_DB_TEST=1 and a test database to run';

const MODULE = 'absentmod';
const TYPE = `${MODULE}.doc`;
const tag = `apab${Date.now().toString(36)}`;
let db = null;
let server = null;
let unregister = null;
const users = [];

after(async () => {
  if (!db) return;
  unregister?.();
  if (server) await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.query(`DELETE FROM approval_processes WHERE type = $1`, [TYPE]);
  await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
  await db.query(`DELETE FROM installed_modules WHERE id = $1`, [MODULE]).catch(() => {});
  if (users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
  await db.closePool();
});

test('database: approvals of an absent module package are refused with 409 MODULE_ABSENT', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  await ensureApprovalsSchema();
  await import('../modules/approvals/index.js');
  const api = await import('../modules/approvals/api.js');
  const engine = await import('../modules/approvals/engine.js');
  const { requestAs } = await import('../api/events.js');

  const makeUser = async (name) => {
    const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
    users.push(rows[0].id);
    return rows[0].id;
  };
  const author = await makeUser('author');
  const head = await makeUser('head');
  const cAuthor = await requestAs(author);
  const cHead = await requestAs(head);
  const token = (c) => ({ ...c, apiToken: { id: 1, policy: { scopes: { approvals: 'write', [MODULE]: 'write' }, rules: [] } } });

  const docs = new Map();
  const statuses = [];
  const definition = {
    key: TYPE,
    module: MODULE,
    hidden: true,
    title: { ru: 'Документ', en: 'Document' },
    canView: async (c, id) => c.user?.id === docs.get(id)?.author,
    load: async (id) => {
      const d = docs.get(String(id));
      return d && { title: d.title, number: d.number, author: { id: d.author }, url: `/x/${id}` };
    },
    onStatus: async (id, status) => statuses.push(`${id}:${status}`),
    defaultRoute: { stages: [{ id: 'head', name: 'Head', mode: 'any', approvers: [{ kind: 'user', id: head }] }] },
  };
  unregister = api.registerApprovalType(definition);
  for (const id of ['a', 'b', 'c']) docs.set(id, { title: `Doc ${id}`, number: `N-${id}`, author });

  // a: pending; b: a question to the author; c: returned.
  const a = await api.startApproval(cAuthor, TYPE, 'a');
  const b = await api.startApproval(cAuthor, TYPE, 'b');
  await api.decide(cHead, b.id, { action: 'question', comment: 'Why?' });
  const c = await api.startApproval(cAuthor, TYPE, 'c');
  await api.decide(cHead, c.id, { action: 'return', comment: 'Fix it' });
  const before = statuses.length;
  // The module's last installed manifest names it in the error.
  await db
    .query(
      `INSERT INTO installed_modules (id, version, state, source, manifest) VALUES ($1, '1.0.0', 'removed', 'package', $2)
       ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest`,
      [MODULE, JSON.stringify({ id: MODULE, name: { en: 'Absent docs', ru: 'Отсутствующие документы' }, version: '1.0.0' })]
    )
    .catch(() => {});

  // The package is removed: nobody registers the type.
  unregister();
  unregister = null;
  const absent = (err) => {
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'MODULE_ABSENT');
    assert.equal(err.details.module, MODULE);
    assert.equal(err.details.type, TYPE);
    return true;
  };
  const snapshot = async () => (await db.query(`SELECT id, status, round, current_stage FROM approval_processes WHERE type = $1 ORDER BY id`, [TYPE])).rows;
  const was = await snapshot();

  await assert.rejects(api.decide(cHead, a.id, { action: 'approve' }), absent);
  await assert.rejects(api.decide(cHead, a.id, { action: 'reject', comment: 'no' }), absent);
  await assert.rejects(api.answer(cAuthor, b.id, { comment: 'Because' }), absent);
  await assert.rejects(api.withdraw(cAuthor, TYPE, 'a'), absent);
  await assert.rejects(api.restart(cAuthor, TYPE, 'c'), absent);
  // A document that never went to approval: the type is simply unknown.
  await assert.rejects(api.restart(cAuthor, TYPE, 'zzz'), (err) => err.code === 'UNKNOWN_TYPE');
  const named = await engine.moduleAbsentError(TYPE);
  if ((await db.query(`SELECT 1 FROM installed_modules WHERE id = $1`, [MODULE]).catch(() => ({ rows: [] }))).rows[0]) {
    assert.equal(named.details.name.ru, 'Отсутствующие документы');
    assert.match(named.message, /Absent docs/);
  }

  // API tokens: the process is invisible and out of reach even with the module's scope.
  const { rows: raw } = await db.query(`SELECT * FROM approval_processes WHERE id = $1`, [a.id]);
  assert.equal(await engine.canSeeProcess(token(cHead), raw[0]), false);
  assert.equal(await engine.canSeeProcess(cHead, raw[0]), true, 'a participant session still sees the history');
  await assert.rejects(api.decide(token(cHead), a.id, { action: 'approve' }), absent);

  // The inbox: no items of the absent type; its bulk approve reports MODULE_ABSENT per item.
  const inbox = await engine.inboxItems(cHead);
  assert.equal(inbox.filter((item) => String(item.id) === String(a.id)).length, 0);
  const express = (await import('express')).default;
  const { privateRoutes } = await import('../modules/approvals/routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(
    '/app/approvals',
    async (req, res, next) => {
      Object.assign(req, await requestAs(Number(req.get('x-test-user'))));
      next();
    },
    privateRoutes()
  );
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}/app/approvals`;
  const post = async (path, body) => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': String(head) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const bulk = await post('/inbox/bulk', { items: [{ id: a.id }] });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.data?.approved ?? bulk.body.approved, 0);
  const results = bulk.body.data?.results ?? bulk.body.results;
  assert.deepEqual(results.map((r) => [r.id, r.ok, r.code]), [[a.id, false, 'MODULE_ABSENT']]);
  const single = await post(`/processes/${a.id}/decide`, { action: 'approve' });
  assert.equal(single.status, 409);
  assert.equal(single.body.code, 'MODULE_ABSENT');
  assert.equal(single.body.info.module, MODULE);

  // The SLA job reminds nobody of it (they could not act) and leaves it for when the module is back.
  const { runSla } = await import('../modules/approvals/sla.js');
  await db.query(`UPDATE approval_processes SET remind_at = NOW() - INTERVAL '1 hour', due_at = NOW() - INTERVAL '1 minute', reminded_at = NULL, escalated_at = NULL WHERE id = $1`, [a.id]);
  await runSla(new Date());
  const sla = (await db.query(`SELECT reminded_at, escalated_at FROM approval_processes WHERE id = $1`, [a.id])).rows[0];
  assert.deepEqual([sla.reminded_at, sla.escalated_at], [null, null]);

  // Nothing changed: no status, no onStatus call.
  assert.deepEqual(await snapshot(), was);
  assert.equal(statuses.length, before);

  // The package is back: the same process can be decided.
  unregister = api.registerApprovalType(definition);
  const done = await api.decide(cHead, a.id, { action: 'approve' });
  assert.equal(done.status, 'approved');
  assert.ok(statuses.includes('a:approved'));
  // Back: the SLA job sees its other processes again.
  await db.query(`UPDATE approval_processes SET due_at = NOW() - INTERVAL '1 minute', escalated_at = NULL WHERE id = $1`, [c.id]);
  await db.query(`UPDATE approval_processes SET status = 'pending' WHERE id = $1`, [c.id]);
  await runSla(new Date());
  assert.ok((await db.query(`SELECT escalated_at FROM approval_processes WHERE id = $1`, [c.id])).rows[0].escalated_at);
});
