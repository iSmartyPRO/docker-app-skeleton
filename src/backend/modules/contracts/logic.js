/*
 * Pure rules of the Contracts module (unit-tested in test/contracts.test.js):
 * statuses and who may move a contract between them, numbering, the
 * calendar-day arithmetic of the expiry job and of the reminders, input
 * cleaning. No database, no clock: "today" is always passed in.
 */

export const TYPE_KEY = 'contracts.contract';

/** Spec §6.2: Проект → На согласовании (↔ Нужен ответ) → Согласован → Подписан → Действует → Истекает → Завершён; side: Отклонён, Расторгнут. */
export const STATUSES = ['draft', 'approval', 'question', 'approved', 'signed', 'active', 'expiring', 'completed', 'rejected', 'terminated'];
/** Statuses of a contract in force (reminders, the expiry job, the calendar). */
export const RUNNING = ['signed', 'active', 'expiring'];
/** «Отработано» / archive. */
export const ARCHIVED = ['completed', 'terminated', 'rejected'];
/** Not signed yet («В работе»). */
export const IN_WORK = ['draft', 'approval', 'question', 'approved'];
/** Fields may be edited by the contract's people (legal and admins also in force). */
export const EDITABLE = ['draft', 'question', 'rejected'];
export const DIRECTIONS = ['supplier', 'client'];
export const IMPORTANCE = ['high', 'medium', 'low'];
export const RISK_STATUSES = ['open', 'accepted', 'fixed'];

export function httpError(statusCode, message, code, info) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (info) error.info = info;
  return error;
}

// ── Manual transitions ──────────────────────────────────────────────────────

/**
 * Status changes people make by hand (approval statuses come from the
 * approvals service through onStatus, date-driven ones from the job):
 *   who: 'legal' (contracts.legal / contracts.admin), 'editor' (creator, owner, lawyer, legal, admin)
 */
export const MANUAL_TRANSITIONS = [
  { from: ['approved'], to: 'signed', who: 'legal' },
  { from: ['signed'], to: 'active', who: 'legal' },
  { from: ['signed', 'active', 'expiring'], to: 'completed', who: 'legal' },
  { from: ['signed', 'active', 'expiring'], to: 'terminated', who: 'legal', comment: true },
  // Back to «Проект» to rework a contract that was approved but will not be signed as is, or was rejected.
  { from: ['approved', 'rejected'], to: 'draft', who: 'editor' },
];

/** The transition a person may make, or a reason why not. `roles`: { legal, editor }. */
export function checkTransition(from, to, roles = {}) {
  if (!STATUSES.includes(to)) return { ok: false, code: 'BAD_STATUS' };
  const rule = MANUAL_TRANSITIONS.find((item) => item.to === to && item.from.includes(from));
  if (!rule) return { ok: false, code: 'BAD_TRANSITION' };
  const allowed = rule.who === 'legal' ? roles.legal : roles.editor || roles.legal;
  if (!allowed) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, rule };
}

/** Transitions offered to a person for a contract in `from` (for the card's buttons). */
export function availableTransitions(from, roles = {}) {
  return MANUAL_TRANSITIONS.filter((rule) => rule.from.includes(from) && checkTransition(from, rule.to, roles).ok).map((rule) => rule.to);
}

/**
 * The approvals service reports a process status; the contract follows.
 *   pending → На согласовании, question → Нужен ответ, approved → Согласован,
 *   rejected → Отклонён, returned / withdrawn → back to Проект.
 * Returns the new status, or throws 409 when the contract cannot be in approval now.
 */
export function statusFromApproval(current, approvalStatus, action) {
  switch (approvalStatus) {
    case 'pending':
      // Start / restart from a draft or a rejected contract; an answer returns a question.
      if (['start', 'restart'].includes(action) && !['draft', 'rejected', 'approval', 'question'].includes(current)) {
        throw httpError(409, 'Only a draft or a rejected contract can be sent to approval', 'BAD_TRANSITION', { status: current });
      }
      return 'approval';
    case 'question':
      return 'question';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'returned':
    case 'withdrawn':
      return 'draft';
    default:
      return current;
  }
}

// ── Numbering ───────────────────────────────────────────────────────────────

