import { query, withTransaction } from '../../config/database.js';
import { notify, subscribersOf } from '../../services/notifications.js';
import { requestAs } from '../../api/events.js';
import {
  HEX,
  LEVEL,
  LEVEL_NAMES,
  avatarOf,
  clean,
  contextFromRequest,
  httpError,
  levelMap,
  levelOn,
  membersOf,
  readAcl,
  requireLevel,
  withinLimits,
  writeAcl,
} from '../shared/acl.js';
import { slugify } from '../kb/shares.js';
import { insertStatuses } from './schema.js';
import { taskMessage } from './messages.js';
import { taskEvent } from './chat.js';
import { emitEvent } from '../../api/events.js';
import { publicBase } from '../../services/google.js';

const ACL = 'task_acl';
const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
// Keys that collide with module routes (/app/tasks/projects).
const RESERVED_KEYS = new Set(['PROJECTS']);
const ICON_RE = /^[a-z0-9_-]{2,32}$/i;
const CATEGORIES = ['todo', 'active', 'done'];
const RANK_STEP = 1024;
const REF_RE = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;

export const taskRef = (key, number) => `${key}-${number}`;
const link = (ref) => `/app/tasks/${ref}`;

// ── Shapes ──────────────────────────────────────────────────────────────────

function projectShape(row, level) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    color: row.color || null,
    icon: row.icon || null,
    archived: Boolean(row.archived_at),
    level: LEVEL_NAMES[level],
    counts: {
      open: row.open_count ?? undefined,
      done: row.done_count ?? undefined,
      overdue: row.overdue_count ?? undefined,
      mine: row.mine_count ?? undefined,
    },
    createdAt: row.created_at,
  };
}

function statusShape(row) {
  return { id: row.id, name: row.name, color: row.color, category: row.category, sort: row.sort };
}

const person = (id, username, name, avatar) => (id ? { id, username, name: name || username, avatarUrl: avatarOf(avatar) } : null);

const TASK_SELECT = `
  SELECT t.*, p.key AS project_key, p.name AS project_name, p.color AS project_color, p.archived_at AS project_archived,
         p.is_personal AS project_personal,
         s.category AS status_category, s.name AS status_name, s.color AS status_color,
         a.username AS a_username, COALESCE(a.display_name, a.username) AS a_name, a.avatar_path AS a_avatar,
         o.username AS o_username, COALESCE(o.display_name, o.username) AS o_name, o.avatar_path AS o_avatar,
         (SELECT COUNT(*)::int FROM task_checklist c WHERE c.task_id = t.id) AS check_total,
         (SELECT COUNT(*)::int FROM task_checklist c WHERE c.task_id = t.id AND c.done) AS check_done,
         (SELECT COUNT(*)::int FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id
            WHERE r.entity_type = 'task' AND r.entity_id = t.id AND m.kind = 'text' AND m.deleted_at IS NULL) AS comment_count,
         (SELECT COUNT(*)::int FROM tasks c WHERE c.parent_id = t.id) AS subtask_count
  FROM tasks t
  JOIN task_projects p ON p.id = t.project_id
  JOIN task_statuses s ON s.id = t.status_id
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users o ON o.id = COALESCE(t.originator_id, t.created_by)
`;

