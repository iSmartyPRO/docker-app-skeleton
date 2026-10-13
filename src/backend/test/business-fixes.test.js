import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecurrence, nextOccurrence, nextRunAfterEdit, payloadForCopy } from '../modules/tasks/templates.js';

/*
 * Fixes in Tasks (recurring templates, personal tasks, moves, API token
 * limits). The pure parts always run; the database part needs a test
 * database (never production!):
 *
 *   TASKS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/business-fixes.test.js
 */

const iso = (date) => (date ? date.toISOString() : null);

// ── Monthly and yearly schedules keep their day ───────────────────────────

test('monthly on the 31st: clamps per month, never drifts to the 28th', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'month', start: '2026-01-31', time: '09:00', tz: 'UTC' });
  const seen = [];
  let at = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 5; i += 1) {
    at = nextOccurrence(rec, at, i);
    seen.push(iso(at).slice(0, 10));
  }
  assert.deepEqual(seen, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('yearly on 29 February: 28 Feb in common years, 29 Feb again in leap years', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'year', start: '2024-02-29', time: '09:00', tz: 'UTC' });
  const seen = [];
  let at = new Date('2024-01-01T00:00:00Z');
  for (let i = 0; i < 5; i += 1) {
    at = nextOccurrence(rec, at, i);
    seen.push(iso(at).slice(0, 10));
  }
  assert.deepEqual(seen, ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

// ── Editing a recurring template does not repeat the first copy's slot ────

test('edit before the first copy\'s slot continues after that slot', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00', tz: 'UTC' });
  const now = new Date('2026-10-12T08:30:00Z');
  const firstSlot = new Date('2026-10-12T09:00:00Z'); // taken by the copy made at creation
  assert.equal(iso(nextRunAfterEdit(rec, firstSlot, 1, now)), '2026-10-13T09:00:00.000Z');
  // The old behaviour (from now) would make today's 09:00 a second time.
  assert.equal(iso(nextOccurrence(rec, now, 1)), '2026-10-12T09:00:00.000Z');
  // A slot already in the past changes nothing: the schedule goes on from now.
  assert.equal(iso(nextRunAfterEdit(rec, new Date('2026-10-10T09:00:00Z'), 3, now)), '2026-10-12T09:00:00.000Z');
  assert.equal(iso(nextRunAfterEdit(rec, null, 0, now)), '2026-10-12T09:00:00.000Z');
});

// ── Copies get their own reminders and plan ───────────────────────────────

test('a copy shifts set-time reminders and the plan by its slot; deadline reminders stay', () => {
  const anchor = '2026-10-12T09:00:00.000Z';
  const slot = '2026-10-19T09:00:00.000Z';
  const payload = {
    title: 'Weekly report',
    reminders: [
      { mode: 'at', remindAt: '2026-10-12T15:00:00.000Z', targets: ['me'] },
      { mode: 'before', beforeMinutes: 60 },
    ],
    planStart: '2026-10-12T09:00:00.000Z',
    planEnd: '2026-10-13T18:00:00.000Z',
  };
  const copy = payloadForCopy(payload, anchor, slot, new Date(slot));
  assert.equal(copy.reminders.length, 2);
  assert.equal(copy.reminders[0].remindAt, '2026-10-19T15:00:00.000Z');
  assert.deepEqual(copy.reminders[1], { mode: 'before', beforeMinutes: 60 });
  assert.equal(copy.planStart, '2026-10-19T09:00:00.000Z');
  assert.equal(copy.planEnd, '2026-10-20T18:00:00.000Z');
  // The template itself is not changed.
  assert.equal(payload.reminders[0].remindAt, '2026-10-12T15:00:00.000Z');
});

test('a template saved without an anchor: past set-time reminders and plans are dropped', () => {
  const now = new Date('2026-10-20T09:00:00Z');
  const copy = payloadForCopy(
    {
      reminders: [
        { mode: 'at', remindAt: '2026-10-12T15:00:00.000Z' },
        { mode: 'at', remindAt: '2026-10-25T15:00:00.000Z' },
      ],
      planStart: '2026-10-12T09:00:00.000Z',
      planEnd: '2026-10-30T09:00:00.000Z',
    },
    null,
    now,
    now
  );
  assert.deepEqual(copy.reminders.map((r) => r.remindAt), ['2026-10-25T15:00:00.000Z']);
  assert.equal(copy.planStart, null);
  assert.equal(copy.planEnd, null);
});

// ── Database: personal tasks, moves, token limits on templates ───────────

const enabled = process.env.TASKS_DB_TEST === '1';
const skip = enabled ? false : 'set TASKS_DB_TEST=1 and a test database to run';
let db = null;
const cleanup = { projects: [], tasks: [], templates: [] };

