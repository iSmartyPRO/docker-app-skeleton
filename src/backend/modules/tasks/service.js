import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import {
  HEX,
  LEVEL,
  LEVEL_NAMES,
  avatarOf,
  clean,
  httpError,
  levelMap,
  levelOn,
  membersOf,
  readAcl,
  requireLevel,
  writeAcl,
} from '../shared/acl.js';
import { slugify } from '../kb/shares.js';
import { insertStatuses } from './schema.js';
import { taskMessage } from './messages.js';

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
         s.category AS status_category, s.name AS status_name,
         a.username AS a_username, COALESCE(a.display_name, a.username) AS a_name, a.avatar_path AS a_avatar,
         (SELECT COUNT(*)::int FROM task_checklist c WHERE c.task_id = t.id) AS check_total,
         (SELECT COUNT(*)::int FROM task_checklist c WHERE c.task_id = t.id AND c.done) AS check_done,
         (SELECT COUNT(*)::int FROM task_comments c WHERE c.task_id = t.id) AS comment_count
  FROM tasks t
  JOIN task_projects p ON p.id = t.project_id
  JOIN task_statuses s ON s.id = t.status_id
  LEFT JOIN users a ON a.id = t.assignee_id
`;

function taskShape(row) {
  return {
    id: row.id,
    ref: taskRef(row.project_key, row.number),
    number: row.number,
    projectId: row.project_id,
    project: { id: row.project_id, key: row.project_key, name: row.project_name, color: row.project_color },
    title: row.title,
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

async function visibleProjectIds(ctx) {
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
     WHERE ($2::int[] IS NULL OR p.id = ANY($2))
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

// ── Tasks: reading ──────────────────────────────────────────────────────────

/**
 * Filters: project, assignee ('me' | 'none' | id), status[], priority[],
 * label, q (text or KEY-12), open ('1'), dueFrom / dueTo (ISO), doneSince (ISO),
 * sort ('board' | 'due' | 'priority' | 'updated' | 'created').
 */
export async function listTasks(ctx, filters = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };

  if (filters.project) {
    const project = await loadProject(filters.project);
    requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.view);
    add('t.project_id = $?', project.id);
  } else {
    add('t.project_id = ANY($?)', await visibleProjectIds(ctx));
    where.push('p.archived_at IS NULL');
  }

  if (filters.assignee === 'me') add('t.assignee_id = $?', ctx.userId);
  else if (filters.assignee === 'none') where.push('t.assignee_id IS NULL');
  else if (Number.isInteger(Number(filters.assignee)) && Number(filters.assignee) > 0) add('t.assignee_id = $?', Number(filters.assignee));

  const ids = (value) => String(value || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 2 ** 31);
  if (filters.status) add('t.status_id = ANY($?)', ids(filters.status));
  if (filters.priority) add('t.priority = ANY($?)', ids(filters.priority));
  if (filters.label) add('$? = ANY(t.labels)', clean(filters.label, 32));
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
  if (filters.dueFrom) add('t.due_at >= $?', parseDue(filters.dueFrom));
  if (filters.dueTo) add('t.due_at < $?', parseDue(filters.dueTo));
  if (filters.doneSince) add('(t.completed_at IS NULL OR t.completed_at >= $?)', parseDue(filters.doneSince));

  const order = {
    due: 't.due_at ASC NULLS LAST, t.priority DESC, t.id',
    priority: 't.priority DESC, t.due_at ASC NULLS LAST, t.id',
    updated: 't.updated_at DESC',
    created: 't.created_at DESC',
  }[filters.sort] || 's.sort, t.rank, t.id';

  const { rows } = await query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 2000`, params);
  return rows.map(taskShape);
}