function taskShape(row) {
  return {
    id: row.id,
    ref: taskRef(row.project_key, row.number),
    number: row.number,
    projectId: row.project_id,
    project: { id: row.project_id, key: row.project_key, name: row.project_name, color: row.project_color, personal: Boolean(row.project_personal) },
    title: row.title,
    important: Boolean(row.important),
    originator: person(row.originator_id || row.created_by, row.o_username, row.o_name, row.o_avatar),
    parentId: row.parent_id || null,
    resultRequired: Boolean(row.result_required),
    flowId: row.flow_id || null,
    deferred: Boolean(row.deferred_at),
    startedAt: row.started_at,
    subtasks: row.subtask_count || 0,
    statusColor: row.status_color,
    statusId: row.status_id,
    statusName: row.status_name,
    statusCategory: row.status_category,
    priority: row.priority,
    assignee: person(row.assignee_id, row.a_username, row.a_name, row.a_avatar),
    startDate: row.start_date ? toDateString(row.start_date) : null,
    dueAt: row.due_at,
    dueTime: row.due_time,
    labels: row.labels || [],
    rank: row.rank,
    checklist: { done: row.check_done || 0, total: row.check_total || 0 },
    comments: row.comment_count || 0,
    overdue: Boolean(row.due_at && !row.completed_at && new Date(row.due_at) < new Date()),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toDateString(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Input parsing ───────────────────────────────────────────────────────────

function parsePriority(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

function parseDue(value) {
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Invalid due date', 'INVALID_DATE');
  return date.toISOString();
}

function parseDate(value) {
  if (value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw httpError(400, 'Invalid date', 'INVALID_DATE');
  return String(value);
}

function parseLabels(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((label) => clean(label, 32)).filter(Boolean))].slice(0, 10);
}

// ── Projects ────────────────────────────────────────────────────────────────

async function allProjectIds() {
  const { rows } = await query(`SELECT id FROM task_projects`);
  return rows.map((row) => row.id);
}

export async function visibleProjectIds(ctx) {
  if (ctx.isAdmin) return allProjectIds();
  return (await levelMap(ACL, ctx)).visibleIds();
}

export async function listProjects(ctx, { archived = false } = {}) {
  const levels = await levelMap(ACL, ctx);
  const visible = ctx.isAdmin ? null : levels.visibleIds();
  const { rows } = await query(
    `SELECT p.*,
       COUNT(t.id) FILTER (WHERE t.completed_at IS NULL)::int AS open_count,
       COUNT(t.id) FILTER (WHERE t.completed_at IS NOT NULL)::int AS done_count,
       COUNT(t.id) FILTER (WHERE t.completed_at IS NULL AND t.due_at < NOW())::int AS overdue_count,
       COUNT(t.id) FILTER (WHERE t.completed_at IS NULL AND t.assignee_id = $1)::int AS mine_count
     FROM task_projects p LEFT JOIN tasks t ON t.project_id = p.id
     WHERE ($2::int[] IS NULL OR p.id = ANY($2)) AND NOT p.is_personal
     GROUP BY p.id
     ORDER BY LOWER(p.name)`,
    [ctx.userId, visible]
  );
  return rows
    .filter((row) => levels.of(row.id) >= LEVEL.view && (archived || !row.archived_at))
    .map((row) => projectShape(row, levels.of(row.id)));
}

export async function loadProject(refOrId) {
  const value = String(refOrId || '');
  const { rows } = /^\d+$/.test(value)
    ? await query(`SELECT * FROM task_projects WHERE id = $1`, [Number(value)])
    : await query(`SELECT * FROM task_projects WHERE key = $1`, [value.toUpperCase()]);
  if (!rows[0]) throw httpError(404, 'Project not found', 'NOT_FOUND');
  return rows[0];
}

/** "Отдел продаж" → "OP"; "Marketing site" → "MS"; unique. */
export async function suggestKey(name) {
  const words = slugify(name).split('-').filter(Boolean);
  let base = words.length > 1 ? words.slice(0, 4).map((word) => word[0]).join('') : (words[0] || 'PRJ').slice(0, 3);
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]/.test(base)) base = `P${base}`;
  if (base.length < 2) base = `${base}P`.slice(0, 2).padEnd(2, 'X');
  base = base.slice(0, 8);
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const { rows } = await query(`SELECT 1 FROM task_projects WHERE key = $1`, [candidate]);
    if (!rows.length) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

export async function checkKey(raw) {
  const key = String(raw || '').trim().toUpperCase();
  if (!KEY_RE.test(key)) return { key, available: false, reason: 'FORMAT' };
  if (RESERVED_KEYS.has(key)) return { key, available: false, reason: 'TAKEN' };
  const { rows } = await query(`SELECT 1 FROM task_projects WHERE key = $1`, [key]);
  return { key, available: !rows.length, reason: rows.length ? 'TAKEN' : null };
}

export async function createProject(ctx, input, { locale, allowed }) {
  if (!allowed) throw httpError(403, 'Only administrators can create projects', 'FORBIDDEN');
  const name = clean(input.name, 120);
  if (!name) throw httpError(400, 'Project name is required', 'NAME_REQUIRED');
  const key = input.key ? String(input.key).trim().toUpperCase() : await suggestKey(name);
  if (!KEY_RE.test(key)) throw httpError(400, 'Key: 2–10 Latin letters or digits, starting with a letter', 'KEY_FORMAT');
  if (RESERVED_KEYS.has(key)) throw httpError(409, 'This key is reserved', 'KEY_TAKEN');
  const visibility = ['private', 'team', 'readonly'].includes(input.visibility) ? input.visibility : 'team';

  const project = await withTransaction(async (client) => {
    const taken = await client.query(`SELECT 1 FROM task_projects WHERE key = $1`, [key]);
    if (taken.rows.length) throw httpError(409, 'This key is already used by another project', 'KEY_TAKEN');
    const { rows } = await client.query(
      `INSERT INTO task_projects (key, name, description, color, icon, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        key,
        name,
        clean(input.description, 2000) || null,
        HEX.test(input.color || '') ? input.color.toUpperCase() : '#6366F1',
        ICON_RE.test(input.icon || '') ? input.icon : null,
        ctx.userId,
      ]
    );
    const row = rows[0];
    await client.query(`INSERT INTO task_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'user', $2, $3)`, [
      row.id,
      ctx.userId,
      LEVEL.manage,
    ]);
    if (visibility !== 'private') {
      await client.query(`INSERT INTO task_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'everyone', NULL, $2)`, [
        row.id,
        visibility === 'team' ? LEVEL.edit : LEVEL.view,
      ]);
    }
    await insertStatuses(client, row.id, locale);
    return row;
  });
  return projectShape(project, LEVEL.manage);
}

export async function getProject(ctx, refOrId) {
  const project = await loadProject(refOrId);
  const level = await levelOn(ACL, project.id, ctx);
  requireLevel(level, LEVEL.view);
  const [statuses, members, labels] = await Promise.all([
    query(`SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY sort, id`, [project.id]),
    membersOf(ACL, project.id, LEVEL.view),
    query(`SELECT DISTINCT unnest(labels) AS label FROM tasks WHERE project_id = $1 ORDER BY 1`, [project.id]),
  ]);
  return {
    project: projectShape(project, level),
    statuses: statuses.rows.map(statusShape),
    members,
    labels: labels.rows.map((row) => row.label),
  };
}

export async function updateProject(ctx, id, input) {
  const project = await loadProject(id);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.manage);
  const fields = [];
  const values = [];
  const set = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) {
    const name = clean(input.name, 120);
    if (!name) throw httpError(400, 'Project name is required', 'NAME_REQUIRED');
    set('name', name);
  }
  if (input.description !== undefined) set('description', clean(input.description, 2000) || null);
  if (input.color !== undefined) set('color', HEX.test(input.color || '') ? input.color.toUpperCase() : null);
  if (input.icon !== undefined) set('icon', ICON_RE.test(input.icon || '') ? input.icon : null);
  if (typeof input.archived === 'boolean') set('archived_at', input.archived ? new Date() : null);
  if (fields.length) {
    values.push(project.id);
    await query(`UPDATE task_projects SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
  }
  return getProject(ctx, project.id);
}

export async function deleteProject(ctx, id) {
  const project = await loadProject(id);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.manage);
  await query(`DELETE FROM task_projects WHERE id = $1`, [project.id]);
}

/** Replaces the workflow. Tasks in removed statuses move to the closest remaining one. */
export async function saveStatuses(ctx, projectId, list) {
  const project = await loadProject(projectId);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.manage);
  const incoming = (Array.isArray(list) ? list : [])
    .map((item) => ({
      id: Number(item?.id) || null,
      name: clean(item?.name, 60),
      color: HEX.test(item?.color || '') ? item.color.toUpperCase() : '#94A3B8',
      category: CATEGORIES.includes(item?.category) ? item.category : 'todo',
    }))
    .filter((item) => item.name)
    .slice(0, 12);
  if (!incoming.length) throw httpError(400, 'Keep at least one status', 'STATUS_REQUIRED');

  await withTransaction(async (client) => {
    const existing = await client.query(`SELECT id, category FROM task_statuses WHERE project_id = $1`, [project.id]);
    const known = new Map(existing.rows.map((row) => [row.id, row]));
    const keptIds = [];
    for (const [index, item] of incoming.entries()) {
      if (item.id && known.has(item.id)) {
        await client.query(`UPDATE task_statuses SET name = $2, color = $3, category = $4, sort = $5 WHERE id = $1`, [
          item.id,
          item.name,
          item.color,
          item.category,
          index,
        ]);
        keptIds.push({ id: item.id, category: item.category });
      } else {
        const { rows } = await client.query(
          `INSERT INTO task_statuses (project_id, name, color, category, sort) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [project.id, item.name, item.color, item.category, index]
        );
        keptIds.push({ id: rows[0].id, category: item.category });
      }
    }
    for (const removed of existing.rows.filter((row) => !keptIds.some((kept) => kept.id === row.id))) {
      const target = keptIds.find((kept) => kept.category === removed.category) || keptIds[0];
      await client.query(`UPDATE tasks SET status_id = $2 WHERE status_id = $1`, [removed.id, target.id]);
      await client.query(`DELETE FROM task_statuses WHERE id = $1`, [removed.id]);
    }
    await client.query(
      `UPDATE tasks t SET completed_at = CASE WHEN s.category = 'done' THEN COALESCE(t.completed_at, NOW()) ELSE NULL END
       FROM task_statuses s WHERE s.id = t.status_id AND t.project_id = $1`,
      [project.id]
    );
  });
  return getProject(ctx, project.id);
}

export async function getProjectAccess(ctx, id) {
  const project = await loadProject(id);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.manage);
  return readAcl(ACL, project.id);
}

export async function setProjectAccess(ctx, id, entries) {
  const project = await loadProject(id);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.manage);
  await withTransaction((client) => writeAcl(client, ACL, project.id, entries, ctx));
  return readAcl(ACL, project.id);
}

// ── Participants and access ─────────────────────────────────────────────────

export const ROLES = ['coassignee', 'auditor'];

/** Everyone attached to a task: originator, assignee, co-assignees, auditors, watchers. */
export async function participantsOf(row) {
  const [members, watchers] = await Promise.all([
    query(`SELECT user_id FROM task_members WHERE task_id = $1`, [row.id]),
    query(`SELECT user_id FROM task_watchers WHERE task_id = $1`, [row.id]),
  ]);
  return [...new Set([row.originator_id, row.created_by, row.assignee_id, ...members.rows.map((m) => m.user_id), ...watchers.rows.map((w) => w.user_id)].filter(Boolean))];
}

/**
 * Access to one task: the project's level, raised by the person's role in the
 * task — originator, assignee and co-assignees work on it (edit), auditors and
 * watchers follow it (view). Tasks without a project are open to participants only.
 */
export async function taskLevel(ctx, row) {
  if (!withinLimits(ctx, ACL, row.project_id)) return LEVEL.none;
  if (ctx.isAdmin) return LEVEL.manage;
  let level = row.project_personal ? LEVEL.none : await levelOn(ACL, row.project_id, ctx);
  if ([row.assignee_id, row.originator_id, row.created_by].includes(ctx.userId)) return Math.max(level, LEVEL.edit);
  const { rows } = await query(
    `SELECT role FROM task_members WHERE task_id = $1 AND user_id = $2
     UNION ALL SELECT 'watcher' FROM task_watchers WHERE task_id = $1 AND user_id = $2`,
    [row.id, ctx.userId]
  );
  if (rows.some((r) => r.role === 'coassignee')) level = Math.max(level, LEVEL.edit);
  else if (rows.length) level = Math.max(level, LEVEL.view);
  return level;
}

async function personalProjectId() {
  const { rows } = await query(`SELECT id FROM task_projects WHERE is_personal LIMIT 1`);
  return rows[0]?.id || null;
}

// ── Tasks: reading ──────────────────────────────────────────────────────────

const PARTICIPANT_SQL = (me) =>
  `(t.assignee_id = ${me} OR t.originator_id = ${me} OR t.created_by = ${me}
    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${me})
    OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = ${me}))`;

/**
 * Filters: project, assignee ('me' | 'none' | id), role ('doing' | 'helping' |
 * 'assigned' | 'auditing' | 'all'), status[], priority[], label, important,
 * flow, parent, q (text or KEY-12), open ('1'), dueFrom / dueTo, doneSince,
 * sort ('board' | 'due' | 'priority' | 'updated' | 'created').
 */
export async function listTasks(ctx, filters = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };
  // The person's id as a parameter, added only when a condition needs it.
  let meIndex = 0;
  const meParam = () => {
    if (!meIndex) {
      params.push(ctx.userId);
      meIndex = params.length;
    }
    return `$${meIndex}`;
  };

  if (filters.project) {
    const project = await loadProject(filters.project);
    if (project.is_personal) where.push(ctx.isAdmin ? 'TRUE' : PARTICIPANT_SQL(meParam()));
    else requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.view);
    add('t.project_id = $?', project.id);
  } else if (!ctx.isAdmin) {
    params.push(await visibleProjectIds(ctx));
    where.push(`((t.project_id = ANY($${params.length}) AND NOT p.is_personal AND p.archived_at IS NULL) OR ${PARTICIPANT_SQL(meParam())})`);
  } else {
    where.push('p.archived_at IS NULL');
  }
  // An API token narrowed to some projects sees only their tasks.
  if (ctx.limits?.[ACL]) {
    params.push([...ctx.limits[ACL]]);
    where.push(`t.project_id = ANY($${params.length})`);
  }

  if (filters.assignee === 'me') where.push(`t.assignee_id = ${meParam()}`);
  else if (filters.assignee === 'none') where.push('t.assignee_id IS NULL');
  else if (Number.isInteger(Number(filters.assignee)) && Number(filters.assignee) > 0) add('t.assignee_id = $?', Number(filters.assignee));

  const me = filters.role ? meParam() : null;
  const roleSql = {
    doing: `(t.assignee_id = ${me} OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${me} AND tm.role = 'coassignee'))`,
    helping: `EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${me} AND tm.role = 'coassignee')`,
    assigned: `(COALESCE(t.originator_id, t.created_by) = ${me} AND t.assignee_id IS DISTINCT FROM ${me})`,
    auditing: `(EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.user_id = ${me} AND tm.role = 'auditor')
                OR (EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = ${me})
                    AND t.assignee_id IS DISTINCT FROM ${me} AND COALESCE(t.originator_id, t.created_by) <> ${me}))`,
    all: 'ALL',
  }[filters.role];
  if (roleSql) where.push(roleSql === 'ALL' ? PARTICIPANT_SQL(me) : roleSql);

  const ids = (value) => String(value || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 2 ** 31);
  if (filters.status) add('t.status_id = ANY($?)', ids(filters.status));
  if (filters.priority) add('t.priority = ANY($?)', ids(filters.priority));
  if (filters.label) add('$? = ANY(t.labels)', clean(filters.label, 32));
  if (filters.important === '1') where.push('t.important');
  if (filters.flow) add('t.flow_id = $?', Number(filters.flow) || 0);
  if (filters.parent) add('t.parent_id = $?', Number(filters.parent) || 0);
  if (filters.deferred === '1') where.push('t.deferred_at IS NOT NULL');
  if (filters.deferred === '0') where.push('t.deferred_at IS NULL');
  if (filters.q) {
    const q = clean(filters.q, 100);
    const refMatch = REF_RE.exec(q);
    if (refMatch) {
      params.push(refMatch[1].toUpperCase(), Number(refMatch[2]));
      where.push(`(p.key = $${params.length - 1} AND t.number = $${params.length})`);
    } else {
      add('(t.title ILIKE $? OR t.description ILIKE $?)', `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    }
  }
  if (filters.open === '1') where.push('t.completed_at IS NULL');
  if (filters.nodue === '1') where.push('t.due_at IS NULL');
  // Other people's tasks without a project stay private even for administrators.
  if (filters.foreignPersonal === '0') where.push(`(NOT p.is_personal OR ${PARTICIPANT_SQL(meParam())})`);
  if (filters.dueFrom) add('t.due_at >= $?', parseDue(filters.dueFrom));
  if (filters.dueTo) add('t.due_at < $?', parseDue(filters.dueTo));
  if (filters.doneSince) add('(t.completed_at IS NULL OR t.completed_at >= $?)', parseDue(filters.doneSince));

  const order = {
    due: 't.due_at ASC NULLS LAST, t.important DESC, t.priority DESC, t.id',
    priority: 't.important DESC, t.priority DESC, t.due_at ASC NULLS LAST, t.id',
    updated: 't.updated_at DESC',
    created: 't.created_at DESC',
  }[filters.sort] || 's.sort, t.rank, t.id';
  const limit = Math.max(1, Math.min(Number(filters.limit) || 2000, 2000));

  const { rows } = await query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`, params);
  return rows.map(taskShape);
}

/**
 * A webhook event about a task (see api/events.js); delivered only to webhooks
 * whose person may see the task.
 */
export async function taskWebhook(type, taskOrId, extra = {}, actorId = null) {
  try {
    const row = typeof taskOrId === 'object' ? taskOrId : await loadTaskRow(taskOrId).catch(() => null);
    if (!row) return;
    const task = taskShape(row);
    let actor = null;
    if (actorId) {
      const { rows } = await query(`SELECT id, COALESCE(display_name, username) AS name, username FROM users WHERE id = $1`, [actorId]);
      actor = rows[0] || null;
    }
    await emitEvent(type, {
      data: { task: { ...task, url: `${publicBase()}/app/tasks/${task.ref}` }, actor, ...extra },
      visible: async (req) => (await taskLevel(contextFromRequest(req, 'tasks.admin'), row)) > LEVEL.none,
    });
  } catch (err) {
    console.warn(`[tasks] webhook ${type} failed:`, err.message);
  }
}

/** People following the project (who still see it), minus those already told. */
async function notifyProjectFollowers(row, message, actorId, exclude = []) {
  try {
    if (row.project_personal) return;
    const ids = (await subscribersOf('tasks.project', row.project_id)).filter((id) => id !== actorId && !exclude.includes(id));
    const allowed = [];
    for (const id of ids) {
      const req = await requestAs(id);
      if (req && (await taskLevel(contextFromRequest(req, 'tasks.admin'), row)) > LEVEL.none) allowed.push(id);
    }
    if (!allowed.length) return;
    const actor = actorId ? (await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [actorId])).rows[0]?.name : '';
    const ref = taskRef(row.project_key, row.number);
    await notify({ userIds: allowed, kind: 'tasks.project', module: 'tasks', link: link(ref), actorId, render: taskMessage(message, { ref, title: row.title, actor, project: row.project_name }) });
  } catch (err) {
    console.warn('[tasks] project followers:', err.message);
  }
}

export async function loadTaskRow(refOrId) {
  const value = String(refOrId || '');
  const match = REF_RE.exec(value);
  const { rows } = match
    ? await query(`${TASK_SELECT} WHERE p.key = $1 AND t.number = $2`, [match[1].toUpperCase(), Number(match[2])])
    : /^\d+$/.test(value)
      ? await query(`${TASK_SELECT} WHERE t.id = $1`, [Number(value)])
      : { rows: [] };
  if (!rows[0]) throw httpError(404, 'Task not found', 'NOT_FOUND');
  return rows[0];
}

const people = (rows) => rows.map((user) => person(user.id, user.username, user.name, user.avatar_path));

export async function getTask(ctx, refOrId, { countView = true } = {}) {
  const row = await loadTaskRow(refOrId);
  const level = await taskLevel(ctx, row);
  requireLevel(level, LEVEL.view);
  if (countView) {
    await query(
      `INSERT INTO task_views (task_id, user_id) VALUES ($1, $2) ON CONFLICT (task_id, user_id) DO UPDATE SET last_at = NOW()`,
      [row.id, ctx.userId]
    );
  }
  const userCols = `u.id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path`;
  const [members, watchers, checklists, items, files, results, subtasks, parent, links, deps, reminders, time, views, favorite, activity, flow, template] = await Promise.all([
    query(`SELECT m.role, ${userCols} FROM task_members m JOIN users u ON u.id = m.user_id WHERE m.task_id = $1 ORDER BY LOWER(COALESCE(u.display_name, u.username))`, [row.id]),
    query(`SELECT ${userCols} FROM task_watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = $1`, [row.id]),
    query(`SELECT id, title, sort FROM task_checklists WHERE task_id = $1 ORDER BY sort, id`, [row.id]),
    query(
      `SELECT c.id, c.checklist_id, c.text, c.done, c.level, c.important, c.member_id, c.member_role, c.file_ids, c.sort,
              COALESCE(u.display_name, u.username) AS member_name, u.avatar_path AS member_avatar, u.username AS member_username
       FROM task_checklist c LEFT JOIN users u ON u.id = c.member_id WHERE c.task_id = $1 ORDER BY c.sort, c.id`,
      [row.id]
    ),
    query(`SELECT f.*, COALESCE(u.display_name, u.username) AS author FROM task_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = $1 ORDER BY f.id`, [row.id]),
    query(
      `SELECT r.id AS result_id, r.body, r.chat_file_ids, r.message_id, r.created_at, r.author_id,
              u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM task_results r LEFT JOIN users u ON u.id = r.author_id WHERE r.task_id = $1 ORDER BY r.id`,
      [row.id]
    ),
    query(`${TASK_SELECT} WHERE t.parent_id = $1 ORDER BY t.created_at`, [row.id]),
    row.parent_id ? query(`${TASK_SELECT} WHERE t.id = $1`, [row.parent_id]) : { rows: [] },
    query(`${TASK_SELECT} WHERE t.id IN (SELECT other_id FROM task_links WHERE task_id = $1 UNION SELECT task_id FROM task_links WHERE other_id = $1)`, [row.id]),
    query(
      `SELECT d.id, d.kind, d.depends_on, p.key, t.number, t.title, t.completed_at FROM task_deps d
       JOIN tasks t ON t.id = d.depends_on JOIN task_projects p ON p.id = t.project_id WHERE d.task_id = $1 ORDER BY d.id`,
      [row.id]
    ),
    query(`SELECT * FROM task_reminders WHERE task_id = $1 AND (created_by = $2 OR $3) ORDER BY id`, [row.id, ctx.userId, level >= LEVEL.manage]),
    query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(stopped_at, NOW()) - started_at))), 0)::bigint AS total,
              MAX(started_at) FILTER (WHERE stopped_at IS NULL AND user_id = $2) AS running
       FROM task_time WHERE task_id = $1`,
      [row.id, ctx.userId]
    ),
    query(`SELECT COUNT(*)::int AS n FROM task_views WHERE task_id = $1`, [row.id]),
    query(`SELECT 1 FROM task_favorites WHERE task_id = $1 AND user_id = $2`, [row.id, ctx.userId]),
    query(
      `SELECT a.id AS activity_id, a.kind, a.data, a.created_at, a.actor_id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM task_activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.task_id = $1 ORDER BY a.id DESC LIMIT 100`,
      [row.id]
    ),
    row.flow_id ? query(`SELECT id, name, color FROM task_flows WHERE id = $1`, [row.flow_id]) : { rows: [] },
    row.template_id ? query(`SELECT id, title, recurring, recurrence, next_run_at, active FROM task_templates WHERE id = $1`, [row.template_id]) : { rows: [] },
  ]);
  const projectLevel = row.project_personal ? LEVEL.none : await levelOn(ACL, row.project_id, ctx);
  const statuses = await query(`SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY sort, id`, [row.project_id]);
  const isOriginator = (row.originator_id || row.created_by) === ctx.userId;
  const isAssignee = row.assignee_id === ctx.userId;
  const manager = ctx.isAdmin || projectLevel >= LEVEL.manage;
  const done = row.status_category === 'done';
  const fileShape = (file) => ({
    id: file.id,
    kind: file.kind,
    name: file.name,
    size: Number(file.size),
    mime: file.mime,
    author: file.author,
    createdAt: file.created_at,
    url: file.kind === 'upload' ? `/api/app/tasks/files/${file.id}` : null,
    image: /^image\/(png|jpe?g|gif|webp|bmp)$/.test(file.mime || ''),
    nodeId: file.node_id,
    shareId: file.share_id,
    path: file.drive_path,
  });
  return {
    ...taskShape(row),
    description: row.description || '',
    descriptionFormat: row.description_format || 'md',
    statuses: statuses.rows.map(statusShape),
    coassignees: people(members.rows.filter((m) => m.role === 'coassignee')),
    auditors: people(members.rows.filter((m) => m.role === 'auditor')),
    watchers: people(watchers.rows),
    watching: watchers.rows.some((user) => user.id === ctx.userId),
    checklists: checklists.rows.map((list) => {
      const own = items.rows.filter((item) => item.checklist_id === list.id);
      return {
        id: list.id,
        title: list.title,
        done: own.filter((item) => item.done).length,
        total: own.length,
        items: own.map((item) => ({
          id: item.id,
          text: item.text,
          done: item.done,
          level: item.level,
          important: item.important,
          member: item.member_id ? { ...person(item.member_id, item.member_username, item.member_name, item.member_avatar), role: item.member_role } : null,
          fileIds: item.file_ids || [],
        })),
      };
    }),
    // Kept for the board's older code paths.
    checklistItems: items.rows.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    files: files.rows.map(fileShape),
    results: results.rows.map((result) => ({
      id: result.result_id,
      body: result.body,
      chatFileIds: result.chat_file_ids || [],
      messageId: result.message_id ? Number(result.message_id) : null,
      author: person(result.author_id, result.username, result.name, result.avatar_path),
      createdAt: result.created_at,
      mine: result.author_id === ctx.userId,
    })),
    subtaskList: subtasks.rows.map(taskShape),
    parent: parent.rows[0] ? taskShape(parent.rows[0]) : null,
    links: links.rows.map(taskShape),
    deps: deps.rows.map((dep) => ({ id: dep.id, kind: dep.kind, taskId: dep.depends_on, ref: taskRef(dep.key, dep.number), title: dep.title, done: Boolean(dep.completed_at) })),
    reminders: reminders.rows.map((reminder) => ({
      id: reminder.id,
      targets: reminder.targets,
      mode: reminder.mode,
      remindAt: reminder.remind_at,
      beforeMinutes: reminder.before_minutes,
      channels: reminder.channels,
      sentAt: reminder.sent_at,
    })),
    planStart: row.plan_start,
    planEnd: row.plan_end,
    allowChangeDeadline: row.allow_change_deadline,
    skipWeekends: row.skip_weekends,
    deadlineFromSubtasks: row.deadline_from_subtasks,
    timeTracking: row.time_tracking,
    timeEstimate: row.time_estimate,
    time: { total: Number(time.rows[0].total), running: time.rows[0].running },
    custom: row.custom || {},
    rating: row.rating,
    ratingComment: row.rating_comment || '',
    views: views.rows[0].n,
    favorite: Boolean(favorite.rows.length),
    flow: flow.rows[0] || null,
    template: template.rows[0]
      ? { id: template.rows[0].id, title: template.rows[0].title, recurring: template.rows[0].recurring, recurrence: template.rows[0].recurrence, nextRunAt: template.rows[0].next_run_at, active: template.rows[0].active }
      : null,
    activity: activity.rows.map((entry) => ({
      id: Number(entry.activity_id),
      kind: entry.kind,
      data: entry.data,
      createdAt: entry.created_at,
      actor: person(entry.actor_id, entry.username, entry.name, entry.avatar_path),
    })),
    myRole: isAssignee ? 'assignee' : isOriginator ? 'originator' : members.rows.find((m) => m.id === ctx.userId)?.role || (watchers.rows.some((w) => w.id === ctx.userId) ? 'watcher' : null),
    can: {
      edit: level >= LEVEL.edit,
      delete: manager || (level >= LEVEL.edit && isOriginator),
      comment: level >= LEVEL.view,
      changeDeadline: level >= LEVEL.edit && (row.allow_change_deadline || isOriginator || manager),
      complete: level >= LEVEL.edit && !done,
      start: level >= LEVEL.edit && !done && !row.started_at,
      rate: (isOriginator || manager) && done,
      delegate: (isAssignee || isOriginator || manager) && !done,
      defer: level >= LEVEL.edit && !done,
    },
  };
}

