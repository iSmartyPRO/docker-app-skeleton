import { FORWARD_MOVES, HELD, ROLES, ROLE_CAPS, STATUSES, STATUS_RANK, TIMED } from './constants.js';

/*
 * Pure rules of the Masterplan module: roles → capabilities with zones of
 * responsibility, sales status transitions (spec §6.2) and which fields of a
 * unit a person may see (§8.1.3). No database; everything here is unit-tested.
 */

// ── Roles, zones, capabilities ───────────────────────────────────────────────

/** Roles granted everywhere by portal permissions. `*` (super administrator) means admin only. */
export function globalRoles(permissions = []) {
  const set = new Set(permissions);
  if (set.has('*')) return new Set(['admin']);
  return new Set(ROLES.filter((role) => set.has(`masterplan.${role}`)));
}

/** Every role a person has somewhere in a project (any zone). */
export function rolesIn(ctx, projectId) {
  const out = new Set(ctx.globalRoles);
  for (const item of ctx.assignments || []) if (item.projectId === Number(projectId)) out.add(item.role);
  return out;
}

/**
 * Roles whose zone contains the node: global ones, project-wide assignments
 * and assignments on the node itself or one of its ancestors. `node.path`
 * lists the ancestors' ids and the node's own id.
 */
export function rolesAt(ctx, node) {
  const out = new Set(ctx.globalRoles);
  if (!node) return out;
  const path = new Set((node.path || []).map(Number));
  for (const item of ctx.assignments || []) {
    if (item.projectId !== Number(node.project_id ?? node.projectId)) continue;
    if (!item.nodeId || path.has(item.nodeId)) out.add(item.role);
  }
  return out;
}

export function capsOf(roles) {
  const out = new Set();
  for (const role of roles) for (const cap of ROLE_CAPS[role] || []) out.add(cap);
  return out;
}

export const has = (caps, cap) => caps.has('*') || caps.has(cap);

/** What a person may read in a project (every role they have there). */
export const readCaps = (ctx, projectId) => capsOf(rolesIn(ctx, projectId));
/** What a person may do on a node (roles whose zone contains it). */
export const actCaps = (ctx, node) => capsOf(rolesAt(ctx, node));

export const seesProject = (ctx, projectId) => rolesIn(ctx, projectId).size > 0;

// ── Field visibility ────────────────────────────────────────────────────────

/**
 * Removes what the viewer may not see from a unit's API shape (server-side
 * field hiding). `presentation` is the client-facing mode: no clients,
 * managers, minimum prices, amounts or timers, whatever the role.
 */
export function projectUnit(unit, { caps, userId, presentation = false }) {
  if (!unit) return unit;
  const own = Boolean(unit.manager?.id) && unit.manager.id === userId;
  const out = { ...unit };
  const hide = (...keys) => keys.forEach((key) => delete out[key]);
  if (!has(caps, 'status.view')) hide('status', 'statusChangedAt');
  if (!has(caps, 'price.view')) hide('price', 'pricePerM2', 'discountPct', 'currency', 'paymentForms');
  if (!has(caps, 'minprice.view') || presentation) hide('minPrice');
  if (!has(caps, 'booking.view') || presentation) hide('manager', 'booking');
  const clients = has(caps, 'clients.all') || (has(caps, 'clients.own') && own);
  if (!clients || presentation) hide('deal', 'client');
  const amounts = has(caps, 'amounts.all') || (has(caps, 'amounts.own') && own);
  if (!amounts || presentation) hide('contract', 'paidAmount', 'remaining');
  if (presentation) hide('noPublish', 'version');
  return out;
}

// ── Status transitions (§6.2) ───────────────────────────────────────────────

const fail = (code, status = 400) => ({ ok: false, code, status });

/**
 * Checks a status change. `unit` = { status, managerId, dealId }, `booking`
 * the active timer row (or null). Returns { ok: true, kind } or
 * { ok: false, code, status }. Kinds: forward, release, close, open, rollback.
 *
 *   input: { reason, dealId, client: { personId, companyId, name }, contractNumber,
 *            contractDate, actDate, contractAmount }
 *   opts:  { crmEnabled, requireDeal, dealHasClient, activeReserves, reserveLimit }
 */