after(async () => {
  if (!db) return;
  if (cleanup.templates.length) await db.query(`DELETE FROM task_templates WHERE id = ANY($1)`, [cleanup.templates]);
  if (cleanup.tasks.length) await db.query(`DELETE FROM tasks WHERE id = ANY($1)`, [cleanup.tasks]);
  if (cleanup.projects.length) await db.query(`DELETE FROM task_projects WHERE id = ANY($1)`, [cleanup.projects]);
  await db.closePool();
});

test('database: admins and personal tasks, moving out of a project, template limits', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureTasksSchema, ensurePersonalProject } = await import('../modules/tasks/schema.js');
  await ensureTasksSchema();
  await ensurePersonalProject();
  const tasks = await import('../modules/tasks/service.js');
  const { saveTemplate } = await import('../modules/tasks/templates.js');
  const { rows: users } = await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 3`);
  assert.ok(users.length >= 3, 'the test database needs three users');
  const ctxOf = (userId, isAdmin = false, limits = null) => ({ userId, groupIds: new Set(), roleIds: new Set(), isAdmin, limits });
  const admin = ctxOf(users[0].id, true);
  const owner = ctxOf(users[1].id);
  const viewer = ctxOf(users[2].id);
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);

  // 6: another person's task without a project stays private to administrators.
  const personal = await tasks.createTask(owner, { title: 'Private errand' });
  cleanup.tasks.push(personal.id);
  await assert.rejects(tasks.getTask(admin, personal.ref, { countView: false }), { statusCode: 404 });
  const adminList = await tasks.listTasks(admin, {});
  assert.ok(!adminList.some((task) => task.id === personal.id), 'not in the administrator\'s lists');
  const ownList = await tasks.listTasks(owner, {});
  assert.ok(ownList.some((task) => task.id === personal.id), 'still the owner\'s');

  // A: an assignee with view access to the project cannot take the task out of it.
  const project = await tasks.createProject(admin, { name: `Fix test ${stamp}`, key: `FX${stamp}`.slice(0, 10), visibility: 'readonly' }, { locale: 'en', allowed: true });
  cleanup.projects.push(project.id);
  const other = await tasks.createProject(admin, { name: `Fix test B ${stamp}`, key: `FY${stamp}`.slice(0, 10), visibility: 'team' }, { locale: 'en', allowed: true });
  cleanup.projects.push(other.id);
  const assigned = await tasks.createTask(admin, { title: 'Assigned to a viewer', projectId: project.id, assigneeId: viewer.userId });
  cleanup.tasks.push(assigned.id);
  await assert.rejects(tasks.checkMoveToProject(viewer, assigned.id, null), { statusCode: 403 });
  await assert.rejects(tasks.checkMoveToProject(viewer, assigned.id, other.id), { statusCode: 403 });
  const allowed = await tasks.checkMoveToProject(admin, assigned.id, other.id);
  assert.equal(allowed.same, false);
  // A token limited to the other project cannot move a task into "no project".
  const inOther = await tasks.createTask(admin, { title: 'In the other project', projectId: other.id });
  cleanup.tasks.push(inOther.id);
  const limited = ctxOf(users[0].id, false, { task_acl: new Set([other.id]) });
  await assert.rejects(tasks.checkMoveToProject(limited, inOther.id, null), { statusCode: 404 });

  // B: a template's project must be within the token's projects.
  await assert.rejects(saveTemplate(limited, { title: 'Out of limits', payload: { title: 'x', projectId: project.id } }), { statusCode: 404 });
  const fine = await saveTemplate(limited, { title: 'Within limits', payload: { title: 'x', projectId: other.id } });
  cleanup.templates.push(fine.id);
  await assert.rejects(saveTemplate(limited, { title: 'Moved out', payload: { title: 'x', projectId: project.id } }, fine.id), { statusCode: 404 });
  // A viewer of a read-only project cannot make templates for it.
  await assert.rejects(saveTemplate(viewer, { title: 'Read-only', payload: { title: 'x', projectId: project.id } }), { statusCode: 403 });

  // 11: deleting a task removes its conversation.
  await db.query(`INSERT INTO chat_rooms (kind, entity_type, entity_id) VALUES ('entity', 'task', $1) ON CONFLICT DO NOTHING`, [inOther.id]).catch(() => {});
  await tasks.deleteTask(admin, inOther.id);
  const rooms = await db.query(`SELECT 1 FROM chat_rooms WHERE entity_type = 'task' AND entity_id = $1`, [inOther.id]);
  assert.equal(rooms.rows.length, 0);
});
