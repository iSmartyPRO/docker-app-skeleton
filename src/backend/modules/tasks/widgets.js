import { query } from '../../config/database.js';
import { startOfDay } from '../../services/datetime.js';
import { bounds, dayKeys, int, pick, seriesOf } from '../../platform/widgets.js';
import { contextFromRequest } from '../shared/acl.js';
import { listProjects, listTasks, visibleProjectIds } from './service.js';

/*
 * Dashboard widgets of Tasks (registered in index.js register()): «Мои задачи»,
 * task statistics and trend, the task counters of «Welcome», the tasks of the
 * calendar's agenda and the project list for widget settings. Each provider
 * reads through this module's own service with the person's context.
 */

const tasksCtx = (req) => contextFromRequest(req, 'tasks.admin');

/** WHERE for the tasks a widget looks at: visible projects, optional "mine" and one project. */
async function taskScope(req, settings, params) {
  const ctx = tasksCtx(req);
  // Every pushed parameter must be used, or Postgres cannot type it: push on first use.
  let meIndex = 0;
  const meRef = () => {
    if (!meIndex) {
      params.push(ctx.userId);
      meIndex = params.length;
    }
    return `$${meIndex}`;
  };
  let visibleRef = '';
  if (!ctx.isAdmin) {
    params.push(await visibleProjectIds(ctx));
    visibleRef = `$${params.length}`;
  }
  // Projects the person sees, plus any task they take part in (tasks without a project too).
  const where = [
    ctx.isAdmin
      ? // Every project, but other people's tasks without a project stay private (as in Tasks).
        `(NOT p.is_personal OR t.assignee_id = ${meRef()} OR COALESCE(t.originator_id, t.created_by) = ${meRef()} OR t.created_by = ${meRef()}
         OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${meRef()})
         OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = ${meRef()}))`
      : `(t.project_id = ANY(${visibleRef}) OR t.assignee_id = ${meRef()} OR COALESCE(t.originator_id, t.created_by) = ${meRef()}
         OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${meRef()}))`,
    'p.archived_at IS NULL',
  ];
  if (ctx.limits?.task_acl) {
    params.push([...ctx.limits.task_acl]);
    where.push(`t.project_id = ANY($${params.length})`);
  }
  if (settings.scope !== 'all') where.push(`t.assignee_id = ${meRef()}`);
  const project = Number(settings.project);
  if (Number.isInteger(project) && project > 0) {
    params.push(project);
    where.push(`t.project_id = $${params.length}`);
  }
  return where.join(' AND ');
}

async function myTasks(req, settings, tz) {
  const ctx = tasksCtx(req);
  const limit = int(settings.limit, 3, 30, 8);
  const { today, tomorrow } = await bounds(tz);
  const due = pick(settings.due, ['any', 'overdue', 'today', 'week'], 'any');
  const dueTo = { overdue: new Date(), today: tomorrow, week: startOfDay(new Date(), tz, 7) }[due];
  const filters = {
    open: '1',
    sort: pick(settings.sort, ['due', 'priority', 'updated', 'created'], 'due'),
    assignee: { mine: 'me', unassigned: 'none', all: undefined }[pick(settings.scope, ['mine', 'unassigned', 'all'], 'mine')],
    dueTo: dueTo ? new Date(dueTo).toISOString() : undefined,
  };
  const project = Number(settings.project);
  if (Number.isInteger(project) && project > 0) filters.project = project;
  const items = await listTasks(ctx, filters);
  return {
    total: items.length,
    overdue: items.filter((task) => task.overdue).length,
    today: items.filter((task) => task.dueAt && new Date(task.dueAt) >= new Date(today) && new Date(task.dueAt) < new Date(tomorrow)).length,
    items: items.slice(0, limit).map((task) => ({
      id: task.id,
      ref: task.ref,
      title: task.title,
      project: task.project,
      statusName: task.statusName,
      statusCategory: task.statusCategory,
      priority: task.priority,
      dueAt: task.dueAt,
      dueTime: task.dueTime,
      overdue: task.overdue,
      checklist: task.checklist,
      assignee: task.assignee,
    })),
  };
}

