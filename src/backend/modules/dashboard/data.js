import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { getSettings, getSettingsView, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { listNotifications, unreadCount } from '../../services/notifications.js';
import { getUserStats, recentLogins } from '../../services/users.js';
import { contextFromRequest, httpError } from '../shared/acl.js';
import { listProjects, listTasks, visibleProjectIds } from '../tasks/service.js';
import { listCalendars, listEvents } from '../calendar/service.js';
import { recent as recentNodes, usageOf } from '../files/service.js';
import { driveContext, home as driveHome, listShortcuts } from '../drive/service.js';
import { ACTION_GROUPS } from '../drive/activity.js';
import { getHome as kbHome } from '../kb/service.js';
import { contextFromRequest as kbContext } from '../kb/access.js';
import { board, resourcesContext } from '../resources/service.js';
import { companiesContext, companiesSettings, listCompanies } from '../companies/service.js';
import { WIDGETS } from './widgets.js';
import { inboxFor } from '../../services/inbox.js';
import { isoDay, startOfDay, zonedParts } from '../../services/datetime.js';
import { requestZone } from '../../services/regional.js';

/*
 * Data behind each widget. Every provider reads through the owning module's
 * own service with the person's context, so a widget never shows more than
 * the module itself would. Day boundaries follow the person's zone (an
 * explicit `tz` from the browser, else their region settings).
 */

const DAY = 24 * 3600 * 1000;

const AREA_PATHS = { notifications: '/notifications', 'admin.users': '/admin/users' };

/**
 * Whether the request may read an area (a module id, 'notifications',
 * 'admin.users'): an API token needs the scope it would need to call that
 * area's API directly; session requests (no token) always may.
 */
export function areaAllowed(req, area) {
  const policy = req?.apiToken?.policy;
  if (!policy || !area) return true;
  return decide(policy, 'GET', AREA_PATHS[area] || `/app/${area}`).ok;
}


const int = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Start of today, tomorrow and of the day `days - 1` ago in the person's zone, as instants (DST safe). */
export function bounds(tz, days = 1, now = new Date()) {
  return { today: startOfDay(now, tz), tomorrow: startOfDay(now, tz, 1), since: startOfDay(now, tz, -(days - 1)) };
}

/** "YYYY-MM-DD" for each of the last `days` days in the zone, oldest first. */
function dayKeys(today, days, tz) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(fmt.format(new Date(new Date(today).getTime() - i * DAY + 12 * 3600 * 1000)));
  return keys;
}

const seriesOf = (keys, rows, field = 'count') => {
  const map = new Map(rows.map((row) => [row.day, Number(row[field])]));
  return keys.map((key) => map.get(key) || 0);
};

// ── Tasks ───────────────────────────────────────────────────────────────────

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

// ── Calendar ────────────────────────────────────────────────────────────────

const calCtx = (req) => contextFromRequest(req, 'calendar.admin');

const eventShape = (event) => ({
  key: event.key,
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  color: event.color,
  calendarName: event.calendarName,
  location: event.location,
  meetingUrl: event.meetingUrl,
  occurrence: event.occurrence,
  myStatus: event.myStatus,
});

async function agenda(req, settings, tz) {
  const days = int(settings.days, 1, 31, 7);
  const { today } = await bounds(tz);
  const to = startOfDay(new Date(), tz, days);
  const calendars = Array.isArray(settings.calendars) && settings.calendars.length ? settings.calendars.join(',') : undefined;
  const events = await listEvents(calCtx(req), { from: new Date(today).toISOString(), to: to.toISOString(), calendars });
  let tasks = [];
  const modules = parseSettings(await getSettings()).modules;
  if (settings.withTasks !== false && modules.tasks?.enabled && areaAllowed(req, 'tasks')) {
    tasks = (await listTasks(tasksCtx(req), { assignee: 'me', open: '1', dueFrom: new Date(today).toISOString(), dueTo: to.toISOString(), sort: 'due' }))
      .slice(0, 50)
      .map((task) => ({ id: task.id, ref: task.ref, title: task.title, dueAt: task.dueAt, color: task.project.color, project: task.project.name }));
  }
  return {
    from: today,
    days,
    events: events.filter((event) => !event.end || new Date(event.end) > new Date() || event.allDay).slice(0, 200).map(eventShape),
    tasks,
  };
}