async function loadTaskRow(refOrId) {
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

/** The assignee may work on their task even with view-only access to the project. */
async function taskLevel(ctx, row) {
  const level = await levelOn(ACL, row.project_id, ctx);
  if (level >= LEVEL.view && row.assignee_id === ctx.userId) return Math.max(level, LEVEL.edit);
  return level;
}

export async function getTask(ctx, refOrId) {
  const row = await loadTaskRow(refOrId);
  const level = await taskLevel(ctx, row);
  requireLevel(level, LEVEL.view);
  const [checklist, comments, activity, watchers, author] = await Promise.all([
    query(`SELECT id, text, done FROM task_checklist WHERE task_id = $1 ORDER BY sort, id`, [row.id]),
    query(
      `SELECT c.id, c.body, c.created_at, c.edited_at, c.author_id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM task_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = $1 ORDER BY c.id`,
      [row.id]
    ),
    query(
      `SELECT a.id, a.kind, a.data, a.created_at, a.actor_id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM task_activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.task_id = $1 ORDER BY a.id DESC LIMIT 200`,
      [row.id]
    ),
    query(
      `SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM task_watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = $1 ORDER BY LOWER(COALESCE(u.display_name, u.username))`,
      [row.id]
    ),
    row.created_by
      ? query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = $1`, [row.created_by])
      : { rows: [] },
  ]);
  const projectLevel = await levelOn(ACL, row.project_id, ctx);
  return {
    ...taskShape(row),
    description: row.description || '',
    author: author.rows[0] ? person(author.rows[0].id, author.rows[0].username, author.rows[0].name, author.rows[0].avatar_path) : null,
    checklistItems: checklist.rows,
    commentList: comments.rows.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      editedAt: comment.edited_at,
      author: person(comment.author_id, comment.username, comment.name, comment.avatar_path),
      mine: comment.author_id === ctx.userId,
    })),
    activity: activity.rows.map((entry) => ({
      id: Number(entry.id),
      kind: entry.kind,
      data: entry.data,
      createdAt: entry.created_at,
      actor: person(entry.actor_id, entry.username, entry.name, entry.avatar_path),
    })),
    watchers: watchers.rows.map((user) => person(user.id, user.username, user.name, user.avatar_path)),
    watching: watchers.rows.some((user) => user.id === ctx.userId),
    can: {
      edit: level >= LEVEL.edit,
      delete: projectLevel >= LEVEL.manage || (level >= LEVEL.edit && row.created_by === ctx.userId),
      comment: level >= LEVEL.view,
    },
  };
}

// ── Tasks: writing ──────────────────────────────────────────────────────────

async function memberIds(projectId) {
  return new Set((await membersOf(ACL, projectId, LEVEL.view)).map((user) => user.id));
}

async function actorName(ctx) {
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [ctx.userId]);
  return rows[0]?.name || '';
}

async function logActivity(client, taskId, actorId, kind, data = {}) {
  await client.query(`INSERT INTO task_activity (task_id, actor_id, kind, data) VALUES ($1, $2, $3, $4)`, [
    taskId,
    actorId,
    kind,
    JSON.stringify(data),
  ]);
}

async function watch(client, taskId, userId) {
  if (!userId) return;
  await client.query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [taskId, userId]);
}

async function nextRank(client, statusId, position = 'bottom') {
  const { rows } = await client.query(
    `SELECT ${position === 'top' ? 'MIN' : 'MAX'}(rank) AS edge FROM tasks WHERE status_id = $1`,
    [statusId]
  );
  const edge = rows[0].edge;
  if (edge === null) return RANK_STEP;
  return position === 'top' ? edge - RANK_STEP : edge + RANK_STEP;
}

/** Everyone who follows the task and can still see it: watchers, assignee, author. */
async function followers(row) {
  const { rows } = await query(`SELECT user_id FROM task_watchers WHERE task_id = $1`, [row.id]);
  const members = await memberIds(row.project_id);
  return [...new Set([...rows.map((watcher) => watcher.user_id), row.assignee_id, row.created_by])].filter((id) => id && members.has(id));
}

export async function createTask(ctx, input) {
  const project = await loadProject(input.projectId || input.project);
  requireLevel(await levelOn(ACL, project.id, ctx), LEVEL.edit);
  if (project.archived_at) throw httpError(400, 'The project is archived', 'ARCHIVED');
  const title = clean(input.title, 300);
  if (!title) throw httpError(400, 'Task title is required', 'TITLE_REQUIRED');

  const statuses = await query(`SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY sort, id`, [project.id]);
  const status = statuses.rows.find((row) => row.id === Number(input.statusId)) || statuses.rows[0];
  const assigneeId = Number(input.assigneeId) || null;
  if (assigneeId && !(await memberIds(project.id)).has(assigneeId)) {
    throw httpError(400, 'The assignee has no access to this project', 'ASSIGNEE_ACCESS');
  }

  const row = await withTransaction(async (client) => {
    const seq = await client.query(`UPDATE task_projects SET seq = seq + 1 WHERE id = $1 RETURNING seq`, [project.id]);
    const rank = await nextRank(client, status.id, input.position === 'top' ? 'top' : 'bottom');
    const { rows } = await client.query(
      `INSERT INTO tasks (project_id, number, title, description, status_id, priority, assignee_id, start_date, due_at, due_time,
                          labels, rank, created_by, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        project.id,
        seq.rows[0].seq,
        title,
        clean(input.description, 20000) || null,
        status.id,
        parsePriority(input.priority) ?? 1,
        assigneeId,
        input.startDate ? parseDate(input.startDate) : null,
        input.dueAt ? parseDue(input.dueAt) : null,
        Boolean(input.dueTime),
        parseLabels(input.labels),
        rank,
        ctx.userId,
        status.category === 'done' ? new Date() : null,
      ]
    );
    const taskId = rows[0].id;
    for (const [index, text] of (Array.isArray(input.checklist) ? input.checklist : []).slice(0, 50).entries()) {
      const value = clean(text, 500);
      if (value) await client.query(`INSERT INTO task_checklist (task_id, text, sort) VALUES ($1, $2, $3)`, [taskId, value, index]);
    }
    await watch(client, taskId, ctx.userId);
    await watch(client, taskId, assigneeId);
    await logActivity(client, taskId, ctx.userId, 'created');
    return taskId;
  });

  const created = await loadTaskRow(row);
  const ref = taskRef(project.key, created.number);
  if (assigneeId && assigneeId !== ctx.userId) {
    await notify({
      userIds: [assigneeId],
      kind: 'tasks.assigned',
      module: 'tasks',
      link: link(ref),
      actorId: ctx.userId,
      render: taskMessage('assigned', { ref, title, actor: await actorName(ctx), project: project.name }),
    });
  }
  return taskShape(created);
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
      // Ranks ran out of room: spread the column evenly and retry once.
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

/**
 * Partial update. Records each change in the activity log, resets reminder
 * markers when the due date moves, and notifies the people concerned.
 * `move: { beforeId, afterId }` positions the task inside its (new) column.
 */
export async function updateTask(ctx, refOrId, patch = {}) {
  const row = await loadTaskRow(refOrId);
  requireLevel(await taskLevel(ctx, row), LEVEL.edit);
  const ref = taskRef(row.project_key, row.number);
  const changes = [];
  const fields = [];
  const values = [];
  const set = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
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
    const description = clean(patch.description, 20000) || null;
    if (description !== (row.description || null)) {
      set('description', description);
      changes.push({ field: 'description' });
    }
  }
  // `complete: true|false` picks the first "done" (or first open) status of the project.
  if (typeof patch.complete === 'boolean' && patch.statusId === undefined) {
    const isDone = row.status_category === 'done';
    if (patch.complete !== isDone) {
      const { rows } = await query(
        `SELECT id FROM task_statuses WHERE project_id = $1 AND ${patch.complete ? "category = 'done'" : "category <> 'done'"}
         ORDER BY sort, id LIMIT 1`,
        [row.project_id]
      );
      if (!rows[0]) throw httpError(400, 'The project has no suitable status', 'STATUS_UNKNOWN');
      patch = { ...patch, statusId: rows[0].id };
    }
  }
  let resetDue = false;
  let newStatus = null;
  if (patch.statusId !== undefined && !Number.isInteger(Number(patch.statusId))) {
    throw httpError(400, 'Unknown status', 'STATUS_UNKNOWN');
  }
  if (patch.statusId !== undefined && Number(patch.statusId) !== row.status_id) {
    const { rows } = await query(`SELECT * FROM task_statuses WHERE id = $1 AND project_id = $2`, [Number(patch.statusId), row.project_id]);
    if (!rows[0]) throw httpError(400, 'Unknown status', 'STATUS_UNKNOWN');
    newStatus = rows[0];
    set('status_id', newStatus.id);
    if (newStatus.category === 'done' && !row.completed_at) set('completed_at', new Date());
    if (newStatus.category !== 'done' && row.completed_at) {
      set('completed_at', null);
      // Reopened: deadline reminders apply again.
      resetDue = true;
    }
    changes.push({ field: 'status', from: row.status_name, to: newStatus.name });
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
    const assigneeId = Number(patch.assigneeId) || null;
    if (assigneeId !== row.assignee_id) {
      if (assigneeId && !(await memberIds(row.project_id)).has(assigneeId)) {
        throw httpError(400, 'The assignee has no access to this project', 'ASSIGNEE_ACCESS');
      }
      newAssignee = assigneeId;
      set('assignee_id', assigneeId);
      // The new assignee gets their own "due soon" reminder.
      resetDue = true;
      const names = await query(`SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id = ANY($1)`, [
        [row.assignee_id, assigneeId].filter(Boolean),
      ]);
      const nameOf = (id) => names.rows.find((user) => user.id === id)?.name || null;
      changes.push({ field: 'assignee', from: nameOf(row.assignee_id), to: nameOf(assigneeId) });
    }
  }
  if (patch.dueAt !== undefined || patch.dueTime !== undefined) {
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
  if (patch.labels !== undefined) {
    const labels = parseLabels(patch.labels);
    if (JSON.stringify(labels) !== JSON.stringify(row.labels || [])) {
      set('labels', labels);
      changes.push({ field: 'labels', from: row.labels || [], to: labels });
    }
  }

  if (resetDue) {
    set('due_notified_at', null);
    set('overdue_notified_at', null);
  }

  await withTransaction(async (client) => {
    const statusId = newStatus?.id || row.status_id;
    if (patch.move || newStatus) {
      set('rank', await rankBetween(client, statusId, Number(patch.move?.beforeId) || null, Number(patch.move?.afterId) || null));
    }
    if (fields.length) {
      values.push(row.id);
      await client.query(`UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    for (const change of changes) await logActivity(client, row.id, ctx.userId, 'change', change);
    if (newAssignee) await watch(client, row.id, newAssignee);
  });

  if (changes.length) {
    const actor = await actorName(ctx);
    const title = changes.find((change) => change.field === 'title')?.to || row.title;
    if (newAssignee && newAssignee !== ctx.userId) {
      await notify({
        userIds: [newAssignee],
        kind: 'tasks.assigned',
        module: 'tasks',
        link: link(ref),
        actorId: ctx.userId,
        render: taskMessage('assigned', { ref, title, actor, project: row.project_name }),
      });
    }
    if (newStatus) {
      const recipients = (await followers({ ...row, assignee_id: newAssignee ?? row.assignee_id })).filter((id) => id !== newAssignee);
      await notify({
        userIds: recipients,
        kind: 'tasks.status',
        module: 'tasks',
        link: link(ref),
        actorId: ctx.userId,
        render: taskMessage('status', { ref, title, actor, status: newStatus.name }),
      });
    }
    const priority = changes.find((change) => change.field === 'priority');
    if (priority && priority.to === 3 && (newAssignee ?? row.assignee_id)) {
      await notify({
        userIds: [newAssignee ?? row.assignee_id],
        kind: 'tasks.priority',
        module: 'tasks',
        link: link(ref),
        actorId: ctx.userId,
        render: taskMessage('priority', { ref, title, priority: 3 }),
      });
    }
  }
  return taskShape(await loadTaskRow(row.id));
}

export async function deleteTask(ctx, refOrId) {
  const row = await loadTaskRow(refOrId);
  const level = await taskLevel(ctx, row);
  const projectLevel = await levelOn(ACL, row.project_id, ctx);
  if (!(projectLevel >= LEVEL.manage || (level >= LEVEL.edit && row.created_by === ctx.userId))) {
    requireLevel(level, LEVEL.view);
    throw httpError(403, 'Only the author or a project manager can delete a task', 'FORBIDDEN');
  }
  await query(`DELETE FROM tasks WHERE id = $1`, [row.id]);
}

// ── Checklist ───────────────────────────────────────────────────────────────

async function editableTask(ctx, taskId) {
  const row = await loadTaskRow(taskId);
  requireLevel(await taskLevel(ctx, row), LEVEL.edit);
  return row;
}

async function touch(taskId) {
  await query(`UPDATE tasks SET updated_at = NOW() WHERE id = $1`, [taskId]);
}

export async function addChecklistItem(ctx, taskId, text) {
  const row = await editableTask(ctx, taskId);
  const value = clean(text, 500);
  if (!value) throw httpError(400, 'Text is required', 'TEXT_REQUIRED');
  const { rows } = await query(
    `INSERT INTO task_checklist (task_id, text, sort)
     VALUES ($1, $2, COALESCE((SELECT MAX(sort) + 1 FROM task_checklist WHERE task_id = $1), 0)) RETURNING id, text, done`,
    [row.id, value]
  );
  await touch(row.id);
  return rows[0];
}

async function checklistRow(itemId) {
  const { rows } = await query(`SELECT * FROM task_checklist WHERE id = $1`, [itemId]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

export async function updateChecklistItem(ctx, itemId, patch) {
  const item = await checklistRow(itemId);
  await editableTask(ctx, item.task_id);
  const text = patch.text !== undefined ? clean(patch.text, 500) : item.text;
  if (!text) throw httpError(400, 'Text is required', 'TEXT_REQUIRED');
  const done = typeof patch.done === 'boolean' ? patch.done : item.done;
  const { rows } = await query(`UPDATE task_checklist SET text = $2, done = $3 WHERE id = $1 RETURNING id, text, done`, [item.id, text, done]);
  await touch(item.task_id);
  return rows[0];
}

export async function deleteChecklistItem(ctx, itemId) {
  const item = await checklistRow(itemId);
  await editableTask(ctx, item.task_id);
  await query(`DELETE FROM task_checklist WHERE id = $1`, [item.id]);
  await touch(item.task_id);
}

export async function reorderChecklist(ctx, taskId, ids) {
  const row = await editableTask(ctx, taskId);
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger);
  await withTransaction(async (client) => {
    for (const [index, itemId] of list.entries()) {
      await client.query(`UPDATE task_checklist SET sort = $3 WHERE id = $1 AND task_id = $2`, [itemId, row.id, index]);
    }
  });
}

// ── Comments, mentions, watching ────────────────────────────────────────────

const MENTION_RE = /(^|[^\w@])@([a-z0-9._-]{3,32})/gi;

export function mentionedUsernames(text) {
  const names = new Set();
  for (const match of String(text || '').matchAll(MENTION_RE)) names.add(match[2].toLowerCase());
  return [...names];
}

export async function addComment(ctx, taskId, body) {
  const row = await loadTaskRow(taskId);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  const text = clean(body, 10000);
  if (!text) throw httpError(400, 'Comment is empty', 'TEXT_REQUIRED');
  const { rows } = await withTransaction(async (client) => {
    const inserted = await client.query(`INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`, [
      row.id,
      ctx.userId,
      text,
    ]);
    await watch(client, row.id, ctx.userId);
    await client.query(`UPDATE tasks SET updated_at = NOW() WHERE id = $1`, [row.id]);
    return inserted;
  });

  const ref = taskRef(row.project_key, row.number);
  const actor = await actorName(ctx);
  const snippet = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  const members = await memberIds(row.project_id);
  const names = mentionedUsernames(text);
  let mentioned = [];
  if (names.length) {
    const found = await query(`SELECT id FROM users WHERE LOWER(username) = ANY($1)`, [names]);
    mentioned = found.rows.map((user) => user.id).filter((id) => members.has(id));
    await notify({
      userIds: mentioned,
      kind: 'tasks.mention',
      module: 'tasks',
      link: link(ref),
      actorId: ctx.userId,
      render: taskMessage('mention', { ref, title: row.title, actor, snippet }),
    });
  }
  await notify({
    userIds: (await followers(row)).filter((id) => !mentioned.includes(id)),
    kind: 'tasks.comment',
    module: 'tasks',
    link: link(ref),
    actorId: ctx.userId,
    render: taskMessage('comment', { ref, title: row.title, actor, snippet }),
  });
  return { id: rows[0].id };
}

async function commentRow(commentId) {
  const { rows } = await query(`SELECT * FROM task_comments WHERE id = $1`, [commentId]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

export async function updateComment(ctx, commentId, body) {
  const comment = await commentRow(commentId);
  const row = await loadTaskRow(comment.task_id);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  if (comment.author_id !== ctx.userId) throw httpError(403, 'You can edit only your own comments', 'FORBIDDEN');
  const text = clean(body, 10000);
  if (!text) throw httpError(400, 'Comment is empty', 'TEXT_REQUIRED');
  await query(`UPDATE task_comments SET body = $2, edited_at = NOW() WHERE id = $1`, [comment.id, text]);
}

export async function deleteComment(ctx, commentId) {
  const comment = await commentRow(commentId);
  const row = await loadTaskRow(comment.task_id);
  const level = await levelOn(ACL, row.project_id, ctx);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  if (comment.author_id !== ctx.userId && level < LEVEL.manage) {
    throw httpError(403, 'You can delete only your own comments', 'FORBIDDEN');
  }
  await query(`DELETE FROM task_comments WHERE id = $1`, [comment.id]);
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
  const ids = projects.map((project) => project.id);
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE t.completed_at IS NULL)::int AS open,
       COUNT(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at < NOW())::int AS overdue,
       COUNT(*) FILTER (WHERE t.completed_at >= NOW() - INTERVAL '7 days')::int AS done_week
     FROM tasks t WHERE t.assignee_id = $1 AND t.project_id = ANY($2)`,
    [ctx.userId, ids]
  );
  return { projects, mine: rows[0] };
}

/** Tasks with a due date inside [from, to) for the calendar module. */
export async function calendarFeed(ctx, { from, to, mine }) {
  return listTasks(ctx, {
    dueFrom: from,
    dueTo: to,
    assignee: mine ? 'me' : undefined,
    sort: 'due',
  });
}
