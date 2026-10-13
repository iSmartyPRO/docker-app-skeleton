import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { httpError } from '../shared/acl.js';
import { FORWARD_MOVES, HELD, STATUSES, TIMED } from './constants.js';
import { crmScopeAllows, forbidden, modulesEnabled, notFound, requireCrmScope, requireNode, usersWithRole, visibleProjectIds } from './access.js';
import { actCaps, applyPriceChange, checkExtend, checkTransition, conflictMessage, dealLinkAllowed, has, priceCutAllowed, readCaps } from './rules.js';
import { loadNodeRow, visibleNode } from './shapes.js';
import { unitsChanged } from './realtime.js';
import { afterUnitStatus, dealForLink, dealLineAfterExpiry } from './crmLink.js';
import { mpMessage } from './messages.js';
import { dayString, idList, intOr, iso, logEvent, money, parseDay, parseNumber, text, userName } from './util.js';

/*
 * Sales statuses (spec §6): every change is one transaction that locks the
 * unit row (SELECT … FOR UPDATE), checks the version the person saw
 * (optimistic locking) and the transition rules, closes / opens the timer
 * and writes the history. Two managers reserving one unit at the same moment:
 * the second gets 409 VERSION_CONFLICT "Объект только что забронирован
 * менеджером X" with the holder in `info`.
 */

const HOUR = 3600 * 1000;

/**
 * 409 VERSION_CONFLICT with who holds the unit now — only what the person may
 * read in the project: the status with status.view, names with booking.view.
 */
export function conflict(row, readable) {
  const status = has(readable, 'status.view') ? row.status : null;
  const people = has(readable, 'booking.view');
  const holder = { status, manager: people && row.manager_id ? { id: row.manager_id, name: row.manager_name } : null, version: row.version };
  const error = httpError(409, conflictMessage({ status, managerName: people ? row.manager_name : null, actorName: people ? row.actor_name : null }), 'VERSION_CONFLICT');
  error.details = { holder };
  return error;
}

/** Capabilities that let a person change some sales status (checked before anything is locked or revealed). */
const STATUS_ACTIONS = [...new Set([...Object.values(FORWARD_MOVES), 'status.rollback', 'status.not_for_sale', 'booking.release_any', 'booking.release_own'])];
export const mayChangeStatus = (caps) => STATUS_ACTIONS.some((cap) => has(caps, cap));
export const mayExtend = (caps) => has(caps, 'booking.extend_any') || has(caps, 'booking.extend_once');

/** Advisory lock namespace of "reserves of one manager" (the reserve limit, §6.2). */
const RESERVE_LOCK = 0x4d50; // 'MP'

/** Statuses after which closing sales keeps the client, deal and contract (a deal in progress or done). */
const KEEP_ON_CLOSE = new Set(['deposit', 'contract', 'sold', 'handed']);

const RULE_MESSAGES = {
  FORBIDDEN: 'You may not move this unit to that status',
  NOT_OWN: 'This is another manager’s reserve',
  REASON_REQUIRED: 'Give a reason',
  DEAL_REQUIRED: 'Choose the CRM deal of the client',
  CLIENT_REQUIRED: 'The deal needs a client (a company or a person)',
  CONTRACT_REQUIRED: 'Contract number and date are required',
  ACT_DATE_REQUIRED: 'The date of the handover act is required',
  RESERVE_LIMIT: 'You hold the maximum number of reserves',
  SAME_STATUS: 'The unit already has this status',
  INVALID_TRANSITION: 'This status change is not allowed',
  INVALID_STATUS: 'Unknown status',
  EXTEND_LIMIT: 'Only the head of sales may extend it again',
  NOT_HELD: 'Nothing to extend',
};

const ruleError = (res) => httpError(res.status, RULE_MESSAGES[res.code] || res.code, res.code);

