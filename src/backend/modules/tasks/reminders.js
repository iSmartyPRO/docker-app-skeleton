import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { reminderText, taskMessage } from './messages.js';
import { taskEvent } from './chat.js';
import { requestAs } from '../../api/events.js';
import { contextFromRequest, LEVEL } from '../shared/acl.js';
import { loadTaskRow, taskLevel, taskWebhook } from './service.js';

/*
 * Scheduled reminders.
 *  runReminders (every few minutes):
 *   - "due soon": open tasks with an assignee due within N hours, once per due date
 *   - "overdue": once, to the assignee and the originator
 *   both also land in the task's conversation (with "complete" / "change the
 *   deadline" actions there). Changing the deadline resets both markers.
 *  runCustomReminders (every minute): reminders people set on a task — to whom,
 *   when (a date, or some time before the deadline) and through which channels.
 */

async function stillParticipants(taskId, userIds) {
  const { rows } = await query(
    `SELECT DISTINCT u FROM unnest($2::int[]) AS u
     WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.id = $1 AND (t.assignee_id = u OR t.originator_id = u OR t.created_by = u))
        OR EXISTS (SELECT 1 FROM task_members m WHERE m.task_id = $1 AND m.user_id = u)
        OR EXISTS (SELECT 1 FROM task_watchers w WHERE w.task_id = $1 AND w.user_id = u)`,
    [taskId, userIds]
  );
  return rows.map((row) => row.u);
}

/** May this person still see the task (project access counts, not only roles)? */
async function canStillView(taskId, userId) {
  try {
    const req = await requestAs(userId);
    if (!req) return false;
    const row = await loadTaskRow(taskId);
    return (await taskLevel(contextFromRequest(req, 'tasks.admin'), row)) >= LEVEL.view;
  } catch {
    return false;
  }
}

export async function runReminders() {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.tasks;
  if (!module?.enabled || module.settings.reminders === false) return;
  const hours = Number(module.settings.dueSoonHours) || 24;

  const soon = await query(
    `UPDATE tasks t SET due_notified_at = NOW()
     FROM task_projects p
     WHERE p.id = t.project_id AND p.archived_at IS NULL AND t.deferred_at IS NULL
       AND t.completed_at IS NULL AND t.assignee_id IS NOT NULL AND t.due_notified_at IS NULL
       AND t.due_at > NOW() AND t.due_at <= NOW() + make_interval(hours => $1)
     RETURNING t.id, t.number, t.title, t.assignee_id, t.due_at, p.key`,
    [hours]
  );
  for (const row of soon.rows) {
    const ref = `${row.key}-${row.number}`;
    await notify({
      userIds: await stillParticipants(row.id, [row.assignee_id]),
      kind: 'tasks.due_soon',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      render: taskMessage('dueSoon', { ref, title: row.title, dueAt: row.due_at }),
    });
    await taskEvent(row.id, null, { event: 'task.due_soon', dueAt: row.due_at, ref });
    await taskWebhook('task.due_soon', row.id);
  }

  const overdue = await query(
    `UPDATE tasks t SET overdue_notified_at = NOW()
     FROM task_projects p
     WHERE p.id = t.project_id AND p.archived_at IS NULL AND t.deferred_at IS NULL
       AND t.completed_at IS NULL AND t.overdue_notified_at IS NULL
       AND t.due_at IS NOT NULL AND t.due_at < NOW()
       AND t.due_at > NOW() - INTERVAL '7 days'
     RETURNING t.id, t.number, t.title, t.assignee_id, t.created_by, t.originator_id, t.due_at, p.key`
  );
  for (const row of overdue.rows) {
    const ref = `${row.key}-${row.number}`;
    await notify({
      userIds: await stillParticipants(row.id, [row.assignee_id, row.originator_id || row.created_by].filter(Boolean)),
      kind: 'tasks.overdue',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      render: taskMessage('overdue', { ref, title: row.title }),
    });
    await taskEvent(row.id, null, { event: 'task.overdue', dueAt: row.due_at, ref });
    await taskWebhook('task.overdue', row.id);
  }
}

const ROLE_SQL = {
  assignee: `SELECT assignee_id FROM tasks WHERE id = $1`,
  originator: `SELECT COALESCE(originator_id, created_by) FROM tasks WHERE id = $1`,
  coassignees: `SELECT user_id FROM task_members WHERE task_id = $1 AND role = 'coassignee'`,
  auditors: `SELECT user_id FROM task_members WHERE task_id = $1 AND role = 'auditor'`,
};

export async function runCustomReminders() {
  const parsed = parseSettings(await getSettings());
  if (!parsed.modules.tasks?.enabled) return;
  const { rows } = await query(
    `UPDATE task_reminders r SET sent_at = NOW()
     FROM tasks t JOIN task_projects p ON p.id = t.project_id
     WHERE t.id = r.task_id AND r.sent_at IS NULL AND t.completed_at IS NULL
       AND ((r.mode = 'at' AND r.remind_at <= NOW())
         OR (r.mode = 'before' AND t.due_at IS NOT NULL AND t.due_at - make_interval(mins => r.before_minutes) <= NOW()))
     RETURNING r.*, t.title, t.number, t.due_at, p.key`
  );
  for (const reminder of rows) {
    const ids = new Set();
    for (const target of reminder.targets) {
      if (target === 'me') ids.add(reminder.created_by);
      else if (ROLE_SQL[target]) (await query(ROLE_SQL[target], [reminder.task_id])).rows.forEach((row) => ids.add(Object.values(row)[0]));
    }
    const recipients = await stillParticipants(reminder.task_id, [...ids].filter(Boolean));
    // "Remind me" from someone who follows the task through its project, not as a participant:
    // they still get it while they may see the task.
    if (reminder.targets.includes('me') && reminder.created_by && !recipients.includes(reminder.created_by) && (await canStillView(reminder.task_id, reminder.created_by))) {
      recipients.push(reminder.created_by);
    }
    const ref = `${reminder.key}-${reminder.number}`;
    const channels = reminder.channels || ['app'];
    await notify({
      userIds: recipients,
      kind: 'tasks.reminder',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      // The in-app inbox always; outside it only the chosen channels.
      channels: [...(channels.includes('app') ? ['push'] : []), ...(channels.includes('email') ? ['email'] : []), ...(channels.includes('messenger') ? ['telegram', 'whatsapp', 'mattermost'] : [])],
      // The deadline in each recipient's own zone and formats.
      render: (locale, regional) => reminderText(locale, regional, { ref, title: reminder.title, dueAt: reminder.due_at }),
    });
    await taskEvent(reminder.task_id, null, { event: 'task.reminder', ref, dueAt: reminder.due_at });
  }
}
