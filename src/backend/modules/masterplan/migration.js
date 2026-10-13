import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { STATUSES, TIMED } from './constants.js';
import { canConfigure, forbidden, requireNode } from './access.js';
import { readCaps } from './rules.js';
import { unitsChanged } from './realtime.js';
import { dealForLink } from './crmLink.js';
import { conflict, getUnit } from './sales.js';
import { dayString, idList, intOr, iso, logEvent, money, parseNumber, text, userName } from './util.js';

/*
 * Status migration by an administrator (docs/masterplan.md "Status
 * migration"): moving bookings and sales made before the portal (or outside
 * it) onto the plan. Any status from any status, bypassing the transition
 * chain of §6.2, the CRM-deal requirement and the timers: a migrated reserve
 * or booking expires only when an end date is given. A reason is mandatory;
 * the history gets a `migration` event (who, when, what, the status date).
 * The unit row is locked and its version checked as for every status change.
 */

/** Statuses after which the client, deal and contract are kept when sales are closed. */
const KEEP_ON_CLOSE = new Set(['deposit', 'contract', 'sold', 'handed']);

/** Masterplan administrators of the project (global or assigned on the whole project). */
export const canMigrate = (ctx, projectId) => canConfigure(ctx, projectId);

const MIGRATION_MESSAGES = {
  INVALID_STATUS: 'Unknown status',
  REASON_REQUIRED: 'Give a reason for the migration',
  ENDS_IN_PAST: 'The end of the reserve / booking must be in the future',
  INVALID_FIELD: 'Invalid value',
};

/** "2026-10-06", "06.10.2026", "6/10/2026" → 'YYYY-MM-DD'; null for empty; NaN-like `false` for garbage. */
export function looseDay(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y;
  let mo;
  let d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) [, d, mo, y] = m;
  else return false;
  const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${out}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== out) return false;
  return out;
}

/**
 * The pure part: what a migration writes. `row` = the locked mp_units row,
 * `input` = { to, reason, date, clientName, managerId, dealId, deal, endsAt,
 * contractNumber, contractDate, contractAmount, paidAmount, actDate } (dates
 * 'YYYY-MM-DD', already parsed), `now` = Date. → { ok: false, code } or
 * { ok: true, set, endsAt, closeBooking, cleared }.
 */
export function migrationPlan({ row, input, now = new Date() }) {
  const to = String(input.to || '');
  if (!STATUSES.includes(to)) return { ok: false, code: 'INVALID_STATUS' };
  const reason = String(input.reason || '').trim();
  if (!reason) return { ok: false, code: 'REASON_REQUIRED' };
  let endsAt = null;
  if (TIMED.has(to) && input.endsAt) {
    // An end date means the end of that day (23:59:59 UTC); a full timestamp is taken as is.
    endsAt = /^\d{4}-\d{2}-\d{2}$/.test(input.endsAt) ? new Date(`${input.endsAt}T23:59:59Z`) : new Date(input.endsAt);
    if (Number.isNaN(endsAt.getTime())) return { ok: false, code: 'INVALID_FIELD' };
    if (endsAt.getTime() <= now.getTime()) return { ok: false, code: 'ENDS_IN_PAST' };
  }
  for (const key of ['contractAmount', 'paidAmount']) {
    const n = input[key];
    if (n !== null && n !== undefined && (Number.isNaN(n) || n < 0)) return { ok: false, code: 'INVALID_FIELD', field: key };
  }
  const date = input.date || dayString(now);
  // Noon UTC keeps the calendar day in any time zone of the portal.
  const set = { status: to, status_changed_at: new Date(`${date}T12:00:00Z`), booking_id: null };
  const clears = to === 'free' || (to === 'not_for_sale' && !KEEP_ON_CLOSE.has(row.status));
  if (clears) {
    Object.assign(set, { manager_id: null, deal_id: null, person_id: null, company_id: null, client_name: null, contract_number: null, contract_date: null, contract_amount: null, paid_amount: null, act_date: null });
  } else if (to !== 'not_for_sale') {
    if (input.managerId) set.manager_id = input.managerId;
    if (input.deal) {
      set.deal_id = input.deal.id;
      set.person_id = input.deal.person_id || null;
      set.company_id = input.deal.company_id || null;
      set.client_name = input.deal.person_name || input.deal.company_name || input.clientName || null;
    } else if (input.clientName) {
      set.client_name = input.clientName;
    }
    const contractual = ['contract', 'sold', 'handed'].includes(to);
    if (contractual || input.contractNumber) {
      if (input.contractNumber) set.contract_number = input.contractNumber;
      // A contract (or a sale) is dated by the status date unless its own date is given.
      set.contract_date = input.contractDate || (row.contract_date ? dayString(row.contract_date) : null) || date;
    }
    if (contractual || (input.contractAmount !== null && input.contractAmount !== undefined)) {
      set.contract_amount = input.contractAmount ?? money(row.contract_amount) ?? money(row.price);
    }
    if (input.paidAmount !== null && input.paidAmount !== undefined) set.paid_amount = input.paidAmount;
    else if (['sold', 'handed'].includes(to)) set.paid_amount = set.contract_amount ?? money(row.contract_amount) ?? money(row.price);
    if (to === 'handed') set.act_date = input.actDate || (row.act_date ? dayString(row.act_date) : null) || date;
  }
  const cleared = clears && (row.contract_number || row.contract_amount !== null || row.client_name)
    ? { client: row.client_name ? { name: row.client_name } : undefined, contract: row.contract_number ? { number: row.contract_number, date: dayString(row.contract_date) } : undefined, amount: money(row.contract_amount), paid: money(row.paid_amount) }
    : undefined;
  return { ok: true, set, endsAt, closeBooking: Boolean(row.booking_id), cleared, date, reason };
}

