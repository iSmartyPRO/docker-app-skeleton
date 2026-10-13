import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of the approvals engine with a test-only document
 * type ("test.doc", never registered by the product): routing with
 * conditions, all/any, question → answer, reject, return → restart,
 * delegation, substitutes, concurrent decisions, the SLA job, the inbox
 * aggregation and permissions. Needs a test database (never production!):
 *
 *   APPROVALS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/approvals.db.test.js
 *
 * Without APPROVALS_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.APPROVALS_DB_TEST === '1';
const skip = enabled ? false : 'set APPROVALS_DB_TEST=1 and a test database to run';

const TYPE = 'test.doc';
const tag = `aprt${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], groups: [] };
const unregister = [];

async function makeUser(name) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  for (const fn of unregister) fn();
  // Let deliveries started with setImmediate finish before the pool closes.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.query(`DELETE FROM approval_processes WHERE type = $1`, [TYPE]);
  await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
  if (created.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  if (created.groups.length) await db.query(`DELETE FROM app_groups WHERE id = ANY($1)`, [created.groups]);
  await db.closePool();
});

test('database: approvals engine end to end', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  await ensureApprovalsSchema();
  await import('../modules/approvals/index.js');
  const api = await import('../modules/approvals/api.js');
  const engine = await import('../modules/approvals/engine.js');
  const { runSla } = await import('../modules/approvals/sla.js');
  const { createSubstitute, listSubstitutes } = await import('../modules/approvals/substitutes.js');
  const { requestAs } = await import('../api/events.js');
  const inbox = await import('../services/inbox.js');

  // People: author, two heads (role), CFO, two IT people (group), a stranger, an approvals admin, a substitute.
  const author = await makeUser('author');
  const head = await makeUser('head');
  const head2 = await makeUser('head2');
  const cfo = await makeUser('cfo');
  const it1 = await makeUser('it1');
  const it2 = await makeUser('it2');
  const stranger = await makeUser('stranger');
  const admin = await makeUser('admin');
  const sub = await makeUser('sub');
  const role = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, '{}') RETURNING id`, [`${tag}_head`, `Head ${tag}`]);
  const adminRole = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, '{approvals.admin}') RETURNING id`, [`${tag}_adm`, `Adm ${tag}`]);
  created.roles.push(role.rows[0].id, adminRole.rows[0].id);
  const group = await db.query(`INSERT INTO app_groups (key, name) VALUES ($1, $2) RETURNING id`, [`${tag}_it`, `IT ${tag}`]);
  created.groups.push(group.rows[0].id);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $3), ($2, $3), ($4, $5)`, [head, head2, role.rows[0].id, admin, adminRole.rows[0].id]);
  await db.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $3), ($2, $3)`, [it1, it2, group.rows[0].id]);
  const ctx = async (id) => requestAs(id);
  const [cAuthor, cHead, cHead2, cCfo, cIt1, cIt2, cStranger, cAdmin, cSub] = await Promise.all([author, head, head2, cfo, it1, it2, stranger, admin, sub].map(ctx));

  // The test document type: an in-memory store, statuses recorded by onStatus.
  const docs = new Map();
  const statuses = [];
  const doc = (id, fields) => docs.set(String(id), { id: String(id), title: `Doc ${id}`, number: `T-${id}`, author, ...fields });
  unregister.push(
    api.registerApprovalType({
      key: TYPE,
      module: 'test',
      hidden: true,
      title: { ru: 'Тестовый документ', en: 'Test document' },
      fields: [
        { key: 'amount', type: 'money' },
        { key: 'category', type: 'select', options: ['Оборудование', 'Услуги'] },
      ],
      canView: async (c, id) => c.user.id === docs.get(id)?.author,
      load: async (id) => {
        const d = docs.get(String(id));
        return d && { title: d.title, number: d.number, amount: d.amount, currency: 'USD', author: { id: d.author }, url: `/test/${id}`, fields: { category: d.category } };
      },
      onStatus: async (id, status, info) => {
        assert.ok(info.client, 'onStatus runs inside the transaction');
        statuses.push(`${id}:${status}`);
      },
    })
  );

  // Route: head role (any) → CFO from $5 000 → IT group (all) for equipment.
  await assert.rejects(engine.saveRoute(cStranger, TYPE, { stages: [] }), (err) => err.code === 'FORBIDDEN');
  const saved = await engine.saveRoute(cAdmin, TYPE, {
    stages: [
      { id: 'head', name: 'Руководитель', mode: 'any', approvers: [{ kind: 'role', id: role.rows[0].id }] },
      { id: 'cfo', name: 'Финдир', approvers: [{ kind: 'user', id: cfo }], conditions: [{ field: 'amount', op: 'gte', value: 5000 }] },
      { id: 'it', name: 'ИТ', mode: 'all', approvers: [{ kind: 'user', id: it1 }, { kind: 'user', id: it2 }], conditions: [{ field: 'category', op: 'eq', value: 'Оборудование' }] },
    ],
    escalateTo: [{ kind: 'user', id: admin }],
  });
  assert.equal(saved.stages.length, 3);
  const preview = await engine.previewRoute(cAdmin, TYPE, { amount: 5000, category: 'Оборудование' });
  assert.deepEqual(preview.stages.map((s) => s.id), ['head', 'cfo', 'it']);

  // 1. Small request: one stage.
  doc('a', { amount: 300, category: 'Услуги' });
  await assert.rejects(api.startApproval(cStranger, TYPE, 'a'), (err) => err.statusCode === 403);
  let a = await api.startApproval(cAuthor, TYPE, 'a', { urgency: 'urgent' });
  assert.equal(a.status, 'pending');
  assert.deepEqual(a.stages.map((s) => s.id), ['head']);
  assert.equal(a.skipped.length, 2);
  assert.equal(a.urgency, 'urgent');
  await assert.rejects(api.startApproval(cAuthor, TYPE, 'a'), (err) => err.code === 'ALREADY_RUNNING');
  // Permissions: a stranger cannot decide or see it; the author is not an approver.
  await assert.rejects(api.decide(cStranger, a.id, { action: 'approve' }), (err) => err.code === 'NOT_APPROVER');
  await assert.rejects(api.decide(cAuthor, a.id, { action: 'approve' }), (err) => err.code === 'NOT_APPROVER');
  await assert.rejects(engine.getProcessById(a.id, cStranger), (err) => err.statusCode === 404);
  assert.ok((await engine.getProcessById(a.id, cHead2)).my.canDecide);
  // Reject needs a comment.
  await assert.rejects(api.decide(cHead, a.id, { action: 'reject' }), (err) => err.code === 'COMMENT_REQUIRED');
  a = await api.decide(cHead, a.id, { action: 'reject', comment: 'Не нужно' });
  assert.equal(a.status, 'rejected');
  assert.ok(statuses.includes('a:rejected'));
  await assert.rejects(api.decide(cHead2, a.id, { action: 'approve' }), (err) => err.code === 'NOT_PENDING');

  // 2. Big equipment request: three stages, question → answer, all-of stage.
  doc('b', { amount: 5000, category: 'Оборудование' });
  let b = await api.startApproval(cAuthor, TYPE, 'b');
  assert.deepEqual(b.stages.map((s) => s.id), ['head', 'cfo', 'it']);
  b = await api.decide(cHead, b.id, { action: 'approve', round: 1, stage: 0 });
  assert.equal(b.currentStage, 1);
  await assert.rejects(api.decide(cHead2, b.id, { action: 'approve', round: 1, stage: 0 }), (err) => err.code === 'STALE');
  let cfoInbox = (await inbox.inboxFor(cCfo)).items.filter((item) => item.meta?.type === TYPE);
  assert.deepEqual(cfoInbox.map((item) => [item.kind, item.id]), [['approval', b.id]]);
  assert.ok(cfoInbox[0].actions.includes('approve'));
  await assert.rejects(api.decide(cCfo, b.id, { action: 'question', comment: '' }), (err) => err.code === 'COMMENT_REQUIRED');
  const dueBefore = new Date(b.dueAt).getTime();
  b = await api.decide(cCfo, b.id, { action: 'question', comment: 'Почему так дорого?' });
  assert.equal(b.status, 'question');
  assert.equal(b.question.to.id, author);
  const authorInbox = (await inbox.inboxFor(cAuthor)).items.filter((item) => item.meta?.type === TYPE);
  assert.deepEqual(authorInbox.map((item) => item.kind), ['question']);
  assert.equal(authorInbox[0].meta.question, 'Почему так дорого?');
  await assert.rejects(api.answer(cStranger, b.id, { comment: 'x' }), (err) => err.statusCode === 403);
  await new Promise((resolve) => setTimeout(resolve, 50));
  b = await api.answer(cAuthor, b.id, { comment: 'Это три ноутбука' });
  assert.equal(b.status, 'pending');
  assert.equal(b.currentStage, 1, 'the answer returns the document to the same stage');
  assert.ok(new Date(b.dueAt).getTime() > dueBefore, 'the waiting time is added to the deadline');
  b = await api.decide(cCfo, b.id, { action: 'approve' });
  assert.equal(b.currentStage, 2);
  b = await api.decide(cIt1, b.id, { action: 'approve' });
  assert.equal(b.status, 'pending', 'all of the IT group must approve');
  await assert.rejects(api.decide(cIt1, b.id, { action: 'approve' }), (err) => err.code === 'ALREADY_DECIDED');
  b = await api.decide(cIt2, b.id, { action: 'approve' });
  assert.equal(b.status, 'approved');
  assert.ok(statuses.includes('b:approved'));
  assert.ok(b.stages.every((s) => s.state === 'done'));
  assert.ok(b.stages[2].approvers.every((x) => x.decision === 'approved' && x.responseMs >= 0));
  assert.ok(b.history.some((h) => h.action === 'answer' && h.comment === 'Это три ноутбука'));

  // 3. Return for rework → restart from the first stage, then (route setting) from the current one.
  doc('c', { amount: 6000, category: 'Услуги' });
  let c = await api.startApproval(cAuthor, TYPE, 'c');
  c = await api.decide(cHead, c.id, { action: 'approve' });
  c = await api.decide(cCfo, c.id, { action: 'return', comment: 'Приложите счёт' });
  assert.equal(c.status, 'returned');
  assert.ok((await inbox.inboxFor(cAuthor)).items.some((item) => item.id === c.id && item.kind === 'returned'));
  await assert.rejects(api.restart(cStranger, TYPE, 'c'), (err) => err.statusCode === 403);
  c = await api.restart(cAuthor, TYPE, 'c');
  assert.equal(c.round, 2);
  assert.equal(c.currentStage, 0);
  await engine.saveRoute(cAdmin, TYPE, { ...(await engine.routeFor(api.getApprovalType(TYPE))), restartFrom: 'current' });
  c = await api.decide(cHead, c.id, { action: 'approve' });
  c = await api.decide(cCfo, c.id, { action: 'return', comment: 'Ещё раз' });
  c = await api.restart(cAuthor, TYPE, 'c');
  assert.equal(c.round, 3);
  assert.equal(c.currentStage, 1, 'restart from the stage that returned it');
  assert.equal(c.stages[0].state, 'done');

  // 4. Withdraw by the author; a stranger cannot.
  await assert.rejects(api.withdraw(cStranger, TYPE, 'c'), (err) => err.statusCode === 403);
  c = await api.withdraw(cAuthor, TYPE, 'c');
  assert.equal(c.status, 'withdrawn');
  assert.ok(statuses.includes('c:withdrawn'));

  // 5. Delegation: the head passes the decision to IT 1.
  doc('d', { amount: 100, category: 'Услуги' });
  let d = await api.startApproval(cAuthor, TYPE, 'd');
  await assert.rejects(api.decide(cHead, d.id, { action: 'delegate', to: head }), (err) => err.code === 'BAD_TARGET');
  d = await api.decide(cHead, d.id, { action: 'delegate', to: it1, comment: 'Посмотри ты' });
  assert.equal(d.stages[0].approvers[0].delegatedTo.id, it1);
  await assert.rejects(api.decide(cHead2, d.id, { action: 'approve' }), (err) => err.code === 'NOT_APPROVER');
  d = await api.decide(cIt1, d.id, { action: 'approve' });
  assert.equal(d.status, 'approved');

  // 6. Substitutes: Sub stands in for the CFO today and decides on their behalf.
  const today = new Date().toISOString().slice(0, 10);
  const far = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await assert.rejects(createSubstitute(cStranger, { userId: cfo, substituteId: sub, startsOn: today, endsOn: far }), (err) => err.statusCode === 403);
  await createSubstitute(cCfo, { substituteId: sub, startsOn: '2026-01-01', endsOn: '2099-01-01', note: 'Отпуск' });
  assert.equal((await listSubstitutes(cCfo)).items.length, 1);
  doc('e', { amount: 9000, category: 'Услуги' });
  let e = await api.startApproval(cAuthor, TYPE, 'e');
  e = await api.decide(cHead, e.id, { action: 'approve' });
  assert.ok((await inbox.inboxFor(cSub)).items.some((item) => item.id === e.id), 'the substitute sees the stage');
  e = await api.decide(cSub, e.id, { action: 'approve' });
  assert.equal(e.status, 'approved');
  assert.equal(e.stages[1].approvers[0].decidedBy.id, sub);
  assert.equal(e.stages[1].approvers[0].onBehalfOf.id, cfo);

  // 7. Concurrent decisions: two heads at the same moment → one counts; double click → one counts.
  doc('f', { amount: 10, category: 'Услуги' });
  const f = await api.startApproval(cAuthor, TYPE, 'f');
  const race = await Promise.allSettled([api.decide(cHead, f.id, { action: 'approve' }), api.decide(cHead2, f.id, { action: 'approve' })]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.find((r) => r.status === 'rejected').reason.statusCode, 409);
  doc('g', { amount: 7000, category: 'Услуги' });
  const g = await api.startApproval(cAuthor, TYPE, 'g');
  const clicks = await Promise.allSettled([api.decide(cHead, g.id, { action: 'approve' }), api.decide(cHead, g.id, { action: 'approve' })]);
  assert.equal(clicks.filter((r) => r.status === 'fulfilled').length, 1);
  const { rows: decided } = await db.query(`SELECT COUNT(*)::int AS n FROM approval_events WHERE process_id = $1 AND action = 'approve'`, [g.id]);
  assert.equal(decided[0].n, 1);

  // 8. SLA job: one reminder, one escalation, never twice.
  doc('h', { amount: 50, category: 'Услуги' });
  const h = await api.startApproval(cAuthor, TYPE, 'h', { urgency: 'critical' });
  assert.equal(new Date(h.dueAt).getTime() - new Date(h.stageStartedAt).getTime(), 4 * 3600 * 1000);
  await db.query(`UPDATE approval_processes SET remind_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [h.id]);
  await runSla();
  await runSla();
  await db.query(`UPDATE approval_processes SET due_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [h.id]);
  await runSla();
  await runSla();
  const { rows: sla } = await db.query(`SELECT action, COUNT(*)::int AS n FROM approval_events WHERE process_id = $1 AND action IN ('reminder', 'escalated') GROUP BY action ORDER BY action`, [h.id]);
  assert.deepEqual(sla, [{ action: 'escalated', n: 1 }, { action: 'reminder', n: 1 }]);
  const { rows: escalations } = await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'approval.escalation'`, [admin]);
  assert.equal(escalations[0].n, 1);
  const overdueItem = (await inbox.inboxFor(cHead)).items.find((item) => item.id === h.id);
  assert.equal(overdueItem.overdue, true);
  assert.equal((await inbox.inboxFor(cHead)).items[0].overdue, true, 'overdue first');

  // 9. Inbox aggregation: other providers' items join; a failing provider does not break it.
  unregister.push(
    inbox.registerInboxProvider('test.extra', async (cx) => (cx.user.id === head ? [{ id: 1, module: 'tasks', kind: 'acceptance', title: 'Принять задачу', urgency: 'critical', actions: ['accept'] }] : [])),
    inbox.registerInboxProvider('test.broken', async () => {
      throw new Error('boom');
    })
  );
  const combined = await inbox.inboxFor(cHead);
  assert.ok(combined.items.some((item) => item.key === 'test.extra:1' && item.kind === 'acceptance'));
  assert.ok(combined.items.some((item) => item.meta?.type === TYPE));
  assert.deepEqual(combined.failed, ['test.broken']);
  // Inline actions through the approvals provider.
  doc('i', { amount: 20, category: 'Услуги' });
  const i = await api.startApproval(cAuthor, TYPE, 'i');
  await inbox.inboxAct(cHead2, 'approvals', i.id, 'approve', {});
  assert.equal((await api.getProcess(TYPE, 'i')).status, 'approved');
  await assert.rejects(inbox.inboxAct(cHead, 'test.extra', 1, 'accept'), (err) => err.code === 'NO_ACTION');

  // 10. Lists: mine and decided by me; participants.
  const mine = await engine.myProcesses(cAuthor);
  assert.ok(mine.some((item) => item.id === h.id && item.meta.waitingFor.length));
  const decidedByHead = await engine.decidedByMe(cHead);
  assert.ok(decidedByHead.items.some((item) => item.id === b.id && item.meta.decision === 'approve'));
  assert.ok(await api.isParticipant(cIt2, TYPE, 'b'));
  assert.ok(!(await api.isParticipant(cStranger, TYPE, 'b')));
});