// ── Tasks: writing ──────────────────────────────────────────────────────────

async function actorName(ctx) {
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [ctx.userId]);
  return rows[0]?.name || '';
}

async function namesOf(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return [];
  const { rows } = await query(`SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id = ANY($1)`, [list]);
  return list.map((id) => ({ id, name: rows.find((row) => row.id === id)?.name || '—' }));
}

async function logActivity(client, taskId, actorId, kind, data = {}) {
  await client.query(`INSERT INTO task_activity (task_id, actor_id, kind, data) VALUES ($1, $2, $3, $4)`, [taskId, actorId, kind, JSON.stringify(data)]);
}

async function watch(client, taskId, userId) {
  if (!userId) return;
  await client.query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [taskId, userId]);
}

async function nextRank(client, statusId, position = 'bottom') {
  const { rows } = await client.query(`SELECT ${position === 'top' ? 'MIN' : 'MAX'}(rank) AS edge FROM tasks WHERE status_id = $1`, [statusId]);
  const edge = rows[0].edge;
  if (edge === null) return RANK_STEP;
  return position === 'top' ? edge - RANK_STEP : edge + RANK_STEP;
}

/** People who hear about changes: every participant of the task. */
async function followers(row) {
  return participantsOf(row);
}

async function activeUsers(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE`, [list]);
  return rows.map((row) => row.id);
}

const parseStamp = (value) => (value === null || value === '' || value === undefined ? null : parseDue(value));
const intOrNull = (value, min, max) => {
  if (value === null || value === '' || value === undefined) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Field values for custom fields, by their declared type. */
async function cleanCustom(input) {
  if (!input || typeof input !== 'object') return {};
  const { rows } = await query(`SELECT id, type FROM task_fields`);
  const out = {};
  for (const field of rows) {
    const value = input[field.id] ?? input[String(field.id)];
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'string') out[field.id] = clean(value, 500);
    else if (field.type === 'number' && Number.isFinite(Number(value))) out[field.id] = Number(value);
    else if (field.type === 'datetime' && !Number.isNaN(new Date(value).getTime())) out[field.id] = new Date(value).toISOString();
    else if (field.type === 'bool') out[field.id] = Boolean(value);
  }
  return out;
}

function cleanDescription(input) {
  const format = input.descriptionFormat === 'html' ? 'html' : 'md';
  return { text: String(input.description ?? '').slice(0, 200000).trim() || null, format };
}

/** Picks an assignee for a flow that distributes its tasks. */
async function flowAssignee(client, flowId) {
  const { rows } = await client.query(`SELECT * FROM task_flows WHERE id = $1 AND active FOR UPDATE`, [flowId]);
  const flow = rows[0];
  if (!flow || !flow.member_ids?.length || flow.distribution === 'manual') return null;
  if (flow.distribution === 'queue') {
    const next = flow.member_ids[flow.cursor % flow.member_ids.length];
    await client.query(`UPDATE task_flows SET cursor = cursor + 1 WHERE id = $1`, [flow.id]);
    return next;
  }
  const load = await client.query(
    `SELECT u, (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u AND t.completed_at IS NULL)::int AS open
     FROM unnest($1::int[]) AS u ORDER BY open, u LIMIT 1`,
    [flow.member_ids]
  );
  return load.rows[0]?.u || null;
}

async function insertChecklists(client, taskId, lists) {
  for (const [listIndex, list] of (Array.isArray(lists) ? lists : []).slice(0, 20).entries()) {
    const items = (Array.isArray(list?.items) ? list.items : []).slice(0, 200);
    if (!items.length && !clean(list?.title, 200)) continue;
    const created = await client.query(`INSERT INTO task_checklists (task_id, title, sort) VALUES ($1, $2, $3) RETURNING id`, [
      taskId,
      clean(list?.title, 200) || 'Checklist',
      listIndex,
    ]);
    for (const [index, item] of items.entries()) {
      const text = clean(typeof item === 'string' ? item : item?.text, 1000);
      if (!text) continue;
      await client.query(
        `INSERT INTO task_checklist (task_id, checklist_id, text, done, level, important, sort) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [taskId, created.rows[0].id, text, Boolean(item?.done), intOrNull(item?.level, 0, 4) || 0, Boolean(item?.important), index]
      );
    }
  }
}

