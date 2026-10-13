import { query } from '../../config/database.js';
import { decide, limitsByTable } from '../../api/scopes.js';
import { requestAs } from '../../api/events.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { registerInboxProvider } from '../../services/inbox.js';
import { clean, contextFromRequest, httpError, LEVEL, requireLevel } from '../shared/acl.js';
import { taskEvent } from './chat.js';
import { taskMessage } from './messages.js';
import { afterAccepted, getTask, listTasks, loadTaskRow, taskLevel, taskRef } from './service.js';

/*
 * «Принять в работу»: a task given to someone other than its originator waits
 * until its assignee accepts it — with the button (optionally with a comment),
 * or by starting or completing the task (service.js, updateTask). Co-assignees
 * help the assignee and do not accept separately.
 *
 *   acceptTask         the button / POST /tasks/:ref/accept (also from the inbox)
 *   runAcceptanceJob   not accepted in time: a reminder to the assignee and a word
 *                      to the originator, once per assignment
 *   registerTasksInbox tasks waiting for my acceptance on the «Ждёт меня» page
 */

export async function acceptTask(ctx, refOrId, input = {}) {
  const row = await loadTaskRow(refOrId);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  if (row.assignee_id !== ctx.userId) throw httpError(403, 'Only the assignee accepts a task', 'NOT_ASSIGNEE');
  if (row.completed_at) throw httpError(400, 'The task is already done', 'NOT_PENDING');
  const comment = clean(input.comment, 1000) || null;
  // Accepting twice changes nothing (the inbox and the card may race).
  const { rowCount } = await query(
    `UPDATE tasks SET accepted_at = NOW(), accepted_by = $2, updated_at = NOW()
     WHERE id = $1 AND assignee_id = $2 AND accepted_at IS NULL AND completed_at IS NULL`,
    [row.id, ctx.userId]
  );
  if (rowCount) {
    await query(`INSERT INTO task_activity (task_id, actor_id, kind, data) VALUES ($1, $2, 'accepted', $3)`, [row.id, ctx.userId, JSON.stringify({ via: input.via || 'button', comment })]);
    await afterAccepted(ctx, row, { via: input.via || 'button', comment });
  }
  return { task: await getTask(ctx, row.id, { countView: false }), accepted: Boolean(rowCount) };
}

const hoursSince = (from) => Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 3600000));

/** Tasks whose time to accept is over: tell the assignee and the originator, once. */
export async function runAcceptanceJob() {
  const parsed = parseSettings(await getSettings());
  if (!parsed.modules.tasks?.enabled) return { notified: 0 };
  // Deferred tasks and archived projects wait; the marker is set before anyone is told,
  // so a second run (or a second instance) never repeats it.
  const { rows } = await query(
    `UPDATE tasks t SET accept_notified_at = NOW()
     FROM task_projects p
     WHERE p.id = t.project_id AND p.archived_at IS NULL AND t.deferred_at IS NULL
       AND t.completed_at IS NULL AND t.assignee_id IS NOT NULL AND t.accepted_at IS NULL
       AND t.accept_due_at IS NOT NULL AND t.accept_due_at < NOW() AND t.accept_notified_at IS NULL
     RETURNING t.id, t.number, t.title, t.assignee_id, t.originator_id, t.created_by, t.assigned_at, t.accept_due_at, p.key`
  );
  for (const row of rows) {
    try {
      const ref = taskRef(row.key, row.number);
      const hours = hoursSince(row.assigned_at || row.accept_due_at);
      const link = `/app/tasks/${ref}`;
      await notify({ userIds: [row.assignee_id], kind: 'tasks.accept_overdue', module: 'tasks', link, render: taskMessage('acceptOverdue', { ref, title: row.title, hours }) });
      const originator = row.originator_id || row.created_by;
      if (originator && originator !== row.assignee_id) {
        const { rows: names } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [row.assignee_id]);
        await notify({ userIds: [originator], kind: 'tasks.not_accepted', module: 'tasks', link, render: taskMessage('notAccepted', { ref, title: row.title, hours, assignee: names[0]?.name || '' }) });
      }
      await taskEvent(row.id, null, { event: 'task.not_accepted', ref, hours, dueAt: row.accept_due_at });
    } catch (err) {
      console.warn(`[tasks] acceptance reminder for task ${row.id} failed:`, err.message);
    }
  }
  return { notified: rows.length };
}

/**
 * The tasks context of an inbox request. The inbox passes { user } and, when it
 * has them, the request (`req`, with an API token's scopes and limits) or the
 * token itself (`apiToken: { policy, limits }`); a token without the tasks
 * scope sees nothing here.
 */
async function inboxContext(ctx) {
  const userId = ctx?.user?.id || ctx?.req?.user?.id;
  if (!userId) return null;
  const policy = ctx.req?.apiToken?.policy || ctx.apiToken?.policy || null;
  if (policy && !decide(policy, 'GET', '/app/tasks/tasks').ok) return null;
  const req = ctx.req?.user ? ctx.req : await requestAs(userId);
  if (!req) return null;
  if (!ctx.req?.user) {
    // Limits come either as stored on the token ({ 'tasks.projects': [...] }) or by table (req.apiLimits).
    const limits = ctx.apiLimits || ctx.apiToken?.limits || null;
    if (limits) req.apiLimits = Array.isArray(limits['tasks.projects']) ? limitsByTable(limits) : limits;
  }
  return contextFromRequest(req, 'tasks.admin');
}

/** Inbox items: the tasks waiting for my acceptance, which I may see. */
export async function inboxItems(ctx) {
  const tasksCtx = await inboxContext(ctx);
  if (!tasksCtx) return [];
  const tasks = await listTasks(tasksCtx, { assignee: 'me', acceptance: 'pending', sort: 'due', limit: 200 });
  return tasks.map((task) => ({
    key: `tasks:${task.id}`,
    module: 'tasks',
    kind: 'acceptance',
    id: task.id,
    title: task.title,
    number: task.ref,
    urgency: task.important || task.priority === 3 ? 'urgent' : 'normal',
    author: task.originator ? { id: task.originator.id, name: task.originator.name, avatarUrl: task.originator.avatarUrl } : null,
    dueAt: task.acceptance?.dueAt || null,
    since: task.acceptance?.assignedAt || task.createdAt,
    overdue: Boolean(task.acceptance?.overdue),
    url: `/app/tasks/${task.ref}`,
    actions: ['accept', 'open'],
    meta: {
      ref: task.ref,
      project: task.project.personal ? null : task.project.name,
      order: task.order,
      taskDueAt: task.dueAt,
      // POST here with { comment? } accepts the task (same as the button in the task card).
      acceptPath: `/api/app/tasks/tasks/${encodeURIComponent(task.ref)}/accept`,
    },
  }));
}

export function registerTasksInbox() {
  registerInboxProvider('tasks.acceptance', inboxItems, { module: 'tasks' });
}
