import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { getUserAccess } from '../../services/rbac.js';
import { hasPermission } from '../../services/permissions.js';
import { clean, httpError, HEX } from '../shared/acl.js';
import { fromWall, toWall } from '../calendar/recurrence.js';
import { isValidTimeZone, isoDay } from '../../services/datetime.js';
import { regionalOfUser } from '../../services/regional.js';
import { createTask, loadTaskRow } from './service.js';
import { taskEvent } from './chat.js';

/*
 * Templates and recurring tasks are one mechanism: a template keeps the form
 * (payload); a recurring template also has a schedule and creates a task each
 * time it comes due. Changing the template changes every future copy.
 *
 * Recurrence: { every, unit: day|week|month|year, weekdays?: [1..7],
 *   start: 'YYYY-MM-DD', time: 'HH:MM', tz, end: { mode: never|count|date, count, date },
 *   deadline: { amount, unit: hour|day|week } | null, weekends: keep|skip }
 */

const UNITS = ['day', 'week', 'month', 'year'];
const intIn = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * `fallbackZone`: the zone when the input names none (the author's region
 * zone); the schedule's wall-clock times ("09:00") are in that zone.
 */
export function cleanRecurrence(input, fallbackZone = 'UTC') {
  if (!input || typeof input !== 'object') return null;
  const tz = isValidTimeZone(input.tz) ? input.tz : isValidTimeZone(fallbackZone) ? fallbackZone : 'UTC';
  const time = /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '09:00';
  // No start: today in the schedule's zone.
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.start || '') ? input.start : isoDay(new Date(), tz);
  const endMode = ['never', 'count', 'date'].includes(input.end?.mode) ? input.end.mode : 'never';
  return {
    every: intIn(input.every, 1, 365, 1),
    unit: UNITS.includes(input.unit) ? input.unit : 'week',
    weekdays: Array.isArray(input.weekdays) ? [...new Set(input.weekdays.map(Number).filter((d) => d >= 1 && d <= 7))].sort() : [],
    start,
    time,
    tz,
    end: {
      mode: endMode,
      count: endMode === 'count' ? intIn(input.end?.count, 1, 1000, 10) : null,
      date: endMode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(input.end?.date || '') ? input.end.date : null,
    },
    deadline: input.deadline && Number(input.deadline.amount) > 0 ? { amount: intIn(input.deadline.amount, 1, 1000, 1), unit: ['hour', 'day', 'week'].includes(input.deadline.unit) ? input.deadline.unit : 'day' } : null,
    weekends: input.weekends === 'skip' ? 'skip' : 'keep',
  };
}

/** Wall-clock date in the template's zone → the instant. */
function at(dateKey, time, tz) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return fromWall(new Date(Date.UTC(y, m - 1, d, hh, mm)), tz);
}

