import { query, withTransaction } from '../../config/database.js';
import { avatarOf, clean, httpError, intId } from '../shared/acl.js';
import { canView } from './access.js';
import { COLUMNS, FROM, dealsByIds, logEvent, requireDeal } from './deals.js';
import { buildFilter } from './filters.js';
import { notifyActivity } from './integrations.js';
import { BUCKETS, Params, boundsFor, bucketSql, parseStamp, posInt } from './util.js';

/*
 * Activities ("дела"): calls, meetings, tasks, e-mails on a deal, with a due
 * time, a responsible person and an optional reminder. The nearest open one
 * drives the counters, the activity board and the card badges.
 */

export const ACTIVITY_KINDS = ['call', 'meeting', 'task', 'email', 'other'];
const KIND_TITLES = { call: 'Звонок', meeting: 'Встреча', task: 'Задача', email: 'Письмо', other: 'Дело' };
const MAX_REMIND = 60 * 24 * 14;

// Open and done activities of a deal, with people, as one query's rows.
const SELECT = `
  SELECT a.*, o.username AS o_username, COALESCE(o.display_name, o.username) AS o_name, o.avatar_path AS o_avatar,
         b.username AS b_username, COALESCE(b.display_name, b.username) AS b_name, b.avatar_path AS b_avatar
  FROM crm_activities a
  LEFT JOIN users o ON o.id = a.owner_id
  LEFT JOIN users b ON b.id = a.done_by`;

const person = (id, username, name, avatar) => (id ? { id, username, name: name || username, avatarUrl: avatarOf(avatar) } : null);

export function activityShape(row) {
  return {
    id: row.id,
    dealId: row.deal_id,
    kind: row.kind,
    title: row.title,
    note: row.note || '',
    dueAt: row.due_at,
    owner: person(row.owner_id, row.o_username, row.o_name, row.o_avatar),
    remindMinutes: row.remind_minutes ?? null,
    doneAt: row.done_at,
    doneBy: person(row.done_by, row.b_username, row.b_name, row.b_avatar),
    createdAt: row.created_at,
    overdue: Boolean(!row.done_at && row.due_at && new Date(row.due_at) < new Date()),
  };
}

/** Open first (nearest due first), then done ones (latest first). */
export async function listActivities(ctx, dealId, { checked = false } = {}) {
  const id = checked ? dealId : (await requireDeal(ctx, dealId, { deleted: true })).row.id;
  const { rows } = await query(
    `${SELECT} WHERE a.deal_id = $1
     ORDER BY a.done_at IS NOT NULL, CASE WHEN a.done_at IS NULL THEN a.due_at END ASC NULLS LAST, a.done_at DESC, a.id`,
    [id]
  );
  return rows.map(activityShape);
}

async function loadActivity(id) {
  const { rows } = await query(`${SELECT} WHERE a.id = $1`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Activity not found', 'NOT_FOUND');
  return rows[0];
}

async function activeUser(value) {
  const id = posInt(value);
  if (!id) return null;
  const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [id]);
  return rows[0]?.id || null;
}

function dueOf(value) {
  const due = parseStamp(value);
  if (due === undefined) throw httpError(400, 'Invalid due date', 'INVALID_DATE');
  return due;
}

function remindOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0 || n > MAX_REMIND) throw httpError(400, `Reminder: 0…${MAX_REMIND} minutes before`, 'INVALID_REMINDER');
  return n;
}

/**
 * The responsible person must be able to open the deal: under 'own'
 * visibility they become a watcher when they are not owner / creator / watcher.
 */