async function lockUnit(client, nodeId) {
  // Lock first, then read the names: a join inside the locking query would
  // keep the names of the row version it saw before waiting for the lock.
  const { rows } = await client.query(`SELECT * FROM mp_units WHERE node_id = $1 FOR UPDATE`, [nodeId]);
  if (!rows[0]) throw httpError(400, 'This object is not for sale', 'NOT_SELLABLE');
  const row = rows[0];
  const { rows: names } = await client.query(
    `SELECT (SELECT COALESCE(display_name, username) FROM users WHERE id = $1) AS manager_name, (SELECT COALESCE(display_name, username) FROM users WHERE id = $2) AS actor_name`,
    [row.manager_id, row.status_by]
  );
  return { ...row, ...names[0] };
}

/** Length of a new / extended timer. */
export function timerMs(kind, settings) {
  return kind === 'reserve' ? settings.reserveHours * HOUR : settings.bookingDays * 24 * HOUR;
}

/**
 * Moves a unit to another sales status.
 * input: { to, version, reason, dealId, client: { name }, managerId, contractNumber, contractDate, contractAmount, paidAmount, actDate, paid, amount }
 */
export async function changeStatus(ctx, unitId, input = {}) {
  const { node, result } = await applyStatus(ctx, unitId, input);
  afterStatusChange(ctx, node, result).catch((err) => console.warn('[masterplan] after status change:', err.message));
  return getUnit(ctx, node.id);
}