const keyOf = (date) => date.toISOString().slice(0, 10);
const addDays = (key, n) => keyOf(new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000));
const weekday = (key) => ((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The first occurrence strictly after `after`, or null when the schedule ended. */
export function nextOccurrence(rec, after = new Date(), runs = 0) {
  if (!rec) return null;
  if (rec.end.mode === 'count' && runs >= rec.end.count) return null;
  const afterKey = keyOf(toWall(after, rec.tz));
  let key = rec.start;
  for (let i = 0; i < 5000; i += 1) {
    let candidate = key;
    if (rec.weekends === 'skip') {
      const day = weekday(candidate);
      if (day === 6) candidate = addDays(candidate, 2);
      if (day === 7) candidate = addDays(candidate, 1);
    }
    const instant = at(candidate, rec.time, rec.tz);
    const allowed = rec.unit !== 'week' || !rec.weekdays.length || rec.weekdays.includes(weekday(key));
    if (allowed && instant > after && candidate >= rec.start) {
      if (rec.end.mode === 'date' && rec.end.date && candidate > rec.end.date) return null;
      return instant;
    }
    // Step: weekly schedules with chosen weekdays walk day by day inside active weeks.
    if (rec.unit === 'day') key = addDays(key, rec.every);
    else if (rec.unit === 'week') {
      if (rec.weekdays.length) {
        const next = addDays(key, 1);
        const weeks = Math.floor((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${rec.start}T00:00:00Z`)) / (7 * 86400000));
        key = weeks % rec.every === 0 ? next : addDays(next, 7 * (rec.every - 1));
      } else key = addDays(key, 7 * rec.every);
    } else {
      const [y, m, d] = key.split('-').map(Number);
      const months = rec.unit === 'month' ? rec.every : 12 * rec.every;
      const target = new Date(Date.UTC(y, m - 1 + months, 1));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      key = keyOf(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))));
    }
    if (key > afterKey && rec.end.mode === 'date' && rec.end.date && key > addDays(rec.end.date, 1)) return null;
  }
  return null;
}

function deadlineFrom(created, deadline) {
  if (!deadline) return null;
  const ms = { hour: 3600000, day: 86400000, week: 7 * 86400000 }[deadline.unit] * deadline.amount;
  return new Date(created.getTime() + ms).toISOString();
}

// ── Templates ───────────────────────────────────────────────────────────────

function shape(row, userId) {
  return {
    id: row.id,
    title: row.title,
    payload: row.payload,
    shared: row.shared,
    recurring: row.recurring,
    recurrence: row.recurrence,
    nextRunAt: row.next_run_at,
    runs: row.runs,
    active: row.active,
    mine: row.created_by === userId,
    author: row.author || null,
    updatedAt: row.updated_at,
  };
}

export async function listTemplates(ctx) {
  const { rows } = await query(
    `SELECT t.*, COALESCE(u.display_name, u.username) AS author FROM task_templates t LEFT JOIN users u ON u.id = t.created_by
     WHERE t.created_by = $1 OR t.shared OR $2 ORDER BY t.recurring, LOWER(t.title)`,
    [ctx.userId, ctx.isAdmin]
  );
  return rows.map((row) => shape(row, ctx.userId));
}

async function ownTemplate(ctx, id) {
  const { rows } = await query(`SELECT * FROM task_templates WHERE id = $1`, [Number(id) || 0]);
  if (!rows[0] || (!rows[0].shared && rows[0].created_by !== ctx.userId && !ctx.isAdmin)) throw httpError(404, 'Template not found', 'NOT_FOUND');
  return rows[0];
}

function cleanPayload(input) {
  const payload = input && typeof input === 'object' ? { ...input } : {};
  delete payload.fileIds;
  delete payload.templateId;
  return payload;
}

/** The author's region zone, read only when the schedule names no zone of its own. */
async function authorZone(ctx, recurrence) {
  if (!recurrence || typeof recurrence !== 'object' || isValidTimeZone(recurrence.tz)) return null;
  return (await regionalOfUser(ctx.userId)).timeZone;
}

export async function saveTemplate(ctx, input = {}, id = null) {
  const title = clean(input.title || input.payload?.title, 300);
  if (!title) throw httpError(400, 'Name the template', 'TITLE_REQUIRED');
  const recurrence = input.recurring ? cleanRecurrence(input.recurrence, await authorZone(ctx, input.recurrence)) : null;
  const next = recurrence ? nextOccurrence(recurrence, new Date(), 0) : null;
  if (id) {
    const current = await ownTemplate(ctx, id);
    if (current.created_by !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only its author can change a template', 'FORBIDDEN');
    const { rows } = await query(
      `UPDATE task_templates SET title = $2, payload = $3, shared = $4, recurring = $5, recurrence = $6, next_run_at = $7, active = $8, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [current.id, title, JSON.stringify(cleanPayload(input.payload ?? current.payload)), Boolean(input.shared ?? current.shared), Boolean(recurrence), recurrence ? JSON.stringify(recurrence) : null, next ? nextOccurrence(recurrence, new Date(), current.runs) : null, input.active !== false]
    );
    return shape(rows[0], ctx.userId);
  }
  const { rows } = await query(
    `INSERT INTO task_templates (title, payload, created_by, shared, recurring, recurrence, next_run_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [title, JSON.stringify(cleanPayload(input.payload)), ctx.userId, Boolean(input.shared), Boolean(recurrence), recurrence ? JSON.stringify(recurrence) : null, next]
  );
  return shape(rows[0], ctx.userId);
}

export async function deleteTemplate(ctx, id) {
  const current = await ownTemplate(ctx, id);
  if (current.created_by !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only its author can delete a template', 'FORBIDDEN');
  await query(`DELETE FROM task_templates WHERE id = $1`, [current.id]);
}

/**
 * A recurring task from the full form: the schedule becomes a template; the
 * task made now is its first copy (and points at it).
 */
export async function createRecurring(ctx, input, recurrenceInput) {
  const recurrence = cleanRecurrence(recurrenceInput, await authorZone(ctx, recurrenceInput));
  const template = await saveTemplate(ctx, { title: input.title, payload: input, recurring: true, recurrence });
  let task;
  try {
    task = await createTask(ctx, { ...input, templateId: template.id });
  } catch (err) {
    // Nothing was made: no schedule left behind either.
    await query(`DELETE FROM task_templates WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM tasks WHERE template_id = $1)`, [template.id]);
    throw err;
  }
  // The task made now stands for the first slot: the schedule continues after it.
  const next = nextAfterFirstCopy(recurrence, new Date());
  const { rows } = await query(`UPDATE task_templates SET runs = runs + 1, next_run_at = $2, active = $3 WHERE id = $1 RETURNING next_run_at, runs, active`, [
    template.id,
    next,
    Boolean(next),
  ]);
  return { task, template: { ...template, nextRunAt: rows[0]?.next_run_at ?? next, runs: rows[0]?.runs ?? 1, active: rows[0]?.active ?? Boolean(next) } };
}

/**
 * After the immediate first copy of a recurring task (runs = 1): the next run
 * is the occurrence after the slot that copy took, so it is not made twice.
 */
export function nextAfterFirstCopy(rec, now = new Date()) {
  if (!rec) return null;
  const firstSlot = nextOccurrence(rec, now, 0);
  if (!firstSlot) return null;
  return nextOccurrence(rec, firstSlot, 1);
}

async function ctxFor(userId) {
  const access = await getUserAccess(userId);
  return {
    userId,
    groupIds: new Set(access.groupIds || []),
    roleIds: new Set((access.roles || []).map((role) => role.id)),
    isAdmin: hasPermission(access.permissions || [], 'tasks.admin'),
  };
}

/** Scheduler: makes the tasks of recurring templates that came due. */
export async function runRecurring() {
  const parsed = parseSettings(await getSettings());
  if (!parsed.modules.tasks?.enabled) return;
  const { rows } = await query(`SELECT * FROM task_templates WHERE recurring AND active AND next_run_at IS NOT NULL AND next_run_at <= NOW() ORDER BY next_run_at LIMIT 50`);
  for (const template of rows) {
    const claimed = await query(`UPDATE task_templates SET next_run_at = NULL WHERE id = $1 AND next_run_at = $2 RETURNING id`, [template.id, template.next_run_at]);
    if (!claimed.rows.length) continue;
    const runs = template.runs + 1;
    try {
      const ctx = await ctxFor(template.created_by);
      const created = new Date();
      const task = await createTask(ctx, { ...template.payload, templateId: template.id, dueAt: deadlineFrom(created, template.recurrence?.deadline) || undefined, dueTime: Boolean(template.recurrence?.deadline) });
      await taskEvent(task.id, null, { event: 'task.recurring', template: template.title });
    } catch (err) {
      console.warn(`[tasks] recurring template ${template.id} failed:`, err.message);
    }
    const next = nextOccurrence(template.recurrence, new Date(), runs);
    await query(`UPDATE task_templates SET runs = $2, next_run_at = $3, active = $4 WHERE id = $1`, [template.id, runs, next, Boolean(next)]);
  }
}

// ── Flows ───────────────────────────────────────────────────────────────────

export async function listFlows(ctx) {
  const { rows } = await query(
    `SELECT f.*, COALESCE(u.display_name, u.username) AS owner_name,
            (SELECT COUNT(*)::int FROM tasks t WHERE t.flow_id = f.id AND t.completed_at IS NULL) AS open,
            (SELECT COUNT(*)::int FROM tasks t WHERE t.flow_id = f.id AND t.completed_at IS NULL AND t.due_at < NOW()) AS overdue,
            (SELECT COUNT(*)::int FROM tasks t WHERE t.flow_id = f.id AND t.completed_at >= NOW() - INTERVAL '30 days') AS done30,
            (SELECT COUNT(*)::int FROM tasks t WHERE t.flow_id = f.id AND t.completed_at >= NOW() - INTERVAL '30 days'
               AND (t.due_at IS NULL OR t.completed_at <= t.due_at)) AS ontime30
     FROM task_flows f LEFT JOIN users u ON u.id = f.owner_id WHERE f.active ORDER BY LOWER(f.name)`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color,
    projectId: row.project_id,
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name } : null,
    memberIds: row.member_ids,
    distribution: row.distribution,
    open: row.open,
    overdue: row.overdue,
    // Share of tasks finished on time over the last 30 days.
    efficiency: row.done30 ? Math.round((row.ontime30 / row.done30) * 100) : null,
    canEdit: row.owner_id === ctx.userId || ctx.isAdmin,
  }));
}

export async function saveFlow(ctx, input = {}, id = null) {
  const name = clean(input.name, 120);
  if (!name) throw httpError(400, 'Name the flow', 'NAME_REQUIRED');
  const members = (Array.isArray(input.memberIds) ? input.memberIds : []).map(Number).filter(Number.isInteger).slice(0, 100);
  const distribution = ['manual', 'queue', 'least'].includes(input.distribution) ? input.distribution : 'manual';
  const color = HEX.test(input.color || '') ? input.color.toUpperCase() : '#6366F1';
  if (id) {
    const { rows } = await query(`SELECT * FROM task_flows WHERE id = $1`, [Number(id) || 0]);
    if (!rows[0]) throw httpError(404, 'Flow not found', 'NOT_FOUND');
    if (rows[0].owner_id !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the flow owner can change it', 'FORBIDDEN');
    await query(`UPDATE task_flows SET name = $2, description = $3, color = $4, member_ids = $5, distribution = $6, project_id = $7 WHERE id = $1`, [
      rows[0].id,
      name,
      clean(input.description, 2000) || null,
      color,
      members,
      distribution,
      Number(input.projectId) || null,
    ]);
    return { id: rows[0].id };
  }
  const { rows } = await query(
    `INSERT INTO task_flows (name, description, color, member_ids, distribution, project_id, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [name, clean(input.description, 2000) || null, color, members, distribution, Number(input.projectId) || null, ctx.userId]
  );
  return { id: rows[0].id };
}

export async function deleteFlow(ctx, id) {
  const { rows } = await query(`SELECT * FROM task_flows WHERE id = $1`, [Number(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Flow not found', 'NOT_FOUND');
  if (rows[0].owner_id !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the flow owner can delete it', 'FORBIDDEN');
  await query(`UPDATE task_flows SET active = FALSE WHERE id = $1`, [rows[0].id]);
}

// ── Custom fields ───────────────────────────────────────────────────────────

export async function listFields() {
  const { rows } = await query(`SELECT id, name, type, sort, created_by FROM task_fields ORDER BY sort, id`);
  return rows;
}

export async function addField(ctx, input = {}) {
  const name = clean(input.name, 80);
  if (!name) throw httpError(400, 'Name the field', 'NAME_REQUIRED');
  const type = ['string', 'number', 'datetime', 'bool'].includes(input.type) ? input.type : 'string';
  const { rows } = await query(`INSERT INTO task_fields (name, type, sort, created_by) VALUES ($1, $2, COALESCE((SELECT MAX(sort) + 1 FROM task_fields), 0), $3) RETURNING id, name, type`, [
    name,
    type,
    ctx.userId,
  ]);
  return rows[0];
}

export async function deleteField(ctx, id) {
  const { rows } = await query(`SELECT * FROM task_fields WHERE id = $1`, [Number(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Field not found', 'NOT_FOUND');
  if (rows[0].created_by !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the author or an administrator can remove a field', 'FORBIDDEN');
  await query(`DELETE FROM task_fields WHERE id = $1`, [rows[0].id]);
}

export { loadTaskRow };