async function ensureCanSee(client, ctx, dealRow, userId) {
  if (!userId || ctx.settings.visibility !== 'own') return;
  if ([dealRow.owner_id, dealRow.created_by].includes(userId)) return;
  await client.query(`INSERT INTO crm_deal_watchers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dealRow.id, userId]);
}

const activityRef = (row) => ({ id: row.id, kind: row.kind, title: row.title, dueAt: row.due_at });

export async function createActivity(ctx, dealId, input = {}) {
  const { row: deal } = await requireDeal(ctx, dealId);
  const kind = ACTIVITY_KINDS.includes(input.kind) ? input.kind : 'task';
  const title = clean(input.title, 300) || KIND_TITLES[kind];
  const ownerId = input.ownerId !== undefined && input.ownerId !== null && input.ownerId !== '' ? await activeUser(input.ownerId) : deal.owner_id || ctx.userId;
  if (!ownerId) throw httpError(400, 'The responsible person is not an active user', 'INVALID_FIELD');
  const dueAt = dueOf(input.dueAt);
  const remind = remindOf(input.remindMinutes);
  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO crm_activities (deal_id, kind, title, note, due_at, owner_id, remind_minutes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [deal.id, kind, title, String(input.note ?? '').slice(0, 20000).trim() || null, dueAt, ownerId, remind, ctx.userId]
    );
    await ensureCanSee(client, ctx, deal, ownerId);
    await logEvent(client, deal.id, 'activity_added', { data: { activity: activityRef(rows[0]), ownerId }, authorId: ctx.userId });
    await client.query(`UPDATE crm_deals SET updated_at = NOW() WHERE id = $1`, [deal.id]);
    return rows[0];
  });
  await notifyActivity(ctx, created, deal);
  return activityShape(await loadActivity(created.id));
}

/** Patch: kind, title, note, dueAt (activity board drag), ownerId, remindMinutes, done. */
export async function updateActivity(ctx, id, input = {}) {
  const current = await loadActivity(id);
  const { row: deal } = await requireDeal(ctx, current.deal_id);
  let newOwner = null;
  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM crm_activities WHERE id = $1 FOR UPDATE`, [current.id]);
    const row = rows[0];
    if (!row) throw httpError(404, 'Activity not found', 'NOT_FOUND');
    const sets = [];
    const params = [row.id];
    const set = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    const changes = [];
    if (input.kind !== undefined && ACTIVITY_KINDS.includes(input.kind) && input.kind !== row.kind) {
      set('kind', input.kind);
      changes.push('kind');
    }
    if (input.title !== undefined) {
      const title = clean(input.title, 300);
      if (!title) throw httpError(400, 'Activity title is required', 'TITLE_REQUIRED');
      if (title !== row.title) {
        set('title', title);
        changes.push('title');
      }
    }
    if (input.note !== undefined) {
      set('note', String(input.note ?? '').slice(0, 20000).trim() || null);
      changes.push('note');
    }
    let rearm = false;
    if (input.dueAt !== undefined) {
      const due = dueOf(input.dueAt);
      if ((due?.getTime() ?? null) !== (row.due_at ? new Date(row.due_at).getTime() : null)) {
        set('due_at', due);
        changes.push('dueAt');
        rearm = true;
      }
    }
    if (input.remindMinutes !== undefined) {
      const remind = remindOf(input.remindMinutes);
      if (remind !== row.remind_minutes) {
        set('remind_minutes', remind);
        changes.push('remindMinutes');
        rearm = true;
      }
    }
    // A new due time or reminder arms the reminder again.
    if (rearm) sets.push('reminded_at = NULL');
    if (input.ownerId !== undefined) {
      const ownerId = await activeUser(input.ownerId);
      if (!ownerId) throw httpError(400, 'The responsible person is not an active user', 'INVALID_FIELD');
      if (ownerId !== row.owner_id) {
        set('owner_id', ownerId);
        changes.push('owner');
        newOwner = ownerId;
        await ensureCanSee(client, ctx, deal, ownerId);
      }
    }
    let doneEvent = null;
    if (typeof input.done === 'boolean' && input.done !== Boolean(row.done_at)) {
      if (input.done) {
        sets.push('done_at = NOW()');
        set('done_by', ctx.userId);
        doneEvent = 'activity_done';
      } else {
        sets.push('done_at = NULL', 'done_by = NULL', 'reminded_at = NULL');
        doneEvent = 'activity_reopened';
      }
    }
    if (!sets.length) return;
    await client.query(`UPDATE crm_activities SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
    const { rows: fresh } = await client.query(`SELECT * FROM crm_activities WHERE id = $1`, [row.id]);
    if (doneEvent) await logEvent(client, deal.id, doneEvent, { data: { activity: activityRef(fresh[0]) }, authorId: ctx.userId });
    if (changes.length) await logEvent(client, deal.id, 'activity_updated', { data: { activity: activityRef(fresh[0]), changes, from: { dueAt: row.due_at } }, authorId: ctx.userId });
    await client.query(`UPDATE crm_deals SET updated_at = NOW() WHERE id = $1`, [deal.id]);
  });
  const fresh = await loadActivity(current.id);
  if (newOwner) await notifyActivity(ctx, fresh, deal);
  return activityShape(fresh);
}

export async function deleteActivity(ctx, id) {
  const current = await loadActivity(id);
  const { row: deal } = await requireDeal(ctx, current.deal_id);
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM crm_activities WHERE id = $1`, [current.id]);
    await logEvent(client, deal.id, 'activity_deleted', { data: { activity: activityRef(current) }, authorId: ctx.userId });
  });
}

// ── Counters and the activity board ─────────────────────────────────────────

// The nearest open activity of each deal.
export const ACTIVITY_JOIN = `LEFT JOIN LATERAL (
  SELECT MIN(ca.due_at) AS min_due, COUNT(*)::int AS open FROM crm_activities ca WHERE ca.deal_id = d.id AND ca.done_at IS NULL
) a ON TRUE`;