async function miniCalendar(req, settings, tz, input) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > 45 * DAY) throw httpError(400, 'Invalid date range', 'INVALID_RANGE');
  const calendars = Array.isArray(settings.calendars) && settings.calendars.length ? settings.calendars.join(',') : undefined;
  const events = await listEvents(calCtx(req), { from: from.toISOString(), to: to.toISOString(), calendars });
  return { events: events.slice(0, 600).map(eventShape) };
}

// ── Files, drive, knowledge base, links, companies ─────────────────────────

async function recentFiles(req, settings) {
  const ctx = contextFromRequest(req, 'files.admin');
  const limit = int(settings.limit, 3, 20, 6);
  const [items, usage] = await Promise.all([recentNodes(ctx), usageOf(ctx.userId)]);
  return {
    usage,
    items: items.slice(0, limit).map((node) => ({ id: node.id, name: node.name, ext: node.file?.ext, size: node.file?.size, updatedAt: node.updatedAt })),
  };
}

async function drive(req, settings) {
  const ctx = driveContext(req);
  const kind = pick(settings.list, ['recent', 'favorites'], 'recent');
  const [state, items] = await Promise.all([driveHome(ctx), listShortcuts(kind, ctx)]);
  return {
    title: state.drive?.title || null,
    shares: (state.shares || []).map((share) => ({ id: share.id, title: share.title, color: share.color, state: share.state })),
    items: items.slice(0, int(settings.limit, 3, 20, 6)),
  };
}

async function driveActivity(req, settings, tz) {
  const days = int(settings.period, 7, 90, 14);
  const { today, since } = await bounds(tz, days);
  const groupCase = `CASE ${Object.entries(ACTION_GROUPS)
    .map(([group, actions]) => `WHEN a.action IN (${actions.map((action) => `'${action}'`).join(',')}) THEN '${group}'`)
    .join(' ')} ELSE 'other' END`;
  const [perDay, totals, people] = await Promise.all([
    query(
      `SELECT to_char(a.at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, ${groupCase} AS grp, COUNT(*)::int AS count
       FROM drive_activity a WHERE a.at >= $1 GROUP BY 1, 2`,
      [since, tz]
    ),
    query(
      `SELECT COUNT(*)::int AS events, COUNT(DISTINCT a.user_id)::int AS people, COUNT(*) FILTER (WHERE NOT a.ok)::int AS failures
       FROM drive_activity a WHERE a.at >= $1`,
      [since]
    ),
    query(
      `SELECT a.user_id AS id, MAX(COALESCE(u.display_name, u.username, a.user_name)) AS name, COUNT(*)::int AS count
       FROM drive_activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.at >= $1 AND a.user_id IS NOT NULL GROUP BY a.user_id ORDER BY count DESC LIMIT 5`,
      [since]
    ),
  ]);
  const keys = dayKeys(today, days, tz);
  const groups = ['browse', 'download', 'change', 'delete'];
  const series = Object.fromEntries(groups.map((group) => [group, seriesOf(keys, perDay.rows.filter((row) => row.grp === group))]));
  return { days: keys, series, ...totals.rows[0], top: people.rows };
}

async function kbRecent(req, settings) {
  const home = await kbHome(kbContext(req));
  return {
    items: home.recent.slice(0, int(settings.limit, 3, 12, 6)).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      file: item.file ? { ext: item.file.ext } : null,
      updatedAt: item.updatedAt,
      author: item.author,
    })),
  };
}

