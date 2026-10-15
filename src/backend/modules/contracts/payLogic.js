/*
 * Pure rules of the money side of a contract (docs/contracts.md "Deposit and
 * payments"; unit-tested in test/contracts-payments.test.js): the deposit
 * («Задаток» / «Аванс»), the payment schedule (graph) built from the contract
 * amount and a plan, the allocation of received payments to the schedule rows
 * (oldest first), the state of a row on a calendar day, totals and reminders.
 * No database, no clock: "today" is always passed in. Money is counted in
 * cents internally so partial payments never drift.
 */

import { addDays, addMonths, daysBetween, httpError, isDay, text } from './logic.js';

/** Legal type of the deposit: «Задаток» (forfeited / returned double) or «Аванс» (always refundable). */
export const DEPOSIT_KINDS = ['deposit', 'advance'];
/** ожидается → получен → зачтён в оплату | возвращён | удержан. */
export const DEPOSIT_STATUSES = ['expected', 'received', 'credited', 'returned', 'forfeited'];
/** Statuses in which the deposit money is with the company (for the schedule's «Задаток» row). */
export const DEPOSIT_HELD = ['received', 'credited'];
export const PAY_METHODS = ['bank', 'cash', 'card', 'other'];
/** Purposes of a schedule row: задаток / первый взнос / ежемесячный / остаток / полная оплата. */
export const PURPOSES = ['deposit', 'first', 'monthly', 'rest', 'full'];
export const MAX_ROWS = 400;

export const toCents = (value) => Math.round(Number(value || 0) * 100);
export const fromCents = (cents) => Math.round(cents) / 100;

/** The day `day` (1–31) of the month of `month` ('YYYY-MM-DD'), clamped to the month's last day. */
export function monthDay(month, day) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(1, Math.round(Number(day) || 1)), last);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The first payment and the monthly payments of a total (the same arithmetic
 * as Masterplan's price grid, modules/masterplan/pricing.js paymentSchedule):
 * the first payment and every monthly payment in whole currency units, the
 * last monthly payment absorbs the rounding difference (and the cents).
 * → { total, first, months, monthly, last } in currency units.
 */
export function splitInstallments(total, firstPct, months) {
  const sum = toCents(total);
  const pct = Math.min(100, Math.max(0, Number(firstPct) || 0));
  const n = pct >= 100 ? 0 : Math.max(0, Math.round(Number(months) || 0));
  if (!n) return { total: fromCents(sum), first: fromCents(sum), months: 0, monthly: 0, last: 0 };
  const first = Math.round((sum * pct) / 100 / 100) * 100;
  const rest = sum - first;
  let monthly = Math.round(rest / n / 100) * 100;
  // Tiny rests with many months could make the last payment negative: round down instead.
  if (monthly * (n - 1) > rest) monthly = Math.floor(rest / n / 100) * 100;
  const last = rest - monthly * (n - 1);
  return { total: fromCents(sum), first: fromCents(first), months: n, monthly: fromCents(monthly), last: fromCents(last) };
}

/**
 * Builds the schedule rows of a contract from a plan:
 *   plan: { mode: 'full' | 'installments', firstPct, months, firstOn, startOn?, day?,
 *           deposit?: { amount, dueOn } , offset: bool }
 * - 'full': one row on firstOn for the whole amount;
 * - 'installments': the first payment on firstOn, then `months` monthly payments
 *   starting on startOn (default: a month after firstOn) on day `day` of each month;
 * - with a deposit and `offset`, a «Задаток» row comes first (on its due day, or
 *   firstOn) and the deposit is counted toward the first payment: the first
 *   payment is reduced by it; a deposit larger than the first payment reduces
 *   the next rows in order. Rows that become zero are dropped.
 * → [{ no, dueOn, amount, purpose }] sorted by day.
 */
export function buildSchedule(total, plan = {}) {
  const sum = toCents(total);
  if (!(sum > 0)) throw httpError(400, 'Set the contract amount first', 'AMOUNT_REQUIRED', { field: 'amount' });
  const firstOn = plan.firstOn;
  if (!isDay(firstOn)) throw httpError(400, 'Set the date of the first payment', 'INVALID_DATE', { field: 'firstOn' });
  const installments = plan.mode === 'installments' && Number(plan.months) > 0 && Number(plan.firstPct) < 100;
  const rows = [];
  if (installments) {
    const months = Math.min(MAX_ROWS - 2, Math.round(Number(plan.months)));
    const split = splitInstallments(fromCents(sum), plan.firstPct, months);
    const startOn = isDay(plan.startOn) ? plan.startOn : addMonths(firstOn, 1);
    const day = Number(plan.day) >= 1 && Number(plan.day) <= 31 ? Number(plan.day) : Number(startOn.slice(8, 10));
    rows.push({ dueOn: firstOn, amount: toCents(split.first), purpose: 'first' });
    for (let k = 0; k < split.months; k++) {
      rows.push({ dueOn: monthDay(addMonths(`${startOn.slice(0, 8)}01`, k), day), amount: toCents(k === split.months - 1 ? split.last : split.monthly), purpose: 'monthly' });
    }
  } else {
    rows.push({ dueOn: firstOn, amount: sum, purpose: 'full' });
  }
  const deposit = plan.deposit && plan.offset !== false ? toCents(plan.deposit.amount) : 0;
  if (deposit > 0) {
    let left = Math.min(deposit, sum);
    for (const row of rows) {
      if (!left) break;
      const take = Math.min(left, row.amount);
      row.amount -= take;
      left -= take;
    }
    // Without installments what is left after the deposit is «Остаток».
    if (!installments) rows[0].purpose = 'rest';
    const dueOn = isDay(plan.deposit.dueOn) ? plan.deposit.dueOn : firstOn;
    rows.unshift({ dueOn, amount: Math.min(deposit, sum), purpose: 'deposit' });
  }
  return rows
    .filter((row) => row.amount > 0)
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.index - b.index))
    .map((row, index) => ({ no: index + 1, dueOn: row.dueOn, amount: fromCents(row.amount), purpose: row.purpose }));
}