async function taskStats(req, settings, tz) {
  const days = int(settings.period, 7, 365, 30);
  const { since } = await bounds(tz, days);
  const params = [];
  const scope = await taskScope(req, settings, params);
  const from = `FROM tasks t JOIN task_projects p ON p.id = t.project_id JOIN task_statuses s ON s.id = t.status_id WHERE ${scope}`;
  params.push(since);
  const sinceAt = `$${params.length}`;
  const [kpi, categories, statuses, priorities, projects] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE t.completed_at IS NULL)::int AS open,
              COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at < NOW())::int AS overdue,
              COUNT(*) FILTER (WHERE t.completed_at >= ${sinceAt})::int AS done,
              COUNT(*) FILTER (WHERE t.created_at >= ${sinceAt})::int AS created,
              COUNT(*) FILTER (WHERE t.completed_at >= ${sinceAt} AND t.due_at IS NOT NULL)::int AS done_with_due,
              COUNT(*) FILTER (WHERE t.completed_at >= ${sinceAt} AND t.due_at IS NOT NULL AND t.completed_at <= t.due_at + INTERVAL '1 day')::int AS on_time
       ${from}`,
      params
    ),
    query(`SELECT s.category, COUNT(*)::int AS count ${from} AND t.completed_at IS NULL GROUP BY s.category`, params.slice(0, -1)),
    query(
      `SELECT s.name, MIN(s.color) AS color, s.category, COUNT(*)::int AS count ${from} AND t.completed_at IS NULL
       GROUP BY s.name, s.category ORDER BY count DESC LIMIT 8`,
      params.slice(0, -1)
    ),
    query(`SELECT t.priority, COUNT(*)::int AS count ${from} AND t.completed_at IS NULL GROUP BY t.priority`, params.slice(0, -1)),
    query(
      `SELECT p.id, p.name, p.color, COUNT(*)::int AS count ${from} AND t.completed_at IS NULL
       GROUP BY p.id, p.name, p.color ORDER BY count DESC LIMIT 6`,
      params.slice(0, -1)
    ),
  ]);
  const k = kpi.rows[0];
  return {
    period: days,
    open: k.open,
    overdue: k.overdue,
    done: k.done,
    created: k.created,
    onTimeRate: k.done_with_due ? Math.round((k.on_time / k.done_with_due) * 100) : null,
    categories: Object.fromEntries(categories.rows.map((row) => [row.category, row.count])),
    statuses: statuses.rows,
    priorities: [0, 1, 2, 3].map((priority) => ({ priority, count: priorities.rows.find((row) => row.priority === priority)?.count || 0 })),
    projects: projects.rows,
  };
}

async function taskTrend(req, settings, tz) {
  const days = int(settings.period, 7, 90, 30);
  const { today, since } = await bounds(tz, days);
  const params = [];
  const scope = await taskScope(req, settings, params);
  params.push(since, tz);
  const s = `$${params.length - 1}`;
  const z = `$${params.length}`;
  const from = `FROM tasks t JOIN task_projects p ON p.id = t.project_id WHERE ${scope}`;
  const [created, done] = await Promise.all([
    query(`SELECT to_char(t.created_at AT TIME ZONE ${z}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count ${from} AND t.created_at >= ${s} GROUP BY 1`, params),
    query(`SELECT to_char(t.completed_at AT TIME ZONE ${z}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count ${from} AND t.completed_at >= ${s} GROUP BY 1`, params),
  ]);
  const keys = dayKeys(today, days, tz);
  return { days: keys, created: seriesOf(keys, created.rows), done: seriesOf(keys, done.rows) };
}

/** «Welcome»: the person's open, overdue and today's tasks. */
async function welcomeTasks(req, settings, tz) {
  const { today, tomorrow } = await bounds(tz);
  const params = [];
  const scope = await taskScope(req, { scope: 'mine' }, params);
  params.push(today, tomorrow);
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE t.completed_at IS NULL)::int AS open,
            COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at < NOW())::int AS overdue,
            COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at >= $${params.length - 1} AND t.due_at < $${params.length})::int AS today,
            COUNT(*) FILTER (WHERE t.completed_at >= $${params.length - 1})::int AS done_today
     FROM tasks t JOIN task_projects p ON p.id = t.project_id WHERE ${scope}`,
    params
  );
  return { tasks: rows[0] };
}

/** The calendar's agenda: my open tasks due in its days (unless the widget is set not to show them). */
async function agendaTasks(req, settings, tz) {
  if (settings.withTasks === false) return null;
  const days = int(settings.days, 1, 31, 7);
  const { today } = await bounds(tz);
  const to = startOfDay(new Date(), tz, days);
  const tasks = (await listTasks(tasksCtx(req), { assignee: 'me', open: '1', dueFrom: new Date(today).toISOString(), dueTo: to.toISOString(), sort: 'due' }))
    .slice(0, 50)
    .map((task) => ({ id: task.id, ref: task.ref, title: task.title, dueAt: task.dueAt, color: task.project.color, project: task.project.name }));
  return { tasks };
}

export function registerTaskWidgets(ctx) {
  const options = async (req) => ({ projects: (await listProjects(tasksCtx(req))).map((project) => ({ id: project.id, name: project.name, color: project.color })) });
  ctx.registerWidget({ type: 'myTasks', data: myTasks, options });
  ctx.registerWidget({ type: 'taskStats', data: taskStats });
  ctx.registerWidget({ type: 'taskTrend', data: taskTrend });
  ctx.registerWidgetSection('welcome', { data: welcomeTasks });
  ctx.registerWidgetSection('agenda', { data: agendaTasks });
}

export { taskScope };