export function checkTransition({ unit, to, caps, userId, input = {}, opts = {} }) {
  const from = unit.status;
  if (!STATUSES.includes(to)) return fail('INVALID_STATUS');
  if (from === to) return fail('SAME_STATUS', 409);
  const own = unit.managerId === userId;
  const reason = String(input.reason || '').trim();

  // Closing sales: from anywhere, management only (§6.2 "Любой → Не в продаже").
  if (to === 'not_for_sale') {
    if (!has(caps, 'status.not_for_sale')) return fail('FORBIDDEN', 403);
    if (HELD.has(from) && !reason) return fail('REASON_REQUIRED');
    return { ok: true, kind: 'close' };
  }

  // Releasing a reserve or a booking: its manager (with a reason) or the head of sales.
  if (to === 'free' && TIMED.has(from)) {
    if (!(has(caps, 'booking.release_any') || (has(caps, 'booking.release_own') && own))) return fail(own ? 'FORBIDDEN' : 'NOT_OWN', 403);
    if (!reason) return fail('REASON_REQUIRED');
    return { ok: true, kind: 'release' };
  }

  const key = `${from}>${to}`;
  if (FORWARD_MOVES[key]) {
    if (!has(caps, FORWARD_MOVES[key])) return fail('FORBIDDEN', 403);
    if (key === 'not_for_sale>free') return { ok: true, kind: 'open' };
    if (key === 'free>reserve') {
      const limit = Number(opts.reserveLimit) || 0;
      // The limit is per manager; heads of sales and administrators are not limited.
      if (limit > 0 && !has(caps, 'booking.extend_any') && (opts.activeReserves || 0) >= limit) return fail('RESERVE_LIMIT', 409);
    }
    if (key === 'reserve>booking') {
      if (!own && !has(caps, 'booking.release_any')) return fail('NOT_OWN', 403);
      if (opts.crmEnabled && opts.requireDeal) {
        if (!input.dealId && !unit.dealId) return fail('DEAL_REQUIRED');
        if (!opts.dealHasClient) return fail('CLIENT_REQUIRED');
      } else if (!opts.dealHasClient && !String(input.client?.name || '').trim()) {
        return fail('CLIENT_REQUIRED');
      }
    }
    if (key === 'deposit>contract' && (!String(input.contractNumber || '').trim() || !input.contractDate)) return fail('CONTRACT_REQUIRED');
    if (key === 'sold>handed' && !input.actDate) return fail('ACT_DATE_REQUIRED');
    return { ok: true, kind: 'forward' };
  }

  // Anything else that goes back in the process is a rollback (e.g. a terminated contract).
  if (STATUS_RANK[to] < STATUS_RANK[from] && from !== 'not_for_sale') {
    if (!has(caps, 'status.rollback')) return fail('FORBIDDEN', 403);
    if (!reason) return fail('REASON_REQUIRED');
    return { ok: true, kind: 'rollback' };
  }
  return fail('INVALID_TRANSITION');
}

/** Statuses a person could move a unit to (for buttons); data requirements are checked on submit. */
export function nextStatuses({ unit, caps, userId }) {
  return STATUSES.filter((to) => {
    const res = checkTransition({ unit, to, caps, userId, input: { reason: 'x', dealId: 1, contractNumber: 'x', contractDate: '2000-01-01', actDate: '2000-01-01', client: { name: 'x' } }, opts: { dealHasClient: true } });
    return res.ok;
  });
}

/** May the person extend this timer (§6.2: the manager once, then only the head of sales)? */
export function checkExtend({ unit, booking, caps, userId, managerExtensions = 1 }) {
  if (!booking || !TIMED.has(unit.status)) return fail('NOT_HELD', 409);
  if (has(caps, 'booking.extend_any')) return { ok: true };
  if (!has(caps, 'booking.extend_once')) return fail('FORBIDDEN', 403);
  if (unit.managerId !== userId) return fail('NOT_OWN', 403);
  if ((booking.extensions || 0) >= managerExtensions) return fail('EXTEND_LIMIT', 409);
  return { ok: true };
}

/** A unit held for a client cannot be linked to another deal (§6.3). */
export function dealLinkAllowed(unit, dealId) {
  if (!dealId || !unit.dealId || Number(unit.dealId) === Number(dealId)) return true;
  return !HELD.has(unit.status);
}