/** Rows in allocation order: by day, then by their number. */
export const sortRows = (rows) => [...rows].sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : (a.no || 0) - (b.no || 0) || (a.id || 0) - (b.id || 0)));

/**
 * Allocates money to the schedule rows, oldest first (partial payments fill a
 * row before the next one starts).
 *   rows:     [{ id, dueOn, no, amount, purpose }]
 *   payments: [{ amount, only? }] — `only: 'deposit'` pays only «Задаток» rows
 *             (a received deposit that is not credited yet covers the deposit
 *             row and nothing else); these go first.
 * → { rows: [... with paid], paid, surplus } — `paid` is what counts as paid on
 * the contract: every ordinary payment in full (an overpayment too) plus the
 * part of restricted payments that found a row.
 */
export function allocate(rows, payments = []) {
  const out = sortRows(rows).map((row) => ({ ...row, paidCents: 0 }));
  let paid = 0;
  let surplus = 0;
  const ordered = [...payments.filter((p) => p.only), ...payments.filter((p) => !p.only)];
  for (const payment of ordered) {
    let left = toCents(payment.amount);
    if (!(left > 0)) continue;
    const start = left;
    for (const row of out) {
      if (!left) break;
      if (payment.only && row.purpose !== payment.only) continue;
      const take = Math.min(left, toCents(row.amount) - row.paidCents);
      if (take <= 0) continue;
      row.paidCents += take;
      left -= take;
    }
    if (payment.only) paid += start - left;
    else {
      paid += start;
      surplus += left;
    }
  }
  return {
    rows: out.map(({ paidCents, ...row }) => ({ ...row, paid: fromCents(paidCents) })),
    paid: fromCents(paid),
    surplus: fromCents(surplus),
  };
}

/**
 * The state of a schedule row on a calendar day (the person's or the portal's,
 * see datetime.isoDay): paid · overdue (due before today, not fully paid) ·
 * soon (due within `soonDays`, today included) · planned.
 */
export function rowState(row, today, soonDays = 7) {
  const left = toCents(row.amount) - toCents(row.paid);
  if (left <= 0) return 'paid';
  if (row.dueOn < today) return 'overdue';
  if (daysBetween(today, row.dueOn) <= soonDays) return 'soon';
  return 'planned';
}