async function links(req, settings) {
  const data = await board(resourcesContext(req));
  let items = data.items;
  const category = Number(settings.category);
  if (Number.isInteger(category) && category > 0) items = items.filter((item) => item.categoryId === category);
  // The person's own order and hidden tiles from the resources page.
  const order = data.layout?.order || [];
  const hidden = new Set(data.layout?.hidden || []);
  items = items.filter((item) => !hidden.has(item.id));
  if (order.length) {
    const rank = new Map(order.map((id, index) => [id, index]));
    items = [...items].sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
  }
  return { items: items.slice(0, int(settings.limit, 2, 40, 12)), categories: data.categories };
}

async function companies(req, settings, tz) {
  const ctx = companiesContext(req);
  const config = await companiesSettings();
  const [totals, countries, relations, months, recentList] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1)::int AS this_month,
              (SELECT COUNT(*)::int FROM cmp_people WHERE archived_at IS NULL) AS people,
              (SELECT ROUND(AVG(score)::numeric, 1) FROM cmp_ratings WHERE entity_type = 'company') AS rating
       FROM cmp_companies WHERE archived_at IS NULL`,
      [tz]
    ),
    query(`SELECT country, COUNT(*)::int AS count FROM cmp_companies WHERE archived_at IS NULL GROUP BY country ORDER BY count DESC LIMIT 6`),
    query(
      `SELECT rel, COUNT(*)::int AS count FROM cmp_companies, unnest(relations) AS rel
       WHERE archived_at IS NULL GROUP BY rel ORDER BY count DESC LIMIT 6`
    ),
    query(
      `SELECT to_char(date_trunc('month', created_at AT TIME ZONE $1), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM cmp_companies WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE $1) - INTERVAL '5 months'
       GROUP BY 1 ORDER BY 1`,
      [tz]
    ),
    listCompanies(ctx, { sort: 'created', limit: int(settings.limit, 3, 10, 5) }),
  ]);
  const labels = new Map((config.relations || []).map((item) => [item.key, item]));
  // This month and the five before it, in the person's zone.
  const local = zonedParts(new Date(), tz);
  const monthKeys = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(local.year, local.month - 1 - i, 1));
    monthKeys.push(date.toISOString().slice(0, 7));
  }
  const byMonth = new Map(months.rows.map((row) => [row.month, row.count]));
  return {
    ...totals.rows[0],
    rating: totals.rows[0].rating == null ? null : Number(totals.rows[0].rating),
    countries: countries.rows,
    relations: relations.rows.map((row) => ({ key: row.rel, label: labels.get(row.rel)?.label || row.rel, color: labels.get(row.rel)?.color || null, count: row.count })),
    months: monthKeys.map((month) => ({ month, count: byMonth.get(month) || 0 })),
    recent: recentList.items.map((company) => ({ id: company.id, name: company.name, country: company.country, createdAt: company.created_at, rating: company.rating_avg ?? null })),
  };
}

// ── People (console) and personal ───────────────────────────────────────────

async function people(req, settings, tz) {
  const days = int(settings.period, 7, 90, 14);
  const { today, since } = await bounds(tz, days);
  const [stats, logins, joined, last] = await Promise.all([
    getUserStats(),
    query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
              COUNT(*) FILTER (WHERE success)::int AS ok, COUNT(*) FILTER (WHERE NOT success)::int AS failed
       FROM login_attempts WHERE created_at >= $1 GROUP BY 1`,
      [since, tz]
    ),
    query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= $1`, [since]),
    recentLogins(5),
  ]);
  const keys = dayKeys(today, days, tz);
  return {
    total: stats.total,
    active30d: stats.active30d,
    blocked: stats.blocked,
    disabled: stats.disabled,
    groups: stats.groups,
    joined: joined.rows[0].count,
    days: keys,
    logins: seriesOf(keys, logins.rows, 'ok'),
    failed: seriesOf(keys, logins.rows, 'failed'),
    recent: last.map((user) => ({ id: user.id, name: user.displayName || user.username, avatarUrl: user.avatarUrl || null, at: user.lastLoginAt })),
  };
}

async function notifications(req, settings) {
  return listNotifications(req.user.id, { limit: int(settings.limit, 3, 20, 6), unreadOnly: Boolean(settings.unreadOnly) });
}

/** «Ждёт меня»: the first items of the inbox (approvals, tasks waiting for acceptance…) and the counters. */
async function inbox(req, settings) {
  const { items } = await inboxFor(req);
  const list = settings.module ? items.filter((item) => item.module === settings.module) : items;
  return { items: list.slice(0, int(settings.limit, 3, 20, 6)), total: list.length, overdue: list.filter((item) => item.overdue).length };
}

async function welcome(req, settings, tz) {
  const modules = parseSettings(await getSettings()).modules;
  const { today, tomorrow } = await bounds(tz);
  const out = areaAllowed(req, 'notifications') ? { unread: await unreadCount(req.user.id) } : {};
  if (modules.tasks?.enabled && areaAllowed(req, 'tasks')) {
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
    out.tasks = rows[0];
  }
  if (modules.calendar?.enabled && areaAllowed(req, 'calendar')) {
    const now = new Date();
    const events = await listEvents(calCtx(req), { from: new Date(today).toISOString(), to: startOfDay(now, tz, 7).toISOString() });
    // All-day events are calendar days: today's is the person's today.
    const todayKey = isoDay(now, tz);
    const todays = events.filter((event) => (event.allDay ? event.start <= todayKey : new Date(event.start) < new Date(tomorrow)));
    const next = events.find((event) => !event.allDay && new Date(event.start) > now);
    out.events = { today: todays.length, next: next ? eventShape(next) : null };
  }
  return out;
}

export const PROVIDERS = {
  welcome,
  inbox,
  notifications,
  myTasks,
  taskStats,
  taskTrend,
  agenda,
  miniCalendar,
  recentFiles,
  drive,
  driveActivity,
  kbRecent,
  links,
  companies,
  people,
};

/** Runs a widget's provider if this person may use the widget. */
export async function widgetData(req, type, input = {}) {
  const def = WIDGETS[type];
  const provider = PROVIDERS[type];
  if (!def || !provider) throw httpError(404, 'Unknown widget', 'NOT_FOUND');
  const modules = (await getSettingsView()).modules;
  if (def.module && !modules[def.module]?.enabled) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
  if (def.permission && !hasPermission(req.access?.permissions || [], def.permission)) throw httpError(403, 'You do not have permission for this widget', 'FORBIDDEN');
  const area = def.area || def.module;
  if (!areaAllowed(req, area)) throw httpError(403, `The token lacks the ${area}:read scope`, 'SCOPE_DENIED');
  let settings = {};
  try {
    settings = input.settings ? JSON.parse(input.settings) : {};
  } catch {
    settings = {};
  }
  // Day boundaries: the zone the browser sent when valid, else the person's region zone.
  return provider(req, settings && typeof settings === 'object' ? settings : {}, await requestZone(req, input.tz), input);
}

/** Choices for widget settings (projects, calendars, link categories). */
export async function widgetOptions(req) {
  const modules = parseSettings(await getSettings()).modules;
  const out = {};
  if (modules.tasks?.enabled && areaAllowed(req, 'tasks')) out.projects = (await listProjects(tasksCtx(req))).map((project) => ({ id: project.id, name: project.name, color: project.color }));
  if (modules.calendar?.enabled && areaAllowed(req, 'calendar')) out.calendars = (await listCalendars(calCtx(req), req.locale)).map((calendar) => ({ id: calendar.id, name: calendar.name, color: calendar.color }));
  if (modules.resources?.enabled && areaAllowed(req, 'resources')) out.categories = (await board(resourcesContext(req))).categories;
  return out;
}
