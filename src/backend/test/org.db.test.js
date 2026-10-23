import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database integration of the org structure (docs/org-structure.md) and of
 * the «руководитель подразделения автора» approver (docs/approvals.md):
 * tree operations (moves, loops refused, history, deleting only empty units),
 * managerOf rules, the manager stage of a route with its fallback and
 * preview. Needs a test database (never production!):
 *
 *   ORG_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/org.db.test.js
 *
 * Without ORG_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.ORG_DB_TEST === '1';
const skip = enabled ? false : 'set ORG_DB_TEST=1 and a test database to run';

const TYPE = 'test.orgdoc';
const tag = `orgt${Date.now().toString(36)}`;
let db = null;
const created = { users: [], units: [] };
const unregister = [];

async function makeUser(name, { blocked = false } = {}) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name, is_blocked) VALUES ($1, '!', $2, $3) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`, blocked]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  for (const fn of unregister) fn();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.query(`DELETE FROM approval_processes WHERE type = $1`, [TYPE]);
  await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
  if (created.users.length) await db.query(`UPDATE users SET org_unit_id = NULL WHERE id = ANY($1)`, [created.users]);
  // Children before parents.
  for (const id of [...created.units].reverse()) await db.query(`DELETE FROM org_units WHERE id = $1`, [id]).catch(() => {});
  await db.query(`DELETE FROM org_unit_events WHERE unit_id = ANY($1)`, [created.units]);
  if (created.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  await db.closePool();
});

test('database: org structure, managerOf and the manager approval stage', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureOrgSchema } = await import('../modules/org/schema.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  await ensureOrgSchema();
  await ensureApprovalsSchema();
  const service = await import('../modules/org/service.js');
  const org = await import('../modules/org/api.js');
  const api = await import('../modules/approvals/api.js');
  const engine = await import('../modules/approvals/engine.js');
  const { requestAs } = await import('../api/events.js');

  const director = await makeUser('director');
  const head = await makeUser('head');
  const author = await makeUser('author');
  const loner = await makeUser('loner');
  const blockedHead = await makeUser('blockedhead', { blocked: true });
  const admin = { system: true, user: { id: director, username: 'test' } };
  const nobody = { user: { id: loner }, access: { permissions: [] } };

  // ── Tree ──────────────────────────────────────────────────────────────
  await assert.rejects(service.createUnit(nobody, { name: 'X', type: 'company' }), (err) => err.code === 'FORBIDDEN');
  const company = await service.createUnit(admin, { name: `Company ${tag}`, type: 'company', code: `${tag}-C`, headUserId: director });
  created.units.push(company.id);
  const office = await service.createUnit(admin, { name: `Office ${tag}`, type: 'office', parentId: company.id });
  created.units.push(office.id);
  const dept = await service.createUnit(admin, { name: `Dept ${tag}`, type: 'department', parentId: office.id, headUserId: head });
  created.units.push(dept.id);
  const team = await service.createUnit(admin, { name: `Team ${tag}`, type: 'department', parentId: dept.id, headUserId: blockedHead });
  created.units.push(team.id);
  await assert.rejects(service.createUnit(admin, { name: 'Dup', type: 'office', code: `${tag}-c` }), (err) => err.code === 'CODE_TAKEN');

  // A unit cannot go under itself or its descendants.
  await assert.rejects(service.moveUnit(admin, office.id, { parentId: team.id }), (err) => err.code === 'ORG_CYCLE');
  await assert.rejects(service.updateUnit(admin, dept.id, { parentId: dept.id }), (err) => err.code === 'ORG_CYCLE');
  // Move the department to the company level, first among the siblings, and back.
  await service.moveUnit(admin, dept.id, { parentId: company.id, index: 0 });
  let units = await org.orgUnits();
  assert.equal(units.find((unit) => unit.id === dept.id).parentId, company.id);
  const siblings = units.filter((unit) => unit.parentId === company.id).sort((a, b) => a.sort - b.sort);
  assert.deepEqual(siblings.map((unit) => unit.id), [dept.id, office.id]);
  assert.deepEqual(units.find((unit) => unit.id === team.id).path, [company.name, dept.name, team.name]);
  await service.moveUnit(admin, dept.id, { parentId: office.id });
  const history = await service.unitHistory(dept.id);
  assert.equal(history.filter((event) => event.action === 'moved').length, 2);
  assert.deepEqual(history.find((event) => event.action === 'moved').data.changes.parentId, { from: company.id, to: office.id });
  assert.deepEqual((await org.descendants(office.id)).sort(), [dept.id, team.id].sort());
  // Purposes and closing.
  await service.updateUnit(admin, team.id, { purposes: ['warehouse', 'nonsense'] });
  assert.deepEqual((await org.unitsByPurpose('warehouse')).filter((unit) => unit.id === team.id).map((unit) => unit.purposes), [['warehouse']]);
  await service.updateUnit(admin, team.id, { status: 'closed' });
  assert.equal((await org.orgUnits()).some((unit) => unit.id === team.id), false, 'closed units are left out by default');
  assert.equal((await org.orgUnits({ includeClosed: true })).some((unit) => unit.id === team.id), true);
  await service.updateUnit(admin, team.id, { status: 'active' });

  // ── People and managers ───────────────────────────────────────────────
  await service.setUserUnit(admin, author, { unitId: dept.id, position: 'Accountant' });
  await service.setUserUnit(admin, head, { unitId: dept.id });
  await service.setUserUnit(admin, director, { unitId: company.id });
  assert.equal((await org.unitOf({ userId: author })).id, dept.id);
  assert.equal(await org.managerOf(author), head, 'the head of the author’s unit');
  assert.equal(await org.managerOf(head), director, 'the head is not their own manager: one level up (the office has no head)');
  assert.equal(await org.managerOf(author, { level: 2 }), director, 'the manager’s manager');
  assert.equal(await org.managerOf(director), null, 'nobody above the top');
  assert.equal(await org.managerOf(loner), null, 'no unit, no manager');
  // A blocked head is skipped: the team member goes to the department head.
  await service.setUserUnit(admin, loner, { unitId: team.id });
  assert.equal(await org.managerOf(loner), head);
  assert.deepEqual((await org.colleaguesOf(author)).sort(), [author, head].sort());
  // A unit with people cannot be deleted; an empty leaf can.
  await assert.rejects(service.deleteUnit(admin, dept.id), (err) => err.code === 'UNIT_IN_USE');
  await service.setUserUnit(admin, loner, { unitId: null });
  const leaf = await service.deleteUnit(admin, team.id);
  assert.equal(leaf.deleted, true);
  created.units = created.units.filter((id) => id !== team.id);

  // ── Approvals: «руководитель подразделения автора» ─────────────────────
  const docs = new Map();
  unregister.push(
    api.registerApprovalType({
      key: TYPE,
      module: 'test',
      hidden: true,
      title: { ru: 'Тест оргструктуры', en: 'Org test' },
      fields: [],
      adminPermission: 'approvals.admin',
      canView: async () => true,
      load: async (id) => (docs.has(String(id)) ? { title: `Doc ${id}`, number: `O-${id}`, author: { id: docs.get(String(id)) }, url: `/test/${id}` } : null),
      defaultRoute: { stages: [{ id: 'mgr', name: 'Руководитель', mode: 'any', approvers: [{ kind: 'manager', level: 1 }] }] },
    })
  );
  const cAuthor = await requestAs(author);
  const cHead = await requestAs(head);
  const cDirector = await requestAs(director);

  docs.set('1', author);
  let process = await api.startApproval(cAuthor, TYPE, '1');
  assert.equal(process.status, 'pending');
  assert.equal(process.stages[0].approvers.length, 1);
  assert.equal(process.stages[0].approvers[0].kind, 'user');
  assert.equal(process.stages[0].approvers[0].id, head);
  assert.equal(process.stages[0].approvers[0].via, 'manager:1');
  await assert.rejects(api.decide(cDirector, process.id, { action: 'approve' }), (err) => err.code === 'NOT_APPROVER');
  assert.ok((await engine.getProcessById(process.id, cHead)).my.canDecide);
  process = await api.decide(cHead, process.id, { action: 'approve' });
  assert.equal(process.status, 'approved');

  // The head’s own document goes one level up.
  docs.set('2', head);
  const cHeadDoc = await api.startApproval(cHead, TYPE, '2');
  assert.equal(cHeadDoc.stages[0].approvers[0].id, director);

  // Nobody fits: the fallback (escalation people, else administrators) and a history note.
  docs.set('3', loner);
  const fallback = await api.startApproval(await requestAs(loner), TYPE, '3');
  assert.equal(fallback.stages[0].approvers[0].kind, 'permission');
  assert.equal(fallback.stages[0].approvers[0].via, 'fallback');
  assert.ok(fallback.history.some((event) => event.action === 'manager_missing'));

  // With escalation people on the route they stand in instead.
  await engine.saveRoute({ system: true, user: { id: director } }, TYPE, { stages: [{ id: 'mgr', name: 'Руководитель', mode: 'any', approvers: [{ kind: 'manager' }] }], escalateTo: [{ kind: 'user', id: director }] });
  docs.set('4', loner);
  const escalated = await api.startApproval(await requestAs(loner), TYPE, '4');
  assert.deepEqual(escalated.stages[0].approvers.map((a) => [a.kind, a.id, a.via]), [['user', director, 'fallback']]);

  // Preview: with a sample author the manager is named; without, the role is shown.
  const preview = await engine.previewRoute({ system: true, user: { id: director } }, TYPE, {}, null, { authorId: author });
  assert.equal(preview.stages[0].approvers[0].id, head);
  assert.equal(preview.stages[0].approvers[0].via, 'manager:1');
  const missing = await engine.previewRoute({ system: true, user: { id: director } }, TYPE, {}, null, { authorId: loner });
  assert.deepEqual(missing.stages[0].managerMissing, [1]);
  const plain = await engine.previewRoute({ system: true, user: { id: director } }, TYPE, {}, null, {});
  assert.equal(plain.stages[0].approvers[0].kind, 'manager');
});

test('database: unit moves are serialized; the unit of an account is set within your own access', { skip }, async () => {
  db ||= await import('../config/database.js');
  const service = await import('../modules/org/service.js');
  const admin = { system: true, user: { id: null, username: 'test' } };
  const a = await service.createUnit(admin, { name: `A ${tag}`, type: 'department' });
  created.units.push(a.id);
  const b = await service.createUnit(admin, { name: `B ${tag}`, type: 'department' });
  created.units.push(b.id);
  // A under B and B under A at the same time: the tree lock lets only one through, never a loop.
  const results = await Promise.allSettled([service.updateUnit(admin, a.id, { parentId: b.id }), service.updateUnit(admin, b.id, { parentId: a.id })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.reason?.code || r.status)));
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'ORG_CYCLE');
  const { rows } = await db.query(`SELECT id, parent_id FROM org_units WHERE id = ANY($1)`, [[a.id, b.id]]);
  assert.ok(rows.some((row) => row.parent_id === null), 'one of them stays on top');
  // Moving the child back to the top keeps working.
  const child = rows.find((row) => row.parent_id !== null);
  await service.updateUnit(admin, child.id, { parentId: null });

  // users.manage / org.manage do not reach an account with more access than the actor's.
  const actorId = await makeUser('unitactor');
  const plain = await makeUser('unitplain');
  const actor = { user: { id: actorId }, access: { permissions: ['org.manage'] } };
  const { rows: supers } = await db.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN app_roles r ON r.id = ur.role_id WHERE r.key = 'superadmin' ORDER BY u.id LIMIT 1`);
  assert.ok(supers[0], 'the test database has a superadministrator');
  const { rows: was } = await db.query(`SELECT org_unit_id FROM users WHERE id = $1`, [supers[0].id]);
  await assert.rejects(service.setUserUnit(actor, supers[0].id, { unitId: a.id }), (err) => err.code === 'FORBIDDEN');
  assert.equal((await db.query(`SELECT org_unit_id FROM users WHERE id = $1`, [supers[0].id])).rows[0].org_unit_id, was[0].org_unit_id);
  const placed = await service.setUserUnit(actor, plain, { unitId: a.id });
  assert.equal(placed.unit.id, a.id);
  await service.setUserUnit(actor, plain, { unitId: null });
});
