import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of «Принять в работу» and «Поручения» in Tasks:
 * the one-off migration, self-assigned tasks, acceptance by the button,
 * by starting and by completing, reassignment, the "not accepted in time"
 * job, the leadership rule for orders and the inbox provider.
 * Needs a test database (never production!):
 *
 *   TASKS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/tasks-acceptance.db.test.js
 *
 * Without TASKS_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.TASKS_DB_TEST === '1';
const skip = enabled ? false : 'set TASKS_DB_TEST=1 and a test database to run';

let db = null;
let projectId = null;
let groupId = null;
let savedSettings = null;

async function setup() {
  db = await import('../config/database.js');
  const { ensureTasksSchema } = await import('../modules/tasks/schema.js');
  await ensureTasksSchema();
  const { getSettings, parseSettings, updateAdminSettings } = await import('../services/settings.js');
  savedSettings = parseSettings(await getSettings({ fresh: true })).modules.tasks;
  await updateAdminSettings({ modules: { tasks: { enabled: true, settings: { acceptHours: 24, acceptHoursImportant: 4, ordersGroupIds: [] } } } });
  const { rows } = await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY id LIMIT 3`);
  assert.equal(rows.length, 3, 'the test database needs three users');
  const { requestAs } = await import('../api/events.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  const ctxOf = async (id) => contextFromRequest(await requestAs(id), 'tasks.admin');
  return { ids: rows.map((row) => row.id), ctxOf };
}

after(async () => {
  if (!db) return;
  if (projectId) {
    await db.query(`DELETE FROM notifications WHERE link LIKE $1`, [`/app/tasks/ACC${projectId}-%`]);
    await db.query(`DELETE FROM chat_rooms WHERE entity_type = 'task' AND entity_id IN (SELECT id FROM tasks WHERE project_id = $1)`, [projectId]);
    await db.query(`DELETE FROM task_projects WHERE id = $1`, [projectId]);
  }
  if (groupId) await db.query(`DELETE FROM app_groups WHERE id = $1`, [groupId]);
  if (savedSettings) {
    const { updateAdminSettings } = await import('../services/settings.js');
    await updateAdminSettings({ modules: { tasks: { enabled: savedSettings.enabled, settings: savedSettings.settings } } });
  }
  await db.closePool();
});

const hoursBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 3600000);

test('database: acceptance of tasks, orders and the inbox', { skip }, async () => {
  const { ids, ctxOf } = await setup();
  const [aId, bId, cId] = ids;
  const [a, b, c] = await Promise.all(ids.map(ctxOf));
  const service = await import('../modules/tasks/service.js');
  const { startTask, delegateTask } = await import('../modules/tasks/extras.js');
  const { acceptTask, runAcceptanceJob, inboxItems } = await import('../modules/tasks/acceptance.js');
  const { markExistingAccepted } = await import('../modules/tasks/schema.js');
  const { resetLeadershipCache } = await import('../modules/tasks/orders.js');

  // A team project everyone may edit; its key is unique per run.
  const key = `ACC${Date.now() % 100000}`;
  const project = await service.createProject({ ...a, isAdmin: true }, { name: `Acceptance ${key}`, key, visibility: 'team' }, { locale: 'en', allowed: true });
  projectId = project.id;
  await db.query(`UPDATE task_projects SET key = $2 WHERE id = $1`, [projectId, `ACC${projectId}`]);
  const create = (ctx, input) => service.createTask(ctx, { projectId, title: 'T', ...input });

  // ── Self-assigned tasks are accepted at once; others wait (24 h, important 4 h).
  const own = await create(a, { assigneeId: aId });
  assert.equal(own.acceptance.state, 'accepted');
  const given = await create(a, { assigneeId: bId, title: 'Find an administrator' });
  assert.equal(given.acceptance.state, 'pending');
  assert.equal(hoursBetween(given.acceptance.assignedAt, given.acceptance.dueAt), 24);
  const urgent = await create(a, { assigneeId: bId, important: true });
  assert.equal(hoursBetween(urgent.acceptance.assignedAt, urgent.acceptance.dueAt), 4);
  // A project's own hours win over the module's.
  await service.updateProject({ ...a, isAdmin: true }, projectId, { acceptHours: 10 });
  const tenHours = await create(a, { assigneeId: bId });
  assert.equal(hoursBetween(tenHours.acceptance.assignedAt, tenHours.acceptance.dueAt), 10);
  // Marking it important while it waits shortens the time to accept.
  const marked = await service.updateTask(a, tenHours.id, { important: true });
  assert.equal(hoursBetween(marked.acceptance.assignedAt, marked.acceptance.dueAt), 4);
  await service.updateProject({ ...a, isAdmin: true }, projectId, { acceptHours: null });

  // ── The migration: existing tasks are accepted once; later runs leave new tasks waiting.
  const { setSetting } = await import('../services/settings.js');
  await setSetting('tasks_acceptance_v1', 'false');
  assert.ok((await markExistingAccepted()) >= 1);
  assert.equal((await service.getTask(a, given.id, { countView: false })).acceptance.state, 'accepted', 'the migration accepted an existing task');
  const fresh = await create(a, { assigneeId: bId });
  assert.equal(await markExistingAccepted(), 0, 'the migration runs once');
  assert.equal((await service.getTask(a, fresh.id, { countView: false })).acceptance.state, 'pending');

  // ── The button: only the assignee; twice changes nothing; the chat gets the mark.
  await assert.rejects(acceptTask(a, fresh.id, {}), (err) => err.code === 'NOT_ASSIGNEE');
  const first = await acceptTask(b, fresh.ref, { comment: 'On it' });
  assert.equal(first.accepted, true);
  assert.equal(first.task.acceptance.state, 'accepted');
  assert.equal(first.task.acceptedByUser.id, bId);
  assert.equal((await acceptTask(b, fresh.ref, {})).accepted, false);
  const { rows: marks } = await db.query(
    `SELECT m.data FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id WHERE r.entity_type = 'task' AND r.entity_id = $1 AND m.data->>'event' = 'task.accepted'`,
    [fresh.id]
  );
  assert.equal(marks.length, 1);
  assert.equal(marks[0].data.comment, 'On it');
  const { rows: told } = await db.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'tasks.accepted' AND link = $2`, [aId, `/app/tasks/${fresh.ref}`]);
  assert.equal(told.length, 1, 'the originator hears about it');

  // ── Starting or completing the task accepts it; someone else moving it does not.
  const toStart = await create(a, { assigneeId: bId });
  assert.equal((await startTask(b, toStart.ref)).acceptance.state, 'accepted');
  const toComplete = await create(a, { assigneeId: bId });
  const byOther = await service.updateTask(a, toComplete.id, { statusId: (await db.query(`SELECT id FROM task_statuses WHERE project_id = $1 AND category = 'active' ORDER BY sort LIMIT 1`, [projectId])).rows[0].id });
  assert.equal(byOther.acceptance.state, 'pending', 'the originator moving it is not acceptance');
  assert.equal((await service.updateTask(b, toComplete.id, { complete: true })).acceptance.state, 'accepted');

  // ── Reassignment starts over for the new assignee; taking it oneself accepts it.
  const handed = await delegateTask(b, toStart.ref, cId);
  assert.equal(handed.assignee.id, cId);
  assert.equal(handed.acceptance.state, 'pending');
  const taken = await service.updateTask(a, toStart.id, { assigneeId: aId });
  assert.equal(taken.acceptance.state, 'accepted');

  // ── Not accepted in time: one reminder to the assignee, one word to the originator.
  const late = await create(a, { assigneeId: bId, title: 'Late one' });
  await db.query(`UPDATE tasks SET accept_due_at = NOW() - INTERVAL '1 hour', assigned_at = NOW() - INTERVAL '25 hours' WHERE id = $1`, [late.id]);
  const listedLate = await service.listTasks(a, { project: projectId, acceptance: 'late' });
  assert.deepEqual(listedLate.map((task) => task.id), [late.id]);
  assert.equal(listedLate[0].acceptance.overdue, true);
  await runAcceptanceJob();
  await runAcceptanceJob();
  const count = async (userId, kind) => (await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = $2 AND link = $3`, [userId, kind, `/app/tasks/${late.ref}`])).rows[0].n;
  assert.equal(await count(bId, 'tasks.accept_overdue'), 1);
  assert.equal(await count(aId, 'tasks.not_accepted'), 1);
  // Reassigning re-arms it.
  const again = await service.updateTask(a, late.id, { assigneeId: cId });
  assert.equal((await db.query(`SELECT accept_notified_at FROM tasks WHERE id = $1`, [again.id])).rows[0].accept_notified_at, null);

  // ── Orders: the «Поручение» flag, and the originator in a leadership group.
  const { rows: group } = await db.query(`INSERT INTO app_groups (name) VALUES ($1) RETURNING id`, [`Leadership ${key}`]);
  groupId = group[0].id;
  await db.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2)`, [aId, groupId]);
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: { tasks: { settings: { ordersGroupIds: [groupId] } } } });
  resetLeadershipCache();
  const fromLeader = await create(a, { assigneeId: bId, title: 'Order from the director' });
  const fromColleague = await create(c, { assigneeId: bId, title: 'A colleague asks' });
  const flagged = await create(c, { assigneeId: bId, title: 'Flagged', isOrder: true });
  assert.equal(fromLeader.order, true);
  assert.equal(fromColleague.order, false);
  assert.equal(flagged.order, true);
  assert.equal(own.order, false, 'a leader’s own task is not an order');
  const orders = (await service.listTasks(b, { project: projectId, orders: '1' })).map((task) => task.id);
  assert.ok(orders.includes(fromLeader.id) && orders.includes(flagged.id) && !orders.includes(fromColleague.id));
  // Only the originator (or a manager) sets the flag.
  await assert.rejects(service.updateTask(b, fromColleague.id, { isOrder: true }), (err) => err.code === 'FORBIDDEN');
  assert.equal((await service.updateTask(c, fromColleague.id, { isOrder: true })).order, true);

  // ── The inbox: my tasks waiting for acceptance, with the accept action; others' stay out.
  const mine = await inboxItems({ user: { id: bId } });
  const keys = mine.map((item) => item.id);
  assert.ok(keys.includes(fromLeader.id) && keys.includes(flagged.id));
  assert.ok(!keys.includes(fresh.id), 'accepted tasks leave the inbox');
  const item = mine.find((entry) => entry.id === fromLeader.id);
  assert.deepEqual(item.actions, ['accept', 'open']);
  assert.equal(item.module, 'tasks');
  assert.equal(item.url, `/app/tasks/${fromLeader.ref}`);
  assert.equal(item.meta.acceptPath, `/api/app/tasks/tasks/${fromLeader.ref}/accept`);
  assert.ok(!(await inboxItems({ user: { id: cId } })).some((entry) => entry.id === fromLeader.id), 'not the assignee');
  // An API token without the tasks scope sees nothing; one narrowed to other projects neither.
  assert.deepEqual(await inboxItems({ user: { id: bId }, apiToken: { policy: { scopes: { calendar: 'read' }, rules: [] } } }), []);
  const narrowed = await inboxItems({ user: { id: bId }, apiToken: { policy: { scopes: { tasks: 'write' }, rules: [] }, limits: { 'tasks.projects': [-1] } } });
  assert.ok(!narrowed.some((entry) => entry.id === fromLeader.id));
  // Accepting from the inbox takes it out.
  await acceptTask(b, item.meta.ref, {});
  assert.ok(!(await inboxItems({ user: { id: bId } })).some((entry) => entry.id === fromLeader.id));

  // ── Completed before anyone accepted it, then reopened: the time to accept starts over (not «не принята» at once);
  // reopened by the assignee it counts as accepted.
  const doneEarly = await create(a, { assigneeId: bId, title: 'Done early' });
  await db.query(`UPDATE tasks SET assigned_at = NOW() - INTERVAL '30 hours', accept_due_at = NOW() - INTERVAL '6 hours', accept_notified_at = NOW() WHERE id = $1`, [doneEarly.id]);
  await service.updateTask(a, doneEarly.id, { complete: true });
  const reopened = await service.updateTask(a, doneEarly.id, { complete: false });
  assert.equal(reopened.acceptance.state, 'pending');
  assert.equal(reopened.acceptance.overdue, false);
  assert.equal(hoursBetween(reopened.acceptance.assignedAt, reopened.acceptance.dueAt), 24);
  assert.ok(Date.now() - new Date(reopened.acceptance.assignedAt).getTime() < 60000, 'counted from the reopening');
  assert.equal((await db.query(`SELECT accept_notified_at FROM tasks WHERE id = $1`, [doneEarly.id])).rows[0].accept_notified_at, null, 'the notice is re-armed');
  await service.updateTask(a, doneEarly.id, { complete: true });
  assert.equal((await service.updateTask(b, doneEarly.id, { complete: false })).acceptance.state, 'accepted', 'reopened by the assignee');

  // ── A new time to accept (important flag) re-arms the notice while the deadline is still ahead; a passed one stays announced.
  const flagged2 = await create(a, { assigneeId: bId, title: 'Flag later', important: true });
  const notifiedAt = async () => (await db.query(`SELECT accept_notified_at FROM tasks WHERE id = $1`, [flagged2.id])).rows[0].accept_notified_at;
  await db.query(`UPDATE tasks SET assigned_at = NOW() - INTERVAL '10 hours', accept_due_at = NOW() - INTERVAL '6 hours', accept_notified_at = NOW() WHERE id = $1`, [flagged2.id]);
  await service.updateTask(a, flagged2.id, { important: false });
  assert.equal(await notifiedAt(), null, '24 h from the assignment: still ahead');
  await db.query(`UPDATE tasks SET accept_notified_at = NOW() WHERE id = $1`, [flagged2.id]);
  await service.updateTask(a, flagged2.id, { important: true });
  assert.notEqual(await notifiedAt(), null, '4 h from the assignment: passed and already announced');

  // ── My counters.
  const { mine: counters } = await service.overview(a);
  assert.ok(counters.not_accepted >= 1);
});