/** The status change itself (without notifications): → { node, result }. */
async function applyStatus(ctx, unitId, input = {}) {
  const node = await requireNode(ctx, unitId);
  const caps = actCaps(ctx, node);
  // Nothing is locked or revealed (holder, versions) to someone who may not change statuses here.
  if (!mayChangeStatus(caps)) throw forbidden('You may not change the status of this unit');
  const to = String(input.to || '');
  const enabled = await modulesEnabled();
  const dealId = intOr(input.dealId);
  // The deal is checked with the person's CRM rights before anything is locked.
  const deal = dealId ? await dealForLink(ctx, dealId) : null;
  const contractDate = parseDay(input.contractDate, 'contractDate');
  const actDate = parseDay(input.actDate, 'actDate');
  const contractAmount = parseNumber(input.contractAmount);
  if (Number.isNaN(contractAmount) || (contractAmount !== null && contractAmount < 0)) throw httpError(400, 'Invalid contract amount', 'INVALID_FIELD');
  const managerId = intOr(input.managerId);
  if (managerId && managerId !== ctx.userId && !has(caps, 'booking.release_any')) throw httpError(403, 'Only the head of sales assigns managers', 'FORBIDDEN');

  const result = await withTransaction(async (client) => {
    // The reserve limit is per manager: their reserves are counted one change at a time.
    if (to === 'reserve' && Number(ctx.settings.reserveLimit) > 0) await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [RESERVE_LOCK, managerId || ctx.userId]);
    const row = await lockUnit(client, node.id);
    if (input.version !== undefined && input.version !== null && Number(input.version) !== row.version) throw conflict(row, readCaps(ctx, node.project_id));
    // A linked deal gets a line in its timeline (and maybe its amount): an API token needs the CRM scope for that.
    if (row.deal_id && enabled.crm) requireCrmScope(ctx, 'write');
    const { rows: activeRows } = await client.query(`SELECT * FROM mp_bookings WHERE id = $1 AND status = 'active'`, [row.booking_id || 0]);
    const booking = activeRows[0] || null;
    let activeReserves = 0;
    if (to === 'reserve') {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM mp_units WHERE status = 'reserve' AND manager_id = $1`, [managerId || ctx.userId]);
      activeReserves = rows[0].n;
    }
    const clientName = text(input.client?.name, 200);
    const dealHasClient = deal ? Boolean(deal.person_id || deal.company_id) : Boolean(row.person_id || row.company_id || (row.client_name && !dealId) || clientName);
    const unit = { status: row.status, managerId: row.manager_id, dealId: row.deal_id };
    const check = checkTransition({
      unit,
      to,
      caps,
      userId: ctx.userId,
      input: { reason: input.reason, dealId, client: { name: clientName }, contractNumber: input.contractNumber, contractDate, actDate },
      opts: { crmEnabled: enabled.crm, requireDeal: ctx.settings.requireDeal, dealHasClient, activeReserves, reserveLimit: ctx.settings.reserveLimit },
    });
    if (!check.ok) throw ruleError(check);
    if (dealId && !dealLinkAllowed(unit, dealId)) throw httpError(409, 'The unit is held for another deal', 'DEAL_LOCKED');

    const now = new Date();
    const reason = text(input.reason, 300) || null;
    const set = { status: to, status_by: ctx.userId };
    // The running timer ends: converted when the client moves on, released otherwise.
    if (booking && TIMED.has(row.status)) {
      const outcome = ['booking', 'deposit'].includes(to) ? 'converted' : 'released';
      await client.query(`UPDATE mp_bookings SET status = $2, release_reason = $3, closed_at = NOW(), closed_by = $4 WHERE id = $1`, [booking.id, outcome, outcome === 'released' ? reason : null, ctx.userId]);
      set.booking_id = null;
    }
    if (dealId) set.deal_id = dealId;
    if (deal) {
      set.person_id = deal.person_id || null;
      set.company_id = deal.company_id || null;
      set.client_name = deal.person_name || deal.company_name || null;
    } else if (clientName) {
      set.client_name = clientName;
    }
    let newBooking = null;
    if (TIMED.has(to)) {
      const manager = to === 'reserve' ? managerId || ctx.userId : row.manager_id || managerId || ctx.userId;
      set.manager_id = manager;
      const paid = to === 'booking' && input.paid === true;
      const amount = parseNumber(input.amount);
      const { rows } = await client.query(
        `INSERT INTO mp_bookings (unit_id, project_id, kind, manager_id, deal_id, person_id, company_id, client_name, paid, amount, price, currency, ends_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          node.id,
          node.project_id,
          to,
          manager,
          set.deal_id ?? row.deal_id,
          set.person_id ?? row.person_id,
          set.company_id ?? row.company_id,
          set.client_name ?? row.client_name,
          paid,
          Number.isFinite(amount) ? amount : null,
          row.price,
          row.currency,
          new Date(now.getTime() + timerMs(to, ctx.settings)),
          ctx.userId,
        ]
      );
      newBooking = rows[0];
      set.booking_id = newBooking.id;
    }
    if (to === 'contract') {
      set.contract_number = text(input.contractNumber, 60);
      set.contract_date = contractDate;
      set.contract_amount = contractAmount ?? row.contract_amount ?? row.price;
    }
    if (to === 'sold') {
      // "Оплачено 100%": the finance person confirms full payment.
      set.paid_amount = row.contract_amount ?? row.price;
    }
    if (input.paidAmount !== undefined && ['deposit', 'contract'].includes(to)) {
      const paid = parseNumber(input.paidAmount);
      if (Number.isNaN(paid) || (paid !== null && paid < 0)) throw httpError(400, 'Invalid paid amount', 'INVALID_FIELD');
      set.paid_amount = paid;
    }
    if (to === 'handed') set.act_date = actDate;
    // Back to free sale: the unit forgets its client, deal and contract. Closing
    // sales of a unit already paid for or sold keeps them (they are the record of the deal).
    const clears = to === 'free' || (to === 'not_for_sale' && !KEEP_ON_CLOSE.has(row.status));
    if (clears) {
      Object.assign(set, { manager_id: null, deal_id: null, person_id: null, company_id: null, client_name: null, booking_id: null, contract_number: null, contract_date: null, contract_amount: null, paid_amount: null, act_date: null });
    }
    const keys = Object.keys(set);
    const { rows: updated } = await client.query(
      `UPDATE mp_units SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, version = version + 1, status_changed_at = NOW(), updated_by = $${keys.length + 2}, updated_at = NOW()
       WHERE node_id = $1 RETURNING *`,
      [node.id, ...keys.map((key) => set[key]), ctx.userId]
    );
    const after = updated[0];
    const managerName = after.manager_id ? await userName(after.manager_id) : row.manager_name;
    await logEvent(client, {
      projectId: node.project_id,
      nodeId: node.id,
      kind: 'status',
      data: {
        from: row.status,
        to,
        transition: check.kind,
        reason,
        manager: after.manager_id || row.manager_id ? { id: after.manager_id || row.manager_id, name: managerName } : null,
        deal: after.deal_id || row.deal_id ? { id: after.deal_id || row.deal_id } : null,
        client: after.client_name || row.client_name ? { name: after.client_name || row.client_name } : null,
        endsAt: newBooking ? iso(newBooking.ends_at) : undefined,
        contract: to === 'contract' ? { number: set.contract_number, date: contractDate } : undefined,
        amount: to === 'contract' ? money(set.contract_amount) : undefined,
        actDate: to === 'handed' ? actDate : undefined,
        // What a return to sale erased stays in the history (shown with the amounts rights).
        cleared: clears && (row.contract_number || row.contract_amount !== null || row.paid_amount !== null)
          ? { contract: { number: row.contract_number, date: dayString(row.contract_date) }, amount: money(row.contract_amount), paid: money(row.paid_amount), actDate: dayString(row.act_date) }
          : undefined,
      },
      authorId: ctx.userId,
    });
    return { before: row, after, booking: newBooking, kind: check.kind, reason };
  });

  unitsChanged(node.project_id, [node.id]);
  return { node, result };
}