/**
 * Creates a task (or one per assignee when several are given). Accepts the
 * full form: roles, checklists, files uploaded beforehand, reminders, links,
 * Gantt links, planning, time tracking, custom fields.
 */
export async function createTask(ctx, input = {}) {
  const projectRef = input.projectId || input.project;
  const project = projectRef ? await loadProject(projectRef) : await loadProject(await personalProjectId());
  if (!project.is_personal) requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.edit);
  if (project.archived_at) throw httpError(400, 'The project is archived', 'ARCHIVED');
  const title = clean(input.title, 300);
  if (!title) throw httpError(400, 'Task title is required', 'TITLE_REQUIRED');

  const statuses = await query(`SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY sort, id`, [project.id]);
  const status = statuses.rows.find((row) => row.id === Number(input.statusId)) || statuses.rows[0];
  const assignees = input.assigneeIds?.length ? await activeUsers(input.assigneeIds) : await activeUsers([input.assigneeId]);
  const originator = (await activeUsers([input.originatorId]))[0] || ctx.userId;
  const coassignees = await activeUsers(input.coassigneeIds);
  const auditors = await activeUsers(input.auditorIds);
  const { text: description, format } = cleanDescription(input);
  const custom = await cleanCustom(input.custom);
  let parentId = null;
  if (input.parentId) {
    const parent = await loadTaskRow(input.parentId);
    requireLevel(await taskLevel(ctx, parent), LEVEL.view);
    parentId = parent.id;
  }
  const flowId = Number(input.flowId) || null;

  const created = [];
  for (const assigneeId of assignees.length ? assignees : [null]) {
    const taskId = await withTransaction(async (client) => {
      const seq = await client.query(`UPDATE task_projects SET seq = seq + 1 WHERE id = $1 RETURNING seq`, [project.id]);
      const rank = await nextRank(client, status.id, input.position === 'top' ? 'top' : 'bottom');
      const assignee = assigneeId || (flowId ? await flowAssignee(client, flowId) : null);
      const { rows } = await client.query(
        `INSERT INTO tasks (project_id, number, title, description, description_format, status_id, priority, important, assignee_id,
                            originator_id, start_date, due_at, due_time, labels, rank, created_by, completed_at, parent_id,
                            result_required, flow_id, plan_start, plan_end, allow_change_deadline, skip_weekends,
                            deadline_from_subtasks, time_tracking, time_estimate, custom, template_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING id`,
        [
          project.id,
          seq.rows[0].seq,
          title,
          description,
          format,
          status.id,
          parsePriority(input.priority) ?? (input.important ? 2 : 1),
          Boolean(input.important),
          assignee,
          originator,
          input.startDate ? parseDate(input.startDate) : null,
          input.dueAt ? parseDue(input.dueAt) : null,
          Boolean(input.dueTime),
          parseLabels(input.labels),
          rank,
          ctx.userId,
          status.category === 'done' ? new Date() : null,
          parentId,
          Boolean(input.resultRequired),
          flowId,
          parseStamp(input.planStart),
          parseStamp(input.planEnd),
          input.allowChangeDeadline !== false,
          Boolean(input.skipWeekends),
          Boolean(input.deadlineFromSubtasks),
          Boolean(input.timeTracking),
          intOrNull(input.timeEstimate, 0, 100000),
          JSON.stringify(custom),
          Number(input.templateId) || null,
        ]
      );
      const id = rows[0].id;
      // Checklists: the full form sends named lists; the old one sends plain lines.
      if (Array.isArray(input.checklists)) await insertChecklists(client, id, input.checklists);
      else if (Array.isArray(input.checklist) && input.checklist.length) await insertChecklists(client, id, [{ title: 'Checklist', items: input.checklist }]);
      for (const userId of coassignees.filter((u) => u !== assignee)) await client.query(`INSERT INTO task_members VALUES ($1, $2, 'coassignee') ON CONFLICT DO NOTHING`, [id, userId]);
      for (const userId of auditors) await client.query(`INSERT INTO task_members VALUES ($1, $2, 'auditor') ON CONFLICT DO NOTHING`, [id, userId]);
      // Files uploaded while the form was open (each copy gets its own record).
      const fileIds = (Array.isArray(input.fileIds) ? input.fileIds : []).map(Number).filter(Number.isInteger).slice(0, 50);
      if (fileIds.length) {
        if (!created.length) {
          await client.query(`UPDATE task_files SET task_id = $1 WHERE id = ANY($2) AND task_id IS NULL AND uploaded_by = $3`, [id, fileIds, ctx.userId]);
        } else {
          await client.query(
            `INSERT INTO task_files (task_id, kind, name, mime, size, storage_key, node_id, share_id, drive_path, uploaded_by)
             SELECT $1, kind, name, mime, size, storage_key, node_id, share_id, drive_path, uploaded_by FROM task_files WHERE task_id = $2`,
            [id, created[0]]
          );
        }
      }
      for (const otherId of (Array.isArray(input.linkIds) ? input.linkIds : []).map(Number).filter(Number.isInteger).slice(0, 50)) {
        await client.query(`INSERT INTO task_links (task_id, other_id) SELECT $1, id FROM tasks WHERE id = $2 AND id <> $1 ON CONFLICT DO NOTHING`, [id, otherId]);
      }
      for (const dep of (Array.isArray(input.deps) ? input.deps : []).slice(0, 20)) {
        const kind = ['FS', 'SS', 'SF', 'FF'].includes(dep?.kind) ? dep.kind : 'FS';
        await client.query(`INSERT INTO task_deps (task_id, depends_on, kind) SELECT $1, id, $3 FROM tasks WHERE id = $2 AND id <> $1 ON CONFLICT DO NOTHING`, [id, Number(dep?.taskId) || 0, kind]);
      }
      for (const reminder of (Array.isArray(input.reminders) ? input.reminders : []).slice(0, 20)) await insertReminder(client, id, ctx.userId, reminder);
      await watch(client, id, ctx.userId);
      await watch(client, id, originator);
      await watch(client, id, assignee);
      for (const userId of auditors) await watch(client, id, userId);
      await logActivity(client, id, ctx.userId, 'created');
      return id;
    });
    created.push(taskId);
  }

  const actor = await actorName(ctx);
  const shapes = [];
  for (const id of created) {
    const row = await loadTaskRow(id);
    const ref = taskRef(project.key, row.number);
    await taskEvent(row.id, ctx.userId, { event: 'task.created' });
    await taskWebhook('task.created', row, {}, ctx.userId);
    notifyProjectFollowers(row, 'projectNew', ctx.userId, [row.assignee_id, ...coassignees, ...auditors]);
    const notifyIds = [row.assignee_id, ...coassignees, ...auditors].filter((uid) => uid && uid !== ctx.userId);
    if (notifyIds.length) {
      await notify({
        userIds: notifyIds,
        kind: 'tasks.assigned',
        module: 'tasks',
        link: link(ref),
        actorId: ctx.userId,
        render: taskMessage('assigned', { ref, title, actor, project: project.is_personal ? '' : project.name }),
      });
    }
    shapes.push(taskShape(row));
  }
  if (parentId) await syncParentDeadline(parentId);
  return { ...shapes[0], copies: shapes.slice(1).map((task) => task.ref) };
}