/** «ДГ-0001»: prefix, dash, at least four digits. */
export function formatNumber(prefix, seq) {
  const head = String(prefix || '').trim();
  const digits = String(Math.max(1, Number(seq) || 1)).padStart(4, '0');
  return head ? `${head}-${digits}` : digits;
}

// ── Calendar days ───────────────────────────────────────────────────────────

const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Whole days from `a` to `b` ('YYYY-MM-DD'): positive when b is later. */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The last day to send a refusal of auto-prolongation: end − notice days (null without both). */
export function noticeDeadline(contract) {
  if (!contract.autoRenew || !contract.endsOn || !contract.noticeDays) return null;
  return addDays(contract.endsOn, -contract.noticeDays);
}

/**
 * The next term of an auto-prolonged contract that ended before `today`:
 * the same length as the original term (start → end), or a year without a
 * start date; repeated until the term covers today.
 */
export function prolongTerm(contract, today) {
  let start = contract.startsOn;
  let end = contract.endsOn;
  // A term of whole months (1 Jan – 31 Mar) renews by months; any other by its length in days; no start: a year.
  let months = start ? null : 12;
  if (start) {
    for (let k = 1; k <= 120 && !months; k++) if (addDays(addMonths(start, k), -1) === end) months = k;
  }
  const length = start ? daysBetween(start, end) : null;
  let guard = 0;
  while (end < today && guard++ < 500) {
    const nextStart = addDays(end, 1);
    end = months ? (start ? addDays(addMonths(nextStart, months), -1) : addMonths(end, months)) : addDays(nextStart, Math.max(0, length));
    start = nextStart;
  }
  return { startsOn: start, endsOn: end };
}

/**
 * Where the dates put a contract in force (the job runs this every few minutes):
 *   - not started yet (start date in the future) → stays «Подписан»;
 *   - ended (end date passed) → «Завершён», or a new term when it auto-prolongs;
 *   - ends within `expiringDays` → «Истекает», otherwise «Действует».
 * Returns { status, startsOn?, endsOn?, prolonged? } or null when nothing changes.
 */
export function dateTransition(contract, today, expiringDays = 30) {
  if (!RUNNING.includes(contract.status)) return null;
  let { startsOn, endsOn } = contract;
  let prolonged = false;
  if (contract.status === 'signed' && startsOn && startsOn > today) return null;
  if (endsOn && endsOn < today) {
    if (!contract.autoRenew) return { status: 'completed' };
    ({ startsOn, endsOn } = prolongTerm(contract, today));
    prolonged = true;
  }
  const status = endsOn && daysBetween(today, endsOn) <= expiringDays ? 'expiring' : 'active';
  if (!prolonged && status === contract.status) return null;
  return prolonged ? { status, startsOn, endsOn, prolonged: true, from: contract.endsOn } : { status };
}

/**
 * Reminders due today for a contract in force. One per kind — the smallest
 * threshold that has been reached (a contract created 5 days before its end
 * gets the 7-day reminder, never a late 30-day one):
 *   end     N days before the end date (only without auto-prolongation: an auto-prolonged contract does not end)
 *   notice  N days before the refusal deadline (auto-prolongation with a notice period)
 * Each is { kind, days, target } — the job stores (contract, kind, days, target) once.
 */
export function dueReminders(contract, today, reminderDays = [30, 7]) {
  if (!RUNNING.includes(contract.status)) return [];
  const thresholds = [...new Set(reminderDays)].filter((d) => d > 0).sort((a, b) => a - b);
  const out = [];
  const pick = (kind, target) => {
    if (!target) return;
    const left = daysBetween(today, target);
    if (left < 0) return;
    const days = thresholds.find((d) => left <= d);
    if (days !== undefined) out.push({ kind, days, target, left });
  };
  if (!contract.autoRenew) pick('end', contract.endsOn);
  pick('notice', noticeDeadline(contract));
  return out;
}

// ── Input ───────────────────────────────────────────────────────────────────

export const text = (value, max) => {
  const out = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
  return out || null;
};

const posInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const day = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  if (!isDay(String(value))) throw httpError(400, `Invalid date in ${field}`, 'INVALID_DATE', { field });
  return String(value);
};