export async function getUnit(ctx, id) {
  const row = await loadNodeRow(id);
  if (!row) throw notFound('Object not found');
  return visibleNode(ctx, row);
}

/** Status changes the heads of sales hear about. */
const notifiable = ({ after, kind }) => ['booking', 'deposit', 'contract', 'sold', 'handed'].includes(after.status) || ['rollback', 'close'].includes(kind);

/** Notifications and the CRM deal after a status change (never fails the change); `quiet` skips the notification (bulk actions send one summary). */
async function afterStatusChange(ctx, node, { before, after, booking, kind, reason }, { quiet = false } = {}) {
  const project = (await query(`SELECT name FROM mp_projects WHERE id = $1`, [node.project_id])).rows[0]?.name || '';
  const code = node.code || node.name;
  if (!quiet && notifiable({ after, kind })) {
    const heads = await usersWithRole(['sales_head', 'executive'], node);
    const actor = await userName(ctx.userId);
    await notify({
      userIds: [...heads, ...(kind === 'rollback' && before.manager_id ? [before.manager_id] : [])],
      kind: 'masterplan.status',
      module: 'masterplan',
      link: unitLink(node),
      actorId: ctx.userId,
      render: mpMessage('status', { code, project, to: after.status, actor, reason }),
    });
  }
  await afterUnitStatus(ctx, node, { before, after, booking, reason });
}

export const unitLink = (node) => `/app/masterplan/p/${node.project_id}/plan?node=${node.id}`;

/** Extends the running reserve / booking by one more period (§6.2). */
export async function extendBooking(ctx, unitId, input = {}) {
  const node = await requireNode(ctx, unitId);
  const caps = actCaps(ctx, node);
  if (!mayExtend(caps)) throw forbidden('You may not extend reserves or bookings');
  const out = await withTransaction(async (client) => {
    const row = await lockUnit(client, node.id);
    if (input.version !== undefined && input.version !== null && Number(input.version) !== row.version) throw conflict(row, readCaps(ctx, node.project_id));
    const { rows } = await client.query(`SELECT * FROM mp_bookings WHERE id = $1 AND status = 'active' FOR UPDATE`, [row.booking_id || 0]);
    const booking = rows[0] || null;
    const check = checkExtend({ unit: { status: row.status, managerId: row.manager_id }, booking, caps, userId: ctx.userId, managerExtensions: ctx.settings.managerExtensions });
    if (!check.ok) throw ruleError(check);
    const base = Math.max(Date.now(), new Date(booking.ends_at).getTime());
    const endsAt = new Date(base + timerMs(booking.kind, ctx.settings));
    await client.query(`UPDATE mp_bookings SET ends_at = $2, extensions = extensions + 1, extended_by = $3, warned_hours = NULL WHERE id = $1`, [booking.id, endsAt, ctx.userId]);
    await client.query(`UPDATE mp_units SET version = version + 1, updated_by = $2, updated_at = NOW() WHERE node_id = $1`, [node.id, ctx.userId]);
    await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'extend', data: { kind: booking.kind, endsAt: endsAt.toISOString(), extensions: booking.extensions + 1, manager: { id: row.manager_id, name: row.manager_name }, reason: text(input.reason, 300) || null }, authorId: ctx.userId });
    return { endsAt };
  });
  unitsChanged(node.project_id, [node.id]);
  return { unit: await getUnit(ctx, node.id), endsAt: out.endsAt.toISOString() };
}