/** Totals of a schedule after allocation: total, paid, remaining, overdue, percent and the next unpaid row. */
export function payTotals(rows, paid, today, soonDays = 7) {
  const total = rows.reduce((sum, row) => sum + toCents(row.amount), 0);
  let overdue = 0;
  let next = null;
  for (const row of sortRows(rows)) {
    const left = toCents(row.amount) - toCents(row.paid);
    if (left <= 0) continue;
    if (row.dueOn < today) overdue += left;
    if (!next) next = { dueOn: row.dueOn, amount: fromCents(left), state: rowState(row, today, soonDays) };
  }
  const paidCents = toCents(paid);
  return {
    total: fromCents(total),
    paid: fromCents(paidCents),
    remaining: fromCents(Math.max(0, total - paidCents)),
    overdue: fromCents(overdue),
    percent: total > 0 ? Math.min(100, Math.floor((paidCents / total) * 100)) : 0,
    full: total > 0 && paidCents >= total,
    next,
  };
}

/** Registry group of a due day: overdue · today · week (within 7 days) · later. */
export function dueGroup(dueOn, today) {
  if (!dueOn) return 'later';
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'today';
  if (dueOn <= addDays(today, 7)) return 'week';
  return 'later';
}

/**
 * Payment reminders due today for one unpaid row: before the day (the
 * smallest of `days` that has been reached, never a late larger one) and
 * once when it becomes overdue. → [{ kind: 'due' | 'overdue', days, left }]
 */
export function paymentReminders(row, today, days = [3, 0]) {
  const leftCents = toCents(row.amount) - toCents(row.paid);
  if (leftCents <= 0 || !row.dueOn) return [];
  const left = daysBetween(today, row.dueOn);
  if (left < 0) return [{ kind: 'overdue', days: 0, left }];
  const thresholds = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0).sort((a, b) => a - b);
  const hit = thresholds.find((d) => left <= d);
  return hit === undefined ? [] : [{ kind: 'due', days: hit, left }];
}

// ── Input ───────────────────────────────────────────────────────────────────

const money = (value, field, { required = false, positive = false } = {}) => {
  if (value === null || value === undefined || value === '') {
    if (required) throw httpError(400, 'Enter the amount', 'BAD_AMOUNT', { field });
    return null;
  }
  const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1e15 || (positive && n <= 0)) throw httpError(400, 'Invalid amount', 'BAD_AMOUNT', { field });
  return Math.round(n * 100) / 100;
};

const dayOrNull = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  if (!isDay(String(value))) throw httpError(400, `Invalid date in ${field}`, 'INVALID_DATE', { field });
  return String(value);
};

const currencyOf = (value) => {
  const code = String(value || '').trim().toUpperCase();
  if (code && !/^[A-Z]{3}$/.test(code)) throw httpError(400, 'Invalid currency', 'BAD_CURRENCY', { field: 'currency' });
  return code || null;
};

/** Deposit fields people edit (not its status): only keys present in `input` are returned. */
export function cleanDeposit(input = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (has('kind')) {
    if (!DEPOSIT_KINDS.includes(input.kind)) throw httpError(400, 'Unknown deposit type', 'BAD_KIND', { field: 'kind' });
    out.kind = input.kind;
  }
  if (has('amount')) out.amount = money(input.amount, 'amount', { required: true, positive: true });
  if (has('currency')) out.currency = currencyOf(input.currency);
  if (has('dueOn')) out.dueOn = dayOrNull(input.dueOn, 'dueOn');
  if (has('terms')) out.terms = text(input.terms, 2000);
  if (has('method')) {
    if (input.method && !PAY_METHODS.includes(input.method)) throw httpError(400, 'Unknown method', 'BAD_METHOD', { field: 'method' });
    out.method = input.method || null;
  }
  if (has('reference')) out.reference = text(input.reference, 80);
  return out;
}

/**
 * A deposit status change by finance: → { status, receivedOn, method, reference, settledOn, settledAmount, note }.
 * received / credited / returned / forfeited need the money to have come (receivedOn, default today).
 */