/**
 * { overdue, today, planned, none, incoming } over the filter (its `activity`
 * key is ignored). incoming: deals given to me by someone else that I have not
 * touched yet (no history entry of mine).
 */
export async function counters(ctx, input = {}) {
  const bounds = boundsFor(ctx, input);
  const p = new Params();
  const where = buildFilter(ctx, input, { fields: ctx.settings.fields || [], bounds, ignore: ['activity'] }, p);
  const bucket = bucketSql(p, bounds);
  const me = p.add(ctx.userId);
  const { rows } = await query(
    `SELECT b.bucket, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE b.incoming)::int AS incoming FROM (
       SELECT ${bucket} AS bucket,
              (d.owner_id = ${me} AND d.created_by IS DISTINCT FROM ${me}
               AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.deal_id = d.id AND e.author_id = ${me})) AS incoming
       FROM ${FROM} ${ACTIVITY_JOIN} WHERE ${where.join(' AND ')}
     ) b GROUP BY b.bucket`,
    p.values
  );
  const out = { overdue: 0, today: 0, planned: 0, none: 0, incoming: 0 };
  for (const row of rows) {
    const key = ['week', 'nextWeek', 'later'].includes(row.bucket) ? 'planned' : row.bucket;
    out[key] += row.n;
    out.incoming += row.incoming;
  }
  return out;
}

/**
 * Deals in columns by their nearest open activity: overdue · today · week ·
 * nextWeek · later · none. `column` + `offset` page one column.
 */
export async function activityBoard(ctx, input = {}) {
  const bounds = boundsFor(ctx, input);
  const limit = Math.min(100, Math.max(1, Number.parseInt(input.limit, 10) || 30));
  const only = BUCKETS.includes(input.column) ? input.column : null;
  const offset = only ? Math.max(0, Number.parseInt(input.offset, 10) || 0) : 0;
  const p = new Params();
  const where = buildFilter(ctx, input, { fields: ctx.settings.fields || [], bounds, ignore: ['activity'] }, p);
  const bucket = bucketSql(p, bounds);
  const base = `SELECT d.id, a.min_due, ${bucket} AS bucket FROM ${FROM} ${ACTIVITY_JOIN} WHERE ${where.join(' AND ')}`;
  const page = new Params(p.values);
  const [counts, picked] = await Promise.all([
    query(`SELECT b.bucket, COUNT(*)::int AS n FROM (${base}) b GROUP BY b.bucket`, p.values),
    query(
      `SELECT x.id, x.bucket FROM (
         SELECT b.id, b.bucket, ROW_NUMBER() OVER (PARTITION BY b.bucket ORDER BY b.min_due ASC NULLS LAST, b.id DESC) AS rn FROM (${base}) b
       ) x WHERE x.rn > ${offset} AND x.rn <= ${offset + limit} ${only ? `AND x.bucket = ${page.add(only)}` : ''}
       ORDER BY x.bucket, x.rn`,
      page.values
    ),
  ]);
  const deals = await dealsByIds(ctx, picked.rows.map((row) => row.id));
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const countOf = new Map(counts.rows.map((row) => [row.bucket, row.n]));
  return {
    columns: BUCKETS.filter((key) => !only || key === only).map((key) => {
      const own = picked.rows.filter((row) => row.bucket === key).map((row) => byId.get(row.id)).filter(Boolean);
      const count = countOf.get(key) || 0;
      return { key, count, deals: own, hasMore: offset + own.length < count };
    }),
  };
}

/** My open activities across deals ("Мои дела"): due before `to` (all when omitted). */
export async function myActivities(ctx, input = {}) {
  const limit = Math.min(200, Math.max(1, Number.parseInt(input.limit, 10) || 100));
  const to = parseStamp(input.to);
  const { rows } = await query(
    `${SELECT} JOIN crm_deals d ON d.id = a.deal_id
     WHERE a.owner_id = $1 AND a.done_at IS NULL AND d.deleted_at IS NULL ${to ? 'AND a.due_at < $2' : ''}
     ORDER BY a.due_at ASC NULLS LAST, a.id LIMIT ${limit}`,
    to ? [ctx.userId, to] : [ctx.userId]
  );
  const dealIds = [...new Set(rows.map((row) => row.deal_id))];
  const { rows: dealRows } = dealIds.length ? await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE d.id = ANY($1)`, [dealIds]) : { rows: [] };
  // The responsible person of an activity may open its deal (they are made a watcher under 'own' visibility).
  const titles = new Map(dealRows.filter((row) => canView(ctx, row, [ctx.userId])).map((row) => [row.id, { id: row.id, title: row.title, stage: { id: row.stage_id, name: row.stage_name, color: row.stage_color } }]));
  return rows.filter((row) => titles.has(row.deal_id)).map((row) => ({ ...activityShape(row), deal: titles.get(row.deal_id) }));
}