/**
 * The conflict text of §6.3, in Russian and English: who holds the unit now.
 * `current` = { status, managerName, actorName }.
 */
export function conflictMessage(current, locale = 'ru') {
  const held = TIMED.has(current.status) && current.managerName;
  if (locale === 'en') return held ? `The unit has just been reserved by ${current.managerName}` : `The unit has just been changed${current.actorName ? ` by ${current.actorName}` : ''}`;
  return held ? `Объект только что забронирован менеджером ${current.managerName}` : `Объект только что изменён${current.actorName ? ` пользователем ${current.actorName}` : ''}`;
}

// ── Prices ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

/** New price for a bulk change: set | percent (+/-) | amount (+/-). Null when it would not be a valid price. */
export function applyPriceChange(price, mode, value) {
  const base = Number(price) || 0;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  let next;
  if (mode === 'set') next = v;
  else if (mode === 'percent') next = base * (1 + v / 100);
  else if (mode === 'amount') next = base + v;
  else return null;
  next = round2(next);
  return next >= 0 ? next : null;
}

/** A head of sales may cut a price by at most `maxCutPct` percent at once (0 = no limit). */
export function priceCutAllowed(oldPrice, newPrice, caps, maxCutPct) {
  if (!has(caps, 'price.limited') || has(caps, 'status.not_for_sale') || caps.has('*')) return true;
  const limit = Number(maxCutPct) || 0;
  if (!limit || !oldPrice || newPrice >= oldPrice) return true;
  return ((oldPrice - newPrice) / oldPrice) * 100 <= limit + 1e-9;
}

// ── Construction ────────────────────────────────────────────────────────────

/** Readiness 0..100 from stage percents weighted by the stages' weights. */
export function weightedReadiness(stages) {
  let weight = 0;
  let done = 0;
  for (const stage of stages) {
    const w = Number(stage.weight) || 0;
    weight += w;
    done += w * Math.min(100, Math.max(0, Number(stage.percent) || 0));
  }
  return weight ? Math.round((done / weight) * 10) / 10 : 0;
}

const dayMs = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / dayMs);

/**
 * Schedule state of a construction object from its stages and today's
 * calendar day ('YYYY-MM-DD'): behind (an unfinished stage past its planned
 * end — delayDays is the worst), ahead (a stage finished before its planned
 * end and nothing late), on_track, or no_plan.
 */
export function scheduleState(stages, today) {
  const t0 = dayNum(today);
  let planned = false;
  let delay = 0;
  let ahead = 0;
  for (const stage of stages) {
    if (!stage.planEnd) continue;
    planned = true;
    const end = dayNum(stage.planEnd);
    const percent = Number(stage.percent) || 0;
    if (percent < 100 && t0 > end) delay = Math.max(delay, t0 - end);
    if (percent >= 100 && stage.factEnd && dayNum(stage.factEnd) < end) ahead = Math.max(ahead, end - dayNum(stage.factEnd));
  }
  if (!planned) return { state: 'no_plan', delayDays: 0 };
  if (delay > 0) return { state: 'behind', delayDays: delay };
  if (ahead > 0) return { state: 'ahead', delayDays: -ahead };
  return { state: 'on_track', delayDays: 0 };
}

/**
 * Report visibility (`caps` = read capabilities in the project): published
 * ones to everyone who sees construction, internal ones only to the
 * construction team (build.edit / build.drafts); drafts, reports under review
 * and returned ones to their author and moderators.
 */
export function reportVisible(caps, userId, report) {
  if (!has(caps, 'build.view')) return false;
  if (report.status === 'published') return report.visibility !== 'internal' || has(caps, 'build.edit') || has(caps, 'build.drafts');
  return (Boolean(userId) && Number(report.author_id) === Number(userId)) || has(caps, 'build.drafts') || has(caps, 'build.moderate');
}

export const REPORT_EVENTS = new Set(['report', 'report_edited', 'report_deleted']);

/**
 * A history entry about a report (stage, percent, status) follows the
 * report's visibility: `current` — the report as it is now (null once
 * deleted), else what the entry recorded (reportStatus, visibility,
 * reportAuthorId). Entries written before that was recorded count as
 * internal: only the construction team sees them.
 */
