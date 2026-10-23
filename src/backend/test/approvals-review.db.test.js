import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database checks of the approvals engine fixes from the code review:
 * re-planning a running process when the document changes, no fresh start
 * over a returned process, API token scopes per document module, decisions
 * refused while the document's module is off, and a substitute of the
 * person a question is addressed to taking part. A test-only document type
 * of the `resources` module is used (its area exists for API tokens).
 * Needs a test database (never production!):
 *
 *   APPROVALS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/approvals-review.db.test.js
 */

const enabled = process.env.APPROVALS_DB_TEST === '1';
const skip = enabled ? false : 'set APPROVALS_DB_TEST=1 and a test database to run';

const TYPE = 'resources.reviewtest';
const tag = `aprr${Date.now().toString(36)}`;
let db = null;
const created = { users: [] };
const cleanup = [];

async function makeUser(name) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  for (const fn of cleanup.reverse()) await fn();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.query(`DELETE FROM approval_processes WHERE type = $1`, [TYPE]);
  await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
  if (created.users.length) {
    await db.query(`DELETE FROM approval_substitutes WHERE user_id = ANY($1) OR substitute_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  await db.closePool();
});

test('database: approvals review fixes', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  await ensureApprovalsSchema();
  await import('../modules/approvals/index.js');
  const api = await import('../modules/approvals/api.js');
  const engine = await import('../modules/approvals/engine.js');
  const { createSubstitute } = await import('../modules/approvals/substitutes.js');
  const { portalToday } = await import('../modules/approvals/people.js');
  const settingsService = await import('../services/settings.js');
  const { requestAs } = await import('../api/events.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.resources;
  await settingsService.updateAdminSettings({ modules: { resources: { enabled: true } } });
  cleanup.push(() => settingsService.updateAdminSettings({ modules: { resources: { enabled: before.enabled } } }));

  const author = await makeUser('author');
  const head = await makeUser('head');
  const cfo = await makeUser('cfo');
  const sub = await makeUser('sub');
  const stranger = await makeUser('stranger');
  const as = (id) => requestAs(id);

  const docs = new Map();
  cleanup.push(
    api.registerApprovalType({
      key: TYPE,
      module: 'resources',
      hidden: true,
      title: { ru: 'Тест', en: 'Test' },
      fields: [{ key: 'amount', type: 'money' }],
      canView: async (c, id) => c.user.id === docs.get(String(id))?.author,
      load: async (id) => {
        const d = docs.get(String(id));
        return d && { title: `Doc ${id}`, number: `R-${id}`, amount: d.amount, currency: 'USD', author: { id: d.author }, url: `/test/${id}` };
      },
    })
  );
  await engine.saveRoute({ system: true }, TYPE, {
    stages: [
      { id: 'head', name: 'Head', mode: 'any', approvers: [{ kind: 'user', id: head }] },
      { id: 'cfo', name: 'CFO', mode: 'any', approvers: [{ kind: 'user', id: cfo }], conditions: [{ field: 'amount', op: 'gte', value: 5000 }] },
    ],
  });

  // ── A5: the stages not reached yet follow the document ──
  docs.set('1', { author, amount: 100 });
  let p = await api.startApproval(await as(author), TYPE, '1');
  assert.deepEqual(p.stages.map((s) => s.id), ['head']);
  docs.get('1').amount = 6000;
  await api.refreshApproval(TYPE, '1', { actorId: author });
  p = await api.getProcess(TYPE, '1');
  assert.deepEqual(p.stages.map((s) => s.id), ['head', 'cfo'], 'raising the amount adds the CFO stage');
  assert.equal(p.amount, 6000);
  assert.ok(p.history.some((e) => e.action === 'replanned' && e.data.added.includes('cfo')));
  docs.get('1').amount = 200;
  await api.refreshApproval(TYPE, '1');
  p = await api.getProcess(TYPE, '1');
  assert.deepEqual(p.stages.map((s) => s.id), ['head'], 'lowering it drops a stage nobody reached');
  docs.get('1').amount = 7000;
  await api.refreshApproval(TYPE, '1');
  p = await api.decide(await as(head), p.id, { action: 'approve' });
  assert.equal(p.status, 'pending');
  assert.equal(p.currentStage, 1, 'the added stage is not skipped');
  docs.get('1').amount = 100;
  await api.refreshApproval(TYPE, '1');
  p = await api.getProcess(TYPE, '1');
  assert.deepEqual(p.stages.map((s) => s.id), ['head', 'cfo'], 'a reached stage stays');

  // ── A13: the substitute of the person asked sees the process ──
  p = await api.decide(await as(cfo), p.id, { action: 'question', comment: 'Why?' });
  assert.equal(p.status, 'question');
  const today = await portalToday();
  await createSubstitute(await as(author), { substituteId: sub, startsOn: today, endsOn: today });
  assert.equal(await api.isParticipant(await as(sub), TYPE, '1'), true);
  assert.equal((await engine.getProcessById(p.id, await as(sub))).id, p.id);
  await assert.rejects(engine.getProcessById(p.id, await as(stranger)), (err) => err.statusCode === 404);
  assert.ok((await api.participantDocIds(await as(sub), TYPE)).includes('1'));
  p = await api.answer(await as(sub), p.id, { comment: 'Because' });
  assert.equal(p.status, 'pending');

  // ── A6: an API token reaches only documents of modules in its scope ──
  const token = async (level) => ({ ...(await as(cfo)), apiToken: { id: 1, policy: { scopes: { approvals: 'write', resources: level }, rules: [] } } });
  const none = await token('none');
  assert.equal((await engine.inboxItems(none)).filter((item) => item.meta.type === TYPE).length, 0);
  const row = (await db.query(`SELECT * FROM approval_processes WHERE id = $1`, [p.id])).rows[0];
  assert.equal(await engine.canSeeProcess(none, row), false);
  await assert.rejects(api.decide(none, p.id, { action: 'approve' }), (err) => err.code === 'SCOPE_DENIED');
  const read = await token('read');
  assert.equal((await engine.inboxItems(read)).filter((item) => item.meta.type === TYPE).length, 1);
  assert.equal(await engine.canSeeProcess(read, row), true);
  await assert.rejects(api.decide(read, p.id, { action: 'approve' }), (err) => err.code === 'SCOPE_DENIED');
  // A session (no token) is not affected.
  assert.equal((await engine.inboxItems(await as(cfo))).filter((item) => item.meta.type === TYPE).length, 1);

  // ── A12: no decisions while the module is off ──
  await settingsService.updateAdminSettings({ modules: { resources: { enabled: false } } });
  await assert.rejects(api.decide(await as(cfo), p.id, { action: 'approve' }), (err) => err.code === 'MODULE_DISABLED');
  await assert.rejects(api.answer(await as(author), p.id, { comment: 'x' }), (err) => err.code === 'MODULE_DISABLED');
  assert.equal((await engine.inboxItems(await as(cfo))).filter((item) => item.meta.type === TYPE).length, 0);
  await settingsService.updateAdminSettings({ modules: { resources: { enabled: true } } });

  // ── A3: a returned process goes back only through restart ──
  p = await api.decide(await token('write'), p.id, { action: 'return', comment: 'Fix it' });
  assert.equal(p.status, 'returned');
  await assert.rejects(api.startApproval(await as(author), TYPE, '1'), (err) => err.code === 'NOT_RESTART');
  await assert.rejects(api.restart(await as(stranger), TYPE, '1'), (err) => err.statusCode === 403);
  p = await api.restart(await as(author), TYPE, '1');
  assert.equal(p.status, 'pending');
  assert.equal(p.round, 2);
});