/** Contract fields as sent by the form / API; only keys present in `input` are returned. */
export function cleanContract(input = {}, settings = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (has('title')) {
    out.title = text(input.title, 300);
    if (!out.title) throw httpError(400, 'The title is required', 'TITLE_REQUIRED', { field: 'title' });
  }
  if (has('typeKey')) {
    const key = text(input.typeKey, 24);
    const types = (settings.types || []).map((t) => t.key);
    if (key && types.length && !types.includes(key)) throw httpError(400, 'Unknown contract type', 'BAD_TYPE', { field: 'typeKey' });
    out.typeKey = key;
  }
  if (has('direction')) {
    if (input.direction && !DIRECTIONS.includes(input.direction)) throw httpError(400, 'Unknown direction', 'BAD_DIRECTION', { field: 'direction' });
    out.direction = input.direction || null;
  }
  if (has('extNumber')) out.extNumber = text(input.extNumber, 80);
  if (has('companyId')) out.companyId = posInt(input.companyId);
  if (has('counterparty')) out.counterparty = text(input.counterparty, 300);
  if (has('legalEntityId')) out.legalEntityId = posInt(input.legalEntityId);
  if (has('framework')) out.framework = Boolean(input.framework);
  if (has('amount')) {
    if (input.amount === null || input.amount === '' || input.amount === undefined) out.amount = null;
    else {
      const n = Number(input.amount);
      if (!Number.isFinite(n) || n < 0 || n > 1e15) throw httpError(400, 'Invalid amount', 'BAD_AMOUNT', { field: 'amount' });
      out.amount = Math.round(n * 100) / 100;
    }
  }
  if (has('currency')) {
    const code = String(input.currency || '').trim().toUpperCase();
    if (code && !/^[A-Z]{3}$/.test(code)) throw httpError(400, 'Invalid currency', 'BAD_CURRENCY', { field: 'currency' });
    out.currency = code || null;
  }
  if (has('paymentTerms')) out.paymentTerms = text(input.paymentTerms, 1000);
  if (has('description')) out.description = text(input.description, 5000);
  for (const [key, field] of [['concludedOn', 'concludedOn'], ['startsOn', 'startsOn'], ['endsOn', 'endsOn']]) {
    if (has(key)) out[key] = day(input[key], field);
  }
  if (has('autoRenew')) out.autoRenew = Boolean(input.autoRenew);
  if (has('noticeDays')) {
    const n = input.noticeDays === null || input.noticeDays === '' ? null : Number(input.noticeDays);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 3650)) throw httpError(400, 'Invalid notice period', 'BAD_NOTICE', { field: 'noticeDays' });
    out.noticeDays = n;
  }
  for (const key of ['lawyerId', 'ownerId', 'dealId', 'mpProjectId', 'mpNodeId']) {
    if (has(key)) out[key] = posInt(input[key]);
  }
  return out;
}

/** Cross-field checks on the merged contract (after a patch). */
export function checkContract(c) {
  if (c.startsOn && c.endsOn && c.endsOn < c.startsOn) throw httpError(400, 'The end date is before the start date', 'BAD_DATES', { field: 'endsOn' });
  if (c.framework && c.amount === null) return;
}

/** A risk as sent by the lawyer. */
export function cleanRisk(input = {}, partial = false) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (!partial || has('text')) {
    out.text = text(input.text, 2000);
    if (!out.text) throw httpError(400, 'Describe the risk', 'TEXT_REQUIRED', { field: 'text' });
  }
  if (!partial || has('clause')) out.clause = text(input.clause, 120);
  if (!partial || has('importance')) {
    const value = input.importance || (partial ? undefined : 'medium');
    if (!IMPORTANCE.includes(value)) throw httpError(400, 'Unknown importance', 'BAD_IMPORTANCE', { field: 'importance' });
    out.importance = value;
  }
  if (has('status')) {
    if (!RISK_STATUSES.includes(input.status)) throw httpError(400, 'Unknown risk status', 'BAD_RISK_STATUS', { field: 'status' });
    out.status = input.status;
  }
  return out;
}

/** Changed keys between two plain objects (history: old → new). */
export function diff(before, after, keys) {
  const changes = {};
  for (const key of keys) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (String(a) !== String(b)) changes[key] = { from: a, to: b };
  }
  return changes;
}