export async function insertReminder(client, taskId, userId, input = {}) {
  const targets = (Array.isArray(input.targets) ? input.targets : ['me']).filter((target) => ['assignee', 'originator', 'coassignees', 'auditors', 'me'].includes(target));
  const channels = (Array.isArray(input.channels) ? input.channels : ['app']).filter((channel) => ['app', 'email', 'messenger'].includes(channel));
  const mode = input.mode === 'before' ? 'before' : 'at';
  const remindAt = mode === 'at' ? parseStamp(input.remindAt) : null;
  const before = mode === 'before' ? intOrNull(input.beforeMinutes, 1, 60 * 24 * 60) : null;
  if (mode === 'at' && !remindAt) return null;
  if (mode === 'before' && !before) return null;
  const { rows } = await client.query(
    `INSERT INTO task_reminders (task_id, created_by, targets, mode, remind_at, before_minutes, channels) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [taskId, userId, targets.length ? targets : ['me'], mode, remindAt, before, channels.length ? channels : ['app']]
  );
  return rows[0].id;
}

async function rankBetween(client, statusId, beforeId, afterId, respread = true) {
  if (beforeId && beforeId === afterId) afterId = null;
  const pick = async (taskId) =>
    taskId ? (await client.query(`SELECT rank FROM tasks WHERE id = $1 AND status_id = $2`, [taskId, statusId])).rows[0]?.rank ?? null : null;
  const prev = await pick(beforeId);
  const next = await pick(afterId);
  if (prev !== null && next !== null) {
    if (Math.abs(next - prev) < 1e-6) {
      if (!respread) return prev + RANK_STEP / 2;
      await client.query(
        `UPDATE tasks t SET rank = r.n * ${RANK_STEP}
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY rank, id) AS n FROM tasks WHERE status_id = $1) r
         WHERE r.id = t.id`,
        [statusId]
      );
      return rankBetween(client, statusId, beforeId, afterId, false);
    }
    return (prev + next) / 2;
  }
  if (prev !== null) return prev + RANK_STEP;
  if (next !== null) return next - RANK_STEP;
  return nextRank(client, statusId);
}

/** "Deadline depends on subtasks": the parent's deadline is the latest of its subtasks. */
async function syncParentDeadline(parentId) {
  const { rows } = await query(`SELECT deadline_from_subtasks FROM tasks WHERE id = $1`, [parentId]);
  if (!rows[0]?.deadline_from_subtasks) return;
  await query(
    `UPDATE tasks SET due_at = (SELECT MAX(due_at) FROM tasks WHERE parent_id = $1), due_time = TRUE, updated_at = NOW() WHERE id = $1`,
    [parentId]
  );
}

const setDiff = (before, after) => ({ added: after.filter((id) => !before.includes(id)), removed: before.filter((id) => !after.includes(id)) });

/**
 * Partial update. Each change goes to the history and, as an event, to the
 * task's conversation; reminders reset when the deadline moves; the people
 * concerned are notified.
 */
export async function updateTask(ctx, refOrId, patch = {}) {
  const row = await loadTaskRow(refOrId);
  const level = await taskLevel(ctx, row);
  requireLevel(level, LEVEL.edit);
  const ref = taskRef(row.project_key, row.number);
  const isOriginator = (row.originator_id || row.created_by) === ctx.userId;
  const manager = ctx.isAdmin || (!row.project_personal && (await levelOn(ACL, row.project_id, ctx)) >= LEVEL.manage);
  const changes = [];
  const fields = [];
  const values = [];
  const set = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  const flag = (key, column, field) => {
    if (typeof patch[key] === 'boolean' && patch[key] !== Boolean(row[column])) {
      set(column, patch[key]);
      changes.push({ field, to: patch[key] });
    }
  };

  if (patch.title !== undefined) {
    const title = clean(patch.title, 300);
    if (!title) throw httpError(400, 'Task title is required', 'TITLE_REQUIRED');
    if (title !== row.title) {
      set('title', title);
      changes.push({ field: 'title', from: row.title, to: title });
    }
  }
  if (patch.description !== undefined) {
    const { text, format } = cleanDescription({ description: patch.description, descriptionFormat: patch.descriptionFormat || row.description_format });
    if (text !== (row.description || null) || format !== row.description_format) {
      set('description', text);
      set('description_format', format);
      changes.push({ field: 'description' });
    }
  }
  flag('important', 'important', 'important');
  flag('resultRequired', 'result_required', 'resultRequired');
  flag('allowChangeDeadline', 'allow_change_deadline', 'allowChangeDeadline');
  flag('skipWeekends', 'skip_weekends', 'skipWeekends');
  flag('deadlineFromSubtasks', 'deadline_from_subtasks', 'deadlineFromSubtasks');
  flag('timeTracking', 'time_tracking', 'timeTracking');

  // `complete: true|false` picks the first "done" (or first open) status of the project.
  if (typeof patch.complete === 'boolean' && patch.statusId === undefined) {
    const isDone = row.status_category === 'done';
    if (patch.complete !== isDone) {
      const { rows } = await query(
        `SELECT id FROM task_statuses WHERE project_id = $1 AND ${patch.complete ? "category = 'done'" : "category <> 'done'"} ORDER BY sort, id LIMIT 1`,
        [row.project_id]
      );
      if (!rows[0]) throw httpError(400, 'The project has no suitable status', 'STATUS_UNKNOWN');
      patch = { ...patch, statusId: rows[0].id };
    }
  }
  let resetDue = false;
  let newStatus = null;
  if (patch.statusId !== undefined && !Number.isInteger(Number(patch.statusId))) throw httpError(400, 'Unknown status', 'STATUS_UNKNOWN');
  if (patch.statusId !== undefined && Number(patch.statusId) !== row.status_id) {
    const { rows } = await query(`SELECT * FROM task_statuses WHERE id = $1 AND project_id = $2`, [Number(patch.statusId), row.project_id]);
    if (!rows[0]) throw httpError(400, 'Unknown status', 'STATUS_UNKNOWN');
    newStatus = rows[0];
    if (newStatus.category === 'done' && row.result_required && patch.resultRequired !== false) {
      const results = await query(`SELECT 1 FROM task_results WHERE task_id = $1 LIMIT 1`, [row.id]);
      if (!results.rows.length) throw httpError(400, 'Add a result before completing the task', 'RESULT_REQUIRED');
    }
    set('status_id', newStatus.id);
    if (newStatus.category === 'done' && !row.completed_at) {
      set('completed_at', new Date());
      set('deferred_at', null);
    }
    if (newStatus.category === 'active' && !row.started_at) set('started_at', new Date());
    if (newStatus.category !== 'done' && row.completed_at) {
      set('completed_at', null);
      set('rating', null);
      resetDue = true;
    }
    changes.push({ field: 'status', from: row.status_name, to: newStatus.name, category: newStatus.category, wasDone: Boolean(row.completed_at) });
  }
  if (patch.priority !== undefined) {
    const priority = parsePriority(patch.priority);
    if (priority === null) throw httpError(400, 'Invalid priority', 'PRIORITY');
    if (priority !== row.priority) {
      set('priority', priority);
      changes.push({ field: 'priority', from: row.priority, to: priority });
    }
  }
  let newAssignee;
  if (patch.assigneeId !== undefined) {
    const [assigneeId = null] = await activeUsers([patch.assigneeId]);
    if (assigneeId !== row.assignee_id) {
      newAssignee = assigneeId;
      set('assignee_id', assigneeId);
      resetDue = true;
      const names = await namesOf([row.assignee_id, assigneeId]);
      changes.push({ field: 'assignee', from: names.find((n) => n.id === row.assignee_id)?.name || null, to: names.find((n) => n.id === assigneeId)?.name || null });
    }
  }
  if (patch.originatorId !== undefined) {
    if (!isOriginator && !manager) throw httpError(403, 'Only the originator can hand the task over', 'FORBIDDEN');
    const [originatorId] = await activeUsers([patch.originatorId]);
    if (originatorId && originatorId !== row.originator_id) {
      set('originator_id', originatorId);
      const names = await namesOf([row.originator_id, originatorId]);
      changes.push({ field: 'originator', from: names[0]?.name, to: names[names.length - 1]?.name });
    }
  }
  if (patch.dueAt !== undefined || patch.dueTime !== undefined) {
    if (!row.allow_change_deadline && !isOriginator && !manager) throw httpError(403, 'The originator does not allow changing the deadline', 'DEADLINE_LOCKED');
    const dueAt = patch.dueAt !== undefined ? parseDue(patch.dueAt) : row.due_at ? new Date(row.due_at).toISOString() : null;
    const dueTime = patch.dueTime !== undefined ? Boolean(patch.dueTime) : row.due_time;
    const before = row.due_at ? new Date(row.due_at).toISOString() : null;
    if (dueAt !== before || dueTime !== row.due_time) {
      set('due_at', dueAt);
      set('due_time', dueTime && Boolean(dueAt));
      resetDue = true;
      changes.push({ field: 'due', from: before, to: dueAt, time: dueTime });
    }
  }
  if (patch.startDate !== undefined) {
    const startDate = parseDate(patch.startDate);
    if (startDate !== (row.start_date ? toDateString(row.start_date) : null)) {
      set('start_date', startDate);
      changes.push({ field: 'start', from: row.start_date ? toDateString(row.start_date) : null, to: startDate });
    }
  }
  for (const [key, column] of [['planStart', 'plan_start'], ['planEnd', 'plan_end']]) {
    if (patch[key] !== undefined) {
      const value = parseStamp(patch[key]);
      if (value !== (row[column] ? new Date(row[column]).toISOString() : null)) {
        set(column, value);
        changes.push({ field: key, to: value });
      }
    }
  }
  if (patch.timeEstimate !== undefined) {
    const value = intOrNull(patch.timeEstimate, 0, 100000);
    if (value !== row.time_estimate) {
      set('time_estimate', value);
      changes.push({ field: 'timeEstimate', to: value });
    }
  }
  if (patch.labels !== undefined) {
    const labels = parseLabels(patch.labels);
    if (JSON.stringify(labels) !== JSON.stringify(row.labels || [])) {
      set('labels', labels);
      changes.push({ field: 'labels', from: row.labels || [], to: labels });
    }
  }
  if (patch.custom !== undefined) {
    set('custom', JSON.stringify(await cleanCustom(patch.custom)));
    changes.push({ field: 'custom' });
  }
  if (patch.flowId !== undefined) {
    const flowId = Number(patch.flowId) || null;
    if (flowId !== row.flow_id) {
      set('flow_id', flowId);
      const { rows } = flowId ? await query(`SELECT name FROM task_flows WHERE id = $1`, [flowId]) : { rows: [] };
      changes.push({ field: 'flow', to: rows[0]?.name || null });
    }
  }
  if (patch.parentId !== undefined) {
    let parentId = null;
    if (patch.parentId) {
      const parent = await loadTaskRow(patch.parentId);
      requireLevel(await taskLevel(ctx, parent), LEVEL.view);
      if (parent.id === row.id) throw httpError(400, 'A task cannot be its own parent', 'PARENT_SELF');
      // No cycles: the new parent must not be one of this task's descendants.
      const loop = await query(
        `WITH RECURSIVE down AS (SELECT id FROM tasks WHERE parent_id = $1 UNION SELECT t.id FROM tasks t JOIN down d ON t.parent_id = d.id) SELECT 1 FROM down WHERE id = $2`,
        [row.id, parent.id]
      );
      if (loop.rows.length) throw httpError(400, 'This would make a loop of subtasks', 'PARENT_LOOP');
      parentId = parent.id;
    }
    if (parentId !== row.parent_id) {
      set('parent_id', parentId);
      changes.push({ field: 'parent', to: parentId });
    }
  }
  if (typeof patch.deferred === 'boolean' && patch.deferred !== Boolean(row.deferred_at)) {
    set('deferred_at', patch.deferred ? new Date() : null);
    changes.push({ field: 'deferred', to: patch.deferred });
  }

  // Roles: full lists replace the current ones.
  const roleChanges = [];
  for (const [key, role] of [['coassigneeIds', 'coassignee'], ['auditorIds', 'auditor']]) {
    if (!Array.isArray(patch[key])) continue;
    const { rows } = await query(`SELECT user_id FROM task_members WHERE task_id = $1 AND role = $2`, [row.id, role]);
    const before = rows.map((r) => r.user_id);
    const after = await activeUsers(patch[key]);
    const diff = setDiff(before, after);
    if (diff.added.length || diff.removed.length) roleChanges.push({ role, ...diff });
  }

  if (resetDue) {
    set('due_notified_at', null);
    set('overdue_notified_at', null);
  }

  await withTransaction(async (client) => {
    const statusId = newStatus?.id || row.status_id;
    if (patch.move || newStatus) set('rank', await rankBetween(client, statusId, Number(patch.move?.beforeId) || null, Number(patch.move?.afterId) || null));
    if (fields.length) {
      values.push(row.id);
      await client.query(`UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    for (const change of roleChanges) {
      for (const userId of change.removed) await client.query(`DELETE FROM task_members WHERE task_id = $1 AND user_id = $2 AND role = $3`, [row.id, userId, change.role]);
      for (const userId of change.added) {
        await client.query(`INSERT INTO task_members VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [row.id, userId, change.role]);
        await watch(client, row.id, userId);
      }
    }
    for (const change of changes) await logActivity(client, row.id, ctx.userId, 'change', change);
    if (newAssignee) await watch(client, row.id, newAssignee);
  });

  for (const change of changes) await taskEvent(row.id, ctx.userId, { event: 'task.change', ...change });
  for (const change of roleChanges) {
    await taskEvent(row.id, ctx.userId, {
      event: 'task.members',
      role: change.role,
      added: await namesOf(change.added),
      removed: await namesOf(change.removed),
    });
  }
  if (patch.parentId !== undefined || patch.dueAt !== undefined) {
    if (row.parent_id) await syncParentDeadline(row.parent_id);
    const fresh = await query(`SELECT parent_id FROM tasks WHERE id = $1`, [row.id]);
    if (fresh.rows[0]?.parent_id && fresh.rows[0].parent_id !== row.parent_id) await syncParentDeadline(fresh.rows[0].parent_id);
  }

  if (changes.length || roleChanges.length) {
    const actor = await actorName(ctx);
    const title = changes.find((change) => change.field === 'title')?.to || row.title;
    const project = row.project_personal ? '' : row.project_name;
    const added = [...(newAssignee ? [newAssignee] : []), ...roleChanges.flatMap((change) => change.added)].filter((id) => id !== ctx.userId);
    if (added.length) {
      await notify({ userIds: added, kind: 'tasks.assigned', module: 'tasks', link: link(ref), actorId: ctx.userId, render: taskMessage('assigned', { ref, title, actor, project }) });
    }
    if (newStatus) {
      const recipients = (await followers({ ...row, assignee_id: newAssignee ?? row.assignee_id })).filter((id) => !added.includes(id));
      await notify({ userIds: recipients, kind: 'tasks.status', module: 'tasks', link: link(ref), actorId: ctx.userId, render: taskMessage('status', { ref, title, actor, status: newStatus.name }) });
    }
    const priority = changes.find((change) => change.field === 'priority');
    if (priority && priority.to === 3 && (newAssignee ?? row.assignee_id)) {
      await notify({ userIds: [newAssignee ?? row.assignee_id], kind: 'tasks.priority', module: 'tasks', link: link(ref), actorId: ctx.userId, render: taskMessage('priority', { ref, title, priority: 3 }) });
    }
  }
  if (changes.length || roleChanges.length) {
    const fresh = await loadTaskRow(row.id);
    await taskWebhook('task.updated', fresh, { changes: [...changes, ...roleChanges.map((change) => ({ field: change.role, added: change.added, removed: change.removed }))] }, ctx.userId);
    if (!row.completed_at && fresh.completed_at) {
      await taskWebhook('task.completed', fresh, {}, ctx.userId);
      notifyProjectFollowers(fresh, 'projectDone', ctx.userId);
    }
    return taskShape(fresh);
  }
  return taskShape(await loadTaskRow(row.id));
}

/** Moves a task to another project: new number (and reference), status by category. */
export async function moveTaskToProject(ctx, refOrId, projectRef) {
  const row = await loadTaskRow(refOrId);
  requireLevel(await taskLevel(ctx, row), LEVEL.edit);
  const target = projectRef ? await loadProject(projectRef) : await loadProject(await personalProjectId());
  if (target.id === row.project_id) return taskShape(row);
  if (!target.is_personal) requireLevel(await levelOn(ACL, target.id, ctx), LEVEL.edit);
  if (target.archived_at) throw httpError(400, 'The project is archived', 'ARCHIVED');
  const statuses = await query(`SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY sort, id`, [target.id]);
  const status = statuses.rows.find((item) => item.category === row.status_category) || statuses.rows[0];
  await withTransaction(async (client) => {
    const seq = await client.query(`UPDATE task_projects SET seq = seq + 1 WHERE id = $1 RETURNING seq`, [target.id]);
    await client.query(`UPDATE tasks SET project_id = $2, number = $3, status_id = $4, rank = $5, updated_at = NOW() WHERE id = $1`, [
      row.id,
      target.id,
      seq.rows[0].seq,
      status.id,
      await nextRank(client, status.id),
    ]);
    await logActivity(client, row.id, ctx.userId, 'change', { field: 'project', from: row.project_personal ? null : row.project_name, to: target.is_personal ? null : target.name });
  });
  await taskEvent(row.id, ctx.userId, { event: 'task.change', field: 'project', from: row.project_personal ? null : row.project_name, to: target.is_personal ? null : target.name });
  return taskShape(await loadTaskRow(row.id));
}

export async function deleteTask(ctx, refOrId) {
  const row = await loadTaskRow(refOrId);
  const level = await taskLevel(ctx, row);
  const projectLevel = row.project_personal ? LEVEL.none : await levelOn(ACL, row.project_id, ctx);
  const isOriginator = (row.originator_id || row.created_by) === ctx.userId;
  if (!(ctx.isAdmin || projectLevel >= LEVEL.manage || (level >= LEVEL.edit && isOriginator))) {
    requireLevel(level, LEVEL.view);
    throw httpError(403, 'Only the originator or a project manager can delete a task', 'FORBIDDEN');
  }
  await taskWebhook('task.deleted', row, {}, ctx.userId);
  await query(`DELETE FROM chat_rooms WHERE entity_type = 'task' AND entity_id = $1`, [row.id]).catch(() => {});
  await query(`DELETE FROM tasks WHERE id = $1`, [row.id]);
}

export async function editableTask(ctx, taskId) {
  const row = await loadTaskRow(taskId);
  requireLevel(await taskLevel(ctx, row), LEVEL.edit);
  return row;
}

export async function viewableTask(ctx, taskId) {
  const row = await loadTaskRow(taskId);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  return row;
}

export async function touch(taskId) {
  await query(`UPDATE tasks SET updated_at = NOW() WHERE id = $1`, [taskId]);
}

// ── Legacy comments (now the task chat) and watching ────────────────────────

const MENTION_RE = /(^|[^\w@])@([a-z0-9._-]{3,32})/gi;

export function mentionedUsernames(text) {
  const names = new Set();
  for (const match of String(text || '').matchAll(MENTION_RE)) names.add(match[2].toLowerCase());
  return [...names];
}

export async function setWatching(ctx, taskId, on) {
  const row = await loadTaskRow(taskId);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  if (on) await query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, ctx.userId]);
  else await query(`DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2`, [row.id, ctx.userId]);
  return Boolean(on);
}

// ── Overview and calendar feed ──────────────────────────────────────────────

export async function overview(ctx) {
  const projects = await listProjects(ctx);
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.assignee_id = $1)::int AS open,
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.assignee_id = $1 AND t.due_at < NOW())::int AS overdue,
       COUNT(*) FILTER (WHERE t.completed_at >= NOW() - INTERVAL '7 days' AND t.assignee_id = $1)::int AS done_week,
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND COALESCE(t.originator_id, t.created_by) = $1 AND t.assignee_id IS DISTINCT FROM $1)::int AS assigned,
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND EXISTS (SELECT 1 FROM task_members m WHERE m.task_id = t.id AND m.user_id = $1 AND m.role = 'coassignee'))::int AS helping,
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND EXISTS (SELECT 1 FROM task_members m WHERE m.task_id = t.id AND m.user_id = $1 AND m.role = 'auditor'))::int AS auditing
     FROM tasks t
     WHERE $2::int[] IS NULL OR t.project_id = ANY($2)`,
    [ctx.userId, ctx.limits?.[ACL] ? [...ctx.limits[ACL]] : null]
  );
  return { projects, mine: rows[0] };
}

/** Tasks with a due date inside [from, to) for the calendar module. */
/**
 * Tasks with a deadline in a range, for the calendar.
 *   scope  doing — I work on it · participant — any role of mine (default) · all — every task I can see
 *   done   false hides completed tasks
 */
export async function calendarFeed(ctx, { from, to, mine, scope, done = true }) {
  const which = scope || (mine ? 'participant' : 'all');
  const filters = { dueFrom: from, dueTo: to, sort: 'due', deferred: '0', foreignPersonal: '0' };
  if (which === 'doing') filters.role = 'doing';
  else if (which === 'participant') filters.role = 'all';
  if (!done) filters.open = '1';
  return listTasks(ctx, filters);
}