/** Checks and normalizes the request body (before anything is locked). */
async function migrationInput(ctx, raw = {}) {
  const day = (value, field) => {
    const out = looseDay(value);
    if (out === false) throw httpError(400, `Invalid date: ${field}`, 'INVALID_DATE', { field });
    return out;
  };
  const amount = (value, field) => {
    const n = parseNumber(value);
    if (Number.isNaN(n) || (n !== null && n < 0)) throw httpError(400, `Invalid value: ${field}`, 'INVALID_FIELD', { field });
    return n === null ? null : Math.round(n * 100) / 100;
  };
  const managerId = intOr(raw.managerId) || null;
  if (managerId) {
    const { rows } = await query(`SELECT id FROM users WHERE id = $1`, [managerId]);
    if (!rows[0]) throw httpError(400, 'Unknown manager', 'INVALID_FIELD', { field: 'managerId' });
  }
  const dealId = intOr(raw.dealId) || null;
  return {
    to: String(raw.to || ''),
    reason: text(raw.reason, 300),
    date: day(raw.date, 'date'),
    clientName: text(raw.clientName ?? raw.client?.name, 200) || null,
    managerId,
    dealId,
    // The deal is checked with the person's CRM rights (closed deals too: old sales are migrated).
    deal: dealId ? await dealForLink(ctx, dealId, { allowClosed: true }) : null,
    endsAt: day(raw.endsAt, 'endsAt'),
    contractNumber: text(raw.contractNumber, 60) || null,
    contractDate: day(raw.contractDate, 'contractDate'),
    contractAmount: amount(raw.contractAmount, 'contractAmount'),
    paidAmount: amount(raw.paidAmount, 'paidAmount'),
    actDate: day(raw.actDate, 'actDate'),
  };
}

/**
 * Writes a migration of one locked unit inside the caller's transaction.
 * `row` = the locked mp_units row, `node` = { id, project_id }. Throws 400 on
 * a rule failure. → the updated row.
 */