export function cleanDepositStatus(input = {}, current = {}, today) {
  const status = String(input.status || '');
  if (!DEPOSIT_STATUSES.includes(status)) throw httpError(400, 'Unknown deposit status', 'BAD_STATUS', { field: 'status' });
  if (status === current.status) throw httpError(409, 'The deposit already has this status', 'SAME_STATUS');
  const out = { status, note: text(input.note, 1000) };
  if (status === 'expected') return { ...out, receivedOn: null, settledOn: null, settledAmount: null };
  out.receivedOn = dayOrNull(input.receivedOn, 'receivedOn') || current.receivedOn || today;
  if (input.method !== undefined) {
    if (input.method && !PAY_METHODS.includes(input.method)) throw httpError(400, 'Unknown method', 'BAD_METHOD', { field: 'method' });
    out.method = input.method || null;
  }
  if (input.reference !== undefined) out.reference = text(input.reference, 80);
  if (['returned', 'forfeited'].includes(status)) {
    out.settledOn = dayOrNull(input.settledOn, 'settledOn') || today;
    out.settledAmount = money(input.settledAmount, 'settledAmount') ?? (status === 'returned' ? Number(current.amount) : null);
  } else {
    out.settledOn = status === 'credited' ? dayOrNull(input.settledOn, 'settledOn') || today : null;
    out.settledAmount = null;
  }
  return out;
}

/** A received payment (fact). */
export function cleanPayment(input = {}, today) {
  const amount = money(input.amount, 'amount', { required: true, positive: true });
  const paidOn = dayOrNull(input.paidOn, 'paidOn') || today;
  const method = input.method || 'bank';
  if (!PAY_METHODS.includes(method)) throw httpError(400, 'Unknown method', 'BAD_METHOD', { field: 'method' });
  return { amount, paidOn, method, reference: text(input.reference, 80), note: text(input.note, 1000) };
}

/** The plan stored with the schedule (what it was built from). */
export function cleanPlan(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const mode = input.mode === 'installments' ? 'installments' : 'full';
  const pct = Number(input.firstPct);
  const months = Math.round(Number(input.months) || 0);
  return {
    mode,
    firstPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct * 100) / 100)) : 100,
    months: mode === 'installments' ? Math.min(MAX_ROWS - 2, Math.max(0, months)) : 0,
    firstOn: dayOrNull(input.firstOn, 'firstOn'),
    startOn: dayOrNull(input.startOn, 'startOn'),
    day: Number(input.day) >= 1 && Number(input.day) <= 31 ? Math.round(Number(input.day)) : null,
    offset: input.offset !== false,
    source: input.source ? text(input.source, 120) : null,
  };
}

/** Schedule rows as edited by hand: valid days, positive amounts, known purposes. */
export function cleanScheduleRows(list) {
  if (!Array.isArray(list)) throw httpError(400, 'Rows expected', 'BAD_ROWS');
  if (list.length > MAX_ROWS) throw httpError(400, `At most ${MAX_ROWS} rows`, 'BAD_ROWS');
  const rows = list.map((raw, index) => {
    const dueOn = dayOrNull(raw?.dueOn, `rows.${index}.dueOn`);
    if (!dueOn) throw httpError(400, 'Every row needs a date', 'INVALID_DATE', { field: `rows.${index}.dueOn`, index });
    const amount = money(raw?.amount, `rows.${index}.amount`, { required: true, positive: true });
    const purpose = PURPOSES.includes(raw?.purpose) ? raw.purpose : 'monthly';
    const id = Number.isInteger(Number(raw?.id)) && Number(raw.id) > 0 ? Number(raw.id) : null;
    return { index, id, dueOn, amount, purpose, note: text(raw?.note, 300) };
  });
  // Sorted by day (the order of entry breaks ties); `id` keeps an existing row (and its reminders).
  return sortRows(rows.map((row) => ({ ...row, no: row.index + 1, id: undefined, rowId: row.id })))
    .map((row, index) => ({ no: index + 1, id: row.rowId, dueOn: row.dueOn, amount: row.amount, purpose: row.purpose, note: row.note }));
}