// ── Bookings list (§9.7) ─────────────────────────────────────────────────────

export async function listBookings(ctx, input = {}) {
  const ids = visibleProjectIds(ctx);
  const projectId = intOr(input.project);
  const params = [];
  const where = [`b.status = 'active'`];
  if (ids) {
    params.push(ids);
    where.push(`b.project_id = ANY($${params.length}::int[])`);
  }
  if (projectId) {
    params.push(projectId);
    where.push(`b.project_id = $${params.length}`);
  }
  if (input.scope === 'mine') {
    params.push(ctx.userId);
    where.push(`b.manager_id = $${params.length}`);
  }
  if (['reserve', 'booking'].includes(input.kind)) {
    params.push(input.kind);
    where.push(`b.kind = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT b.*, n.code, n.name, n.path, n.project_id AS node_project, p.name AS project_name,
            COALESCE(m.display_name, m.username) AS manager_name, u.status AS unit_status, u.version, u.price AS unit_price, u.currency AS unit_currency,
            d.title AS deal_title
     FROM mp_bookings b
     JOIN mp_nodes n ON n.id = b.unit_id
     JOIN mp_projects p ON p.id = b.project_id
     JOIN mp_units u ON u.node_id = b.unit_id
     LEFT JOIN users m ON m.id = b.manager_id
     LEFT JOIN crm_deals d ON d.id = b.deal_id
     WHERE ${where.join(' AND ')} ORDER BY b.ends_at LIMIT 1000`,
    params
  );
  const out = [];
  for (const row of rows) {
    const caps = readCaps(ctx, row.project_id);
    if (!has(caps, 'booking.view') && row.manager_id !== ctx.userId) continue;
    const own = row.manager_id === ctx.userId;
    const act = actCaps(ctx, { project_id: row.project_id, path: row.path });
    const item = {
      id: row.id,
      kind: row.kind,
      unit: { id: row.unit_id, code: row.code, name: row.name, projectId: row.project_id, projectName: row.project_name, status: row.unit_status, version: row.version },
      manager: row.manager_id ? { id: row.manager_id, name: row.manager_name } : null,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      extensions: row.extensions,
      paid: row.paid,
      canExtend: checkExtend({ unit: { status: row.unit_status, managerId: row.manager_id }, booking: row, caps: act, userId: ctx.userId, managerExtensions: ctx.settings.managerExtensions }).ok === true,
      canRelease: has(act, 'booking.release_any') || (has(act, 'booking.release_own') && own),
      canDeposit: row.kind === 'booking' && has(act, 'status.deposit'),
      canBook: row.kind === 'reserve' && has(act, 'status.booking') && (own || has(act, 'booking.release_any')),
    };
    if (has(caps, 'price.view')) item.price = { amount: money(row.price ?? row.unit_price), currency: (row.currency || row.unit_currency || '').trim() };
    if (has(caps, 'clients.all') || (has(caps, 'clients.own') && own)) {
      item.client = row.client_name ? { name: row.client_name, personId: row.person_id, companyId: row.company_id } : null;
      item.deal = row.deal_id ? (crmScopeAllows(ctx, 'read') ? { id: row.deal_id, title: row.deal_title } : { id: row.deal_id }) : null;
    }
    out.push(item);
  }
  return out;
}

// ── Timers: warnings and automatic release (scheduler job, every minute) ─────

/** Which warning is due: the smallest threshold (hours) at or above the time left, if not sent yet. */
export function warningDue(endsAt, now, thresholds, warnedHours, totalMs) {
  const left = (new Date(endsAt).getTime() - now.getTime()) / HOUR;
  if (left <= 0) return null;
  const due = [...thresholds].sort((a, b) => a - b).find((hours) => left <= hours);
  if (!due) return null;
  // A 12-hour reserve does not get a "24 hours left" warning.
  if (totalMs && due * HOUR >= totalMs) return null;
  if (warnedHours !== null && warnedHours !== undefined && warnedHours <= due) return null;
  return due;
}

export async function runBookingTimers(now = new Date()) {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.masterplan;
  if (!module?.enabled) return { warned: 0, expired: 0 };
  const settings = module.settings;
  let warned = 0;
  let expired = 0;

  // Warnings (24 h and 2 h before by default).
  const { rows: running } = await query(
    `SELECT b.*, n.code, n.name, n.path, p.name AS project_name FROM mp_bookings b JOIN mp_nodes n ON n.id = b.unit_id JOIN mp_projects p ON p.id = b.project_id
     WHERE b.status = 'active' AND b.ends_at > $1 AND b.ends_at <= $1 + make_interval(hours => $2)`,
    [now, Math.max(...(settings.warnHours?.length ? settings.warnHours : [24]))]
  );
  for (const row of running) {
    const due = warningDue(row.ends_at, now, settings.warnHours || [24, 2], row.warned_hours, new Date(row.ends_at) - new Date(row.starts_at));
    if (!due) continue;
    const { rowCount } = await query(`UPDATE mp_bookings SET warned_hours = $2 WHERE id = $1 AND status = 'active' AND (warned_hours IS NULL OR warned_hours > $2)`, [row.id, due]);
    if (!rowCount || !row.manager_id) continue;
    warned += 1;
    await notify({
      userIds: [row.manager_id],
      kind: 'masterplan.expiring',
      module: 'masterplan',
      link: unitLink({ project_id: row.project_id, id: row.unit_id }),
      render: mpMessage('expiring', { code: row.code || row.name, project: row.project_name, endsAt: row.ends_at, kind: row.kind }),
    }).catch(() => {});
  }

  // Automatic release.
  const { rows: due } = await query(`SELECT id FROM mp_bookings WHERE status = 'active' AND ends_at <= $1 ORDER BY ends_at LIMIT 200`, [now]);
  const cache = {};
  for (const { id } of due) {
    try {
      const done = await expireBooking(id, now, cache);
      if (done) expired += 1;
    } catch (err) {
      console.warn(`[masterplan] expiring booking ${id} failed:`, err.message);
    }
  }
  return { warned, expired };
}

/**
 * Releases one expired timer; the unit becomes free only if this timer still
 * holds it. Locks the unit first, then the timer — the order of every status
 * change and extension — and re-checks the end under the lock: a timer
 * extended a moment ago is not released.
 */
export async function expireBooking(bookingId, now = new Date(), cache = null) {
  const res = await withTransaction(async (client) => {
    const { rows: found } = await client.query(`SELECT unit_id FROM mp_bookings WHERE id = $1 AND status = 'active'`, [bookingId]);
    if (!found[0]) return null;
    const { rows: units } = await client.query(`SELECT u.*, n.code, n.name, n.path, n.project_id AS pid FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.node_id = $1 FOR UPDATE OF u`, [found[0].unit_id]);
    const unit = units[0];
    const { rows } = await client.query(`SELECT * FROM mp_bookings WHERE id = $1 AND status = 'active' AND ends_at <= $2 FOR UPDATE`, [bookingId, now]);
    const booking = rows[0];
    if (!booking) return null;
    await client.query(`UPDATE mp_bookings SET status = 'expired', closed_at = NOW(), release_reason = 'expired' WHERE id = $1`, [booking.id]);
    if (!unit || unit.booking_id !== booking.id || !TIMED.has(unit.status)) return { booking, unit: null };
    await client.query(
      `UPDATE mp_units SET status = 'free', manager_id = NULL, deal_id = NULL, person_id = NULL, company_id = NULL, client_name = NULL, booking_id = NULL,
              version = version + 1, status_changed_at = NOW(), status_by = NULL, updated_at = NOW()
       WHERE node_id = $1`,
      [unit.node_id]
    );
    await logEvent(client, {
      projectId: booking.project_id,
      nodeId: unit.node_id,
      kind: 'expired',
      data: { from: unit.status, to: 'free', manager: booking.manager_id ? { id: booking.manager_id, name: await userName(booking.manager_id) } : null, deal: unit.deal_id ? { id: unit.deal_id } : null },
    });
    return { booking, unit };
  });
  if (!res?.unit) return Boolean(res);
  const { booking, unit } = res;
  unitsChanged(booking.project_id, [unit.node_id]);
  const node = { id: unit.node_id, project_id: booking.project_id, path: unit.path, code: unit.code, name: unit.name };
  const project = (await query(`SELECT name FROM mp_projects WHERE id = $1`, [booking.project_id])).rows[0]?.name || '';
  const heads = await usersWithRole(['sales_head'], node, cache);
  const manager = booking.manager_id ? await userName(booking.manager_id) : '';
  await notify({
    userIds: [...new Set([booking.manager_id, ...heads].filter(Boolean))],
    kind: 'masterplan.expired',
    module: 'masterplan',
    link: unitLink(node),
    render: mpMessage('expired', { code: unit.code || unit.name, project, manager, kind: booking.kind }),
  }).catch(() => {});
  if (unit.deal_id) await dealLineAfterExpiry(unit.deal_id, node, booking).catch(() => {});
  return true;
}

// ── Bulk actions (§9.3) ─────────────────────────────────────────────────────

/** Bulk price change: { ids, mode: set|percent|amount, value, reason } → { affected, skipped: [{ id, code, reason }] }. */
export async function bulkPrice(ctx, input = {}) {
  const ids = idList(input.ids, 2000);
  if (!ids.length) throw httpError(400, 'Choose units', 'EMPTY');
  if (!['set', 'percent', 'amount'].includes(input.mode)) throw httpError(400, 'Unknown mode', 'INVALID_FIELD');
  const value = parseNumber(input.value);
  if (value === null || Number.isNaN(value)) throw httpError(400, 'Invalid value', 'INVALID_FIELD');
  const reason = text(input.reason, 300) || null;
  const skipped = [];
  const changed = new Map();
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT u.*, n.code, n.name, n.path, n.project_id AS pid FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.node_id = ANY($1::int[]) ORDER BY u.node_id FOR UPDATE OF u`,
      [ids]
    );
    for (const row of rows) {
      const node = { project_id: row.pid, path: row.path };
      const caps = actCaps(ctx, node);
      if (!readCaps(ctx, row.pid).size || !has(caps, 'price.edit')) {
        skipped.push({ id: row.node_id, code: row.code, reason: 'FORBIDDEN' });
        continue;
      }
      if (ctx.settings.fixPriceOnBooking && HELD.has(row.status)) {
        skipped.push({ id: row.node_id, code: row.code, reason: 'PRICE_FIXED' });
        continue;
      }
      const next = applyPriceChange(row.price, input.mode, value);
      if (next === null) {
        skipped.push({ id: row.node_id, code: row.code, reason: 'INVALID_PRICE' });
        continue;
      }
      if (!priceCutAllowed(Number(row.price) || 0, next, caps, ctx.settings.salesHeadMaxCutPct)) {
        skipped.push({ id: row.node_id, code: row.code, reason: 'PRICE_LIMIT' });
        continue;
      }
      if (next === Number(row.price)) continue;
      await client.query(`UPDATE mp_units SET price = $2, version = version + 1, updated_by = $3, updated_at = NOW() WHERE node_id = $1`, [row.node_id, next, ctx.userId]);
      await client.query(`INSERT INTO mp_price_history (unit_id, old_price, new_price, currency, reason, author_id) VALUES ($1, $2, $3, $4, $5, $6)`, [row.node_id, row.price, next, row.currency, reason, ctx.userId]);
      await logEvent(client, { projectId: row.pid, nodeId: row.node_id, kind: 'price', data: { from: money(row.price), to: next, currency: (row.currency || '').trim(), reason, bulk: { mode: input.mode, value } }, authorId: ctx.userId });
      if (!changed.has(row.pid)) changed.set(row.pid, []);
      changed.get(row.pid).push(row.node_id);
    }
    for (const id of ids) if (!rows.some((row) => row.node_id === id)) skipped.push({ id, code: null, reason: 'NOT_SELLABLE' });
  });
  for (const [projectId, list] of changed) unitsChanged(projectId, list);
  return { affected: [...changed.values()].reduce((sum, list) => sum + list.length, 0), skipped };
}

/**
 * Bulk status for management: close from sale / open for sale (§9.2) — each
 * unit through the same status change; the heads of sales get one summary
 * per project instead of a notification per unit.
 */
export async function bulkStatus(ctx, input = {}) {
  const ids = idList(input.ids, 1000);
  if (!['not_for_sale', 'free'].includes(input.to)) throw httpError(400, 'Only closing or opening sales in bulk', 'INVALID_FIELD');
  let affected = 0;
  const skipped = [];
  const done = [];
  for (const id of ids) {
    try {
      const { node, result } = await applyStatus(ctx, id, { to: input.to, reason: input.reason });
      affected += 1;
      done.push({ node, result });
      afterStatusChange(ctx, node, result, { quiet: true }).catch((err) => console.warn('[masterplan] after status change:', err.message));
    } catch (err) {
      skipped.push({ id, reason: err.code || 'ERROR' });
    }
  }
  if (skipped.length) {
    const { rows } = await query(`SELECT id, code FROM mp_nodes WHERE id = ANY($1::int[])`, [skipped.map((item) => item.id)]);
    for (const item of skipped) item.code = rows.find((row) => row.id === item.id)?.code || null;
  }
  notifyBulkStatus(ctx, done, input).catch((err) => console.warn('[masterplan] bulk status notification:', err.message));
  return { affected, skipped };
}

async function notifyBulkStatus(ctx, done, input) {
  const byProject = new Map();
  for (const item of done.filter(({ result }) => notifiable(result))) {
    if (!byProject.has(item.node.project_id)) byProject.set(item.node.project_id, []);
    byProject.get(item.node.project_id).push(item);
  }
  if (!byProject.size) return;
  const cache = {};
  const actor = await userName(ctx.userId);
  const reason = text(input.reason, 300) || null;
  for (const [projectId, items] of byProject) {
    const recipients = new Set();
    for (const { node, result } of items) {
      for (const id of await usersWithRole(['sales_head', 'executive'], node, cache)) recipients.add(id);
      if (result.kind === 'rollback' && result.before.manager_id) recipients.add(result.before.manager_id);
    }
    const project = (await query(`SELECT name FROM mp_projects WHERE id = $1`, [projectId])).rows[0]?.name || '';
    const codes = items.map(({ node }) => node.code || node.name).filter(Boolean);
    const sample = codes.length > 5 ? `${codes.slice(0, 5).join(', ')} +${codes.length - 5}` : codes.join(', ');
    await notify({
      userIds: [...recipients],
      kind: 'masterplan.status',
      module: 'masterplan',
      link: `/app/masterplan/p/${projectId}/registry`,
      actorId: ctx.userId,
      render: mpMessage('bulkStatus', { count: items.length, sample, project, to: input.to, actor, reason }),
    });
  }
}

/** Assigns the responsible manager of held units (heads of sales). */
export async function assignManager(ctx, unitId, input = {}) {
  const node = await requireNode(ctx, unitId);
  if (!has(actCaps(ctx, node), 'booking.release_any')) throw httpError(403, 'Only the head of sales reassigns managers', 'FORBIDDEN');
  const managerId = intOr(input.managerId);
  if (!managerId) throw httpError(400, 'Choose a manager', 'INVALID_FIELD');
  await withTransaction(async (client) => {
    const row = await lockUnit(client, node.id);
    if (input.version !== undefined && Number(input.version) !== row.version) throw conflict(row, readCaps(ctx, node.project_id));
    if (!HELD.has(row.status)) throw httpError(409, 'The unit is not held', 'NOT_HELD');
    await client.query(`UPDATE mp_units SET manager_id = $2, version = version + 1, updated_by = $3, updated_at = NOW() WHERE node_id = $1`, [node.id, managerId, ctx.userId]);
    if (row.booking_id) await client.query(`UPDATE mp_bookings SET manager_id = $2 WHERE id = $1`, [row.booking_id, managerId]);
    await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'manager', data: { from: row.manager_id ? { id: row.manager_id, name: row.manager_name } : null, to: { id: managerId, name: await userName(managerId) } }, authorId: ctx.userId });
  });
  unitsChanged(node.project_id, [node.id]);
  return getUnit(ctx, node.id);
}

export { STATUSES };