export function reportEventVisible(caps, userId, event, current = null) {
  const data = event.data || {};
  if (current) return reportVisible(caps, userId, current);
  return reportVisible(caps, userId, {
    status: data.reportStatus || (typeof data.status === 'string' ? data.status : 'published'),
    visibility: data.visibility || 'internal',
    author_id: data.reportAuthorId ?? (event.kind === 'report' ? event.author_id : data.authorId),
  });
}

/** Hours after publishing during which the author may still correct or delete their own report. */
export const REPORT_AUTHOR_HOURS = 24;

/**
 * Who may change a journal report. `nodeCaps` are the acting capabilities of
 * the person on every object of the report (zones).
 *   - Moderators — `build.moderate` on every object (heads of construction in
 *     their zone, project and module administrators): always, any status.
 *   - The author — only while still holding `build.edit` on every object:
 *     drafts, reports under review and returned ones; a published report for
 *     REPORT_AUTHOR_HOURS after publishing (a typo, a wrong photo), after that
 *     it is part of the record and only a moderator corrects it.
 * `editUntil` (ms) is when the author's window closes (published reports only).
 */
export function reportRights({ report, nodeCaps, userId, now = Date.now() }) {
  const caps = nodeCaps || [];
  const moderate = caps.length > 0 && caps.every((item) => has(item, 'build.moderate'));
  const author = Boolean(userId) && Number(report.author_id) === Number(userId) && caps.length > 0 && caps.every((item) => has(item, 'build.edit'));
  const published = report.status === 'published';
  const until = published && report.published_at ? new Date(report.published_at).getTime() + REPORT_AUTHOR_HOURS * 3600000 : null;
  const authorOpen = author && (!published || (until !== null && now < until));
  const manage = moderate || authorOpen;
  return {
    moderate,
    edit: manage,
    delete: manage,
    review: report.status === 'review' && moderate,
    // A draft or a returned report goes (back) to review / publication.
    submit: manage && ['draft', 'rejected'].includes(report.status) && (author || moderate),
    editUntil: !moderate && authorOpen && published ? until : null,
  };
}

/**
 * A published report corrected by its author in a moderated project (the
 * author is not a moderator): what the head of construction checks — a new
 * percent, fact date or added photos — goes back to review (its progress is
 * taken back until it is published again); fixing the text or removing a
 * photo stays published.
 */
export function editNeedsReview({ moderation, moderator, status, percent = false, factDate = false, photosAdded = false }) {
  return Boolean(moderation) && !moderator && status === 'published' && Boolean(percent || factDate || photosAdded);
}

// ── Codes ───────────────────────────────────────────────────────────────────

/**
 * Codes for a bulk-created line: prefix "A-1-", from 1, count 15, pad 2 →
 * A-1-01 … A-1-15. At most 500 at once.
 */
export function bulkCodes({ prefix = '', from = 1, count = 1, pad = 2, suffix = '' }) {
  const start = Math.max(0, Math.floor(Number(from) || 0));
  const n = Math.min(500, Math.max(0, Math.floor(Number(count) || 0)));
  const width = Math.min(6, Math.max(0, Math.floor(Number(pad) || 0)));
  return Array.from({ length: n }, (_, index) => `${prefix}${String(start + index).padStart(width, '0')}${suffix}`);
}

/**
 * Apartments of a building section: floors × units per floor, numbered
 * through (1, 2, 3… from the lowest floor) or by floor (101, 102… 201).
 */
export function apartmentGrid({ floorFrom = 1, floorTo = 1, perFloor = 1, startNumber = 1, numbering = 'through' }) {
  const out = [];
  const lo = Math.floor(Number(floorFrom) || 1);
  const hi = Math.max(lo, Math.floor(Number(floorTo) || lo));
  const per = Math.min(40, Math.max(1, Math.floor(Number(perFloor) || 1)));
  let n = Math.floor(Number(startNumber) || 1);
  for (let floor = lo; floor <= hi && out.length < 2000; floor += 1) {
    for (let riser = 1; riser <= per; riser += 1) {
      const number = numbering === 'floor' ? `${floor}${String(riser).padStart(2, '0')}` : String(n++);
      out.push({ floor, riser, number });
    }
  }
  return out;
}
