import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { LEVEL, membersOf } from '../shared/acl.js';
import { taskMessage } from './messages.js';

/** Recipients who can still open the project (access may have changed). */
async function stillMembers(projectId, userIds) {
  const members = new Set((await membersOf('task_acl', projectId, LEVEL.view)).map((user) => user.id));
  return userIds.filter((id) => members.has(id));
}

/**
 * Runs every few minutes (scheduler, advisory-locked):
 *  - "due soon": open tasks with an assignee due within N hours, once per due date
 *  - "overdue": once, to the assignee and the author
 * Changing the due date resets both markers (service.updateTask).
 */
export async function runReminders() {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.tasks;
  if (!module?.enabled || module.settings.reminders === false) return;
  const hours = Number(module.settings.dueSoonHours) || 24;

  const soon = await query(
    `UPDATE tasks t SET due_notified_at = NOW()
     FROM task_projects p
     WHERE p.id = t.project_id AND p.archived_at IS NULL
       AND t.completed_at IS NULL AND t.assignee_id IS NOT NULL AND t.due_notified_at IS NULL
       AND t.due_at > NOW() AND t.due_at <= NOW() + make_interval(hours => $1)
     RETURNING t.id, t.number, t.title, t.assignee_id, t.project_id, p.key`,
    [hours]
  );
  for (const row of soon.rows) {
    const ref = `${row.key}-${row.number}`;
    await notify({
      userIds: await stillMembers(row.project_id, [row.assignee_id]),
      kind: 'tasks.due_soon',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      render: taskMessage('dueSoon', { ref, title: row.title }),
    });
  }

  const overdue = await query(
    `UPDATE tasks t SET overdue_notified_at = NOW()
     FROM task_projects p
     WHERE p.id = t.project_id AND p.archived_at IS NULL
       AND t.completed_at IS NULL AND t.overdue_notified_at IS NULL
       AND t.due_at IS NOT NULL AND t.due_at < NOW()
       AND t.due_at > NOW() - INTERVAL '7 days'
     RETURNING t.id, t.number, t.title, t.assignee_id, t.created_by, t.project_id, p.key`
  );
  for (const row of overdue.rows) {
    const ref = `${row.key}-${row.number}`;
    await notify({
      userIds: await stillMembers(row.project_id, [row.assignee_id, row.created_by].filter(Boolean)),
      kind: 'tasks.overdue',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      render: taskMessage('overdue', { ref, title: row.title }),
    });
  }
}