export async function migrateLocked(client, ctx, node, row, input) {
  const plan = migrationPlan({ row, input });
  if (!plan.ok) throw httpError(400, MIGRATION_MESSAGES[plan.code] || plan.code, plan.code, plan.field ? { field: plan.field } : undefined);
  if (plan.closeBooking) {
    await client.query(`UPDATE mp_bookings SET status = 'released', release_reason = $2, closed_at = NOW(), closed_by = $3 WHERE id = $1 AND status = 'active'`, [row.booking_id, `migration: ${plan.reason}`.slice(0, 300), ctx.userId]);
  }
  const set = { ...plan.set, status_by: ctx.userId };
  let booking = null;
  if (plan.endsAt) {
    const { rows } = await client.query(
      `INSERT INTO mp_bookings (unit_id, project_id, kind, manager_id, deal_id, person_id, company_id, client_name, price, currency, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        node.id,
        node.project_id,
        input.to,
        set.manager_id ?? row.manager_id,
        set.deal_id ?? row.deal_id,
        set.person_id ?? row.person_id,
        set.company_id ?? row.company_id,
        set.client_name ?? row.client_name,
        row.price,
        row.currency,
        set.status_changed_at,
        plan.endsAt,
        ctx.userId,
      ]
    );
    booking = rows[0];
    set.booking_id = booking.id;
  }
  const keys = Object.keys(set);
  const { rows: updated } = await client.query(
    `UPDATE mp_units SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, version = version + 1, updated_by = $${keys.length + 2}, updated_at = NOW() WHERE node_id = $1 RETURNING *`,
    [node.id, ...keys.map((key) => set[key]), ctx.userId]
  );
  const after = updated[0];
  const managerId = after.manager_id;
  await logEvent(client, {
    projectId: node.project_id,
    nodeId: node.id,
    kind: 'migration',
    data: {
      from: row.status,
      to: input.to,
      date: plan.date,
      reason: plan.reason,
      manager: managerId ? { id: managerId, name: await userName(managerId) } : null,
      client: after.client_name ? { name: after.client_name } : null,
      deal: after.deal_id ? { id: after.deal_id } : null,
      endsAt: booking ? iso(booking.ends_at) : null,
      noTimer: TIMED.has(input.to) && !booking ? true : undefined,
      contract: after.contract_number || after.contract_date ? { number: after.contract_number, date: dayString(after.contract_date) } : undefined,
      amount: after.contract_amount !== null ? money(after.contract_amount) : undefined,
      paid: after.paid_amount !== null ? money(after.paid_amount) : undefined,
      actDate: after.act_date ? dayString(after.act_date) : undefined,
      cleared: plan.cleared,
      source: input.source || undefined,
    },
    authorId: ctx.userId,
  });
  return after;
}

async function lockRow(client, nodeId) {
  const { rows } = await client.query(`SELECT * FROM mp_units WHERE node_id = $1 FOR UPDATE`, [nodeId]);
  if (!rows[0]) throw httpError(400, 'This object is not for sale', 'NOT_SELLABLE');
  const { rows: names } = await client.query(
    `SELECT (SELECT COALESCE(display_name, username) FROM users WHERE id = $1) AS manager_name, (SELECT COALESCE(display_name, username) FROM users WHERE id = $2) AS actor_name`,
    [rows[0].manager_id, rows[0].status_by]
  );
  return { ...rows[0], ...names[0] };
}

/** One unit: POST /units/:id/migrate { to, version, reason, date, clientName, managerId, dealId, endsAt, contract… }. */
export async function migrateUnit(ctx, unitId, raw = {}) {
  const node = await requireNode(ctx, unitId);
  if (!canMigrate(ctx, node.project_id)) throw forbidden('Only a Masterplan administrator migrates statuses');
  const input = await migrationInput(ctx, raw);
  await withTransaction(async (client) => {
    const row = await lockRow(client, node.id);
    if (raw.version !== undefined && raw.version !== null && Number(raw.version) !== row.version) throw conflict(row, readCaps(ctx, node.project_id));
    await migrateLocked(client, ctx, node, row, input);
  });
  unitsChanged(node.project_id, [node.id]);
  return getUnit(ctx, node.id);
}

/** Several units with the same data: POST /units/migrate { ids, to, reason, … } → { affected, skipped }. */
export async function migrateUnits(ctx, raw = {}) {
  const ids = idList(raw.ids, 1000);
  if (!ids.length) throw httpError(400, 'Choose units', 'EMPTY');
  const input = await migrationInput(ctx, raw);
  const precheck = migrationPlan({ row: { status: null }, input });
  if (!precheck.ok) throw httpError(400, MIGRATION_MESSAGES[precheck.code] || precheck.code, precheck.code);
  let affected = 0;
  const skipped = [];
  const changed = new Map();
  for (const id of ids) {
    try {
      const node = await requireNode(ctx, id);
      if (!canMigrate(ctx, node.project_id)) throw forbidden();
      await withTransaction(async (client) => {
        const row = await lockRow(client, node.id);
        await migrateLocked(client, ctx, node, row, input);
      });
      affected += 1;
      if (!changed.has(node.project_id)) changed.set(node.project_id, []);
      changed.get(node.project_id).push(node.id);
    } catch (err) {
      skipped.push({ id, reason: err.code || 'ERROR' });
    }
  }
  for (const [projectId, list] of changed) unitsChanged(projectId, list);
  if (skipped.length) {
    const { rows } = await query(`SELECT id, code FROM mp_nodes WHERE id = ANY($1::int[])`, [skipped.map((item) => item.id)]);
    for (const item of skipped) item.code = rows.find((row) => row.id === item.id)?.code || null;
  }
  return { affected, skipped };
}

