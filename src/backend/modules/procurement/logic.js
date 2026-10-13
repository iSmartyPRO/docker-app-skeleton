/*
 * Pure rules of the Procurement module (no database): statuses and their
 * transitions, money arithmetic, line items, numbering, CSV safety, payment
 * registry groups. Unit-tested in test/procurement.test.js.
 */

export const STATUSES = ['draft', 'pending', 'question', 'returned', 'to_pay', 'partially_paid', 'paid', 'delivered', 'closed', 'rejected', 'cancelled'];

/** Editable as a whole (amount, items, supplier…) by the author / responsible. */
export const EDITABLE = ['draft', 'returned', 'question'];
/** In approval right now. */
export const IN_APPROVAL = ['pending', 'question'];
/** Approved and waiting for money or goods. */
export const PAYABLE = ['to_pay', 'partially_paid'];
export const AFTER_APPROVAL = ['to_pay', 'partially_paid', 'paid', 'delivered', 'closed'];
/** Still moving ("в работе"). */
export const ACTIVE = ['draft', 'pending', 'question', 'returned', 'to_pay', 'partially_paid', 'paid', 'delivered'];
/** Done with ("отработано"). */
export const FINISHED = ['closed', 'rejected', 'cancelled'];
/** Delivery can be confirmed: approved, not closed. */
export const DELIVERABLE = ['to_pay', 'partially_paid', 'paid'];

export const PAYMENT_TERMS = ['full', 'advance', 'postpay'];
export const PAYMENT_METHODS = ['bank', 'cash', 'card', 'other'];
export const DOC_KINDS = ['invoice', 'quote', 'spec', 'photo', 'waybill', 'act', 'payment', 'other'];

export function httpError(statusCode, message, code, info) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (info) error.info = info;
  return error;
}

/** Rounds to cents without float noise. */
export const cents = (value) => Math.round(Number(value || 0) * 100) / 100;

/** A positive money amount (≤ 1e12) or null. */
export function money(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
  return cents(n);
}

/** Line items, cleaned: name, qty, unit, price → amount = qty × price. */
export function cleanItems(list) {
  const out = [];
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 200)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name ?? '').trim().slice(0, 300);
    const qty = Number(String(raw.qty ?? '').replace(',', '.'));
    const price = money(raw.price);
    if (!name && !price) continue;
    const q = Number.isFinite(qty) && qty > 0 && qty <= 1e9 ? Math.round(qty * 1000) / 1000 : 1;
    out.push({ name: name || '—', qty: q, unit: String(raw.unit ?? '').trim().slice(0, 16), price: price ?? 0, amount: cents(q * (price ?? 0)) });
  }
  return out;
}

export const itemsTotal = (items) => cents(items.reduce((sum, item) => sum + item.amount, 0));

/** Status after approval, from what was paid and delivered. */
export function deriveStatus({ total, paid, deliveryState }) {
  const due = cents(total);
  const got = cents(paid);
  if (due > 0 ? got >= due : true) return deliveryState === 'full' ? 'delivered' : 'paid';
  return got > 0 ? 'partially_paid' : 'to_pay';
}

/** Delivery state from delivery records ({ partial }): none / partial / full. */
export function deliveryStateOf(records) {
  if (!records.length) return 'none';
  return records.some((record) => !record.partial) ? 'full' : 'partial';
}

/**
 * What the approvals service may do to a request: approval status → request
 * status, allowed only from the listed request statuses (anything else is a
 * bug or a race and aborts the decision).
 */
export const APPROVAL_MAP = {
  pending: { from: ['draft', 'returned', 'pending', 'question'], to: 'pending' },
  question: { from: ['pending', 'question'], to: 'question' },
  approved: { from: ['pending', 'question', 'draft', 'returned'], to: 'to_pay' },
  rejected: { from: ['pending', 'question'], to: 'rejected' },
  returned: { from: ['pending', 'question'], to: 'returned' },
  withdrawn: { from: ['pending', 'question', 'returned'], to: 'draft' },
};

export function approvalTarget(current, approvalStatus) {
  const rule = APPROVAL_MAP[approvalStatus];
  if (!rule) throw httpError(400, 'Unknown approval status', 'BAD_STATUS');
  if (!rule.from.includes(current)) throw httpError(409, `A request in status "${current}" cannot become "${rule.to}"`, 'BAD_TRANSITION', { from: current, to: rule.to });
  return rule.to;
}

/**
 * Manual actions of the card. `who`: { author, responsible, admin, pay }.
 * Returns null when allowed, else an error code.
 */
export const ACTIONS = {
  submit: { from: ['draft', 'returned'], who: ['author', 'responsible', 'admin'] },
  withdraw: { from: ['pending', 'question', 'returned'], who: ['author', 'admin'] },
  cancel: { from: ['draft', 'returned', 'pending', 'question', 'to_pay'], who: ['author', 'responsible', 'admin'] },
  close: { from: ['paid', 'delivered'], who: ['author', 'responsible', 'admin'] },
  reopen: { from: ['closed', 'cancelled'], who: ['admin'] },
  pay: { from: ['to_pay', 'partially_paid'], who: ['pay', 'admin'] },
  deliver: { from: DELIVERABLE, who: ['author', 'responsible', 'admin'] },
  delete: { from: ['draft'], who: ['author', 'admin'] },
};

export function actionError(action, status, roles = {}, extra = {}) {
  const rule = ACTIONS[action];
  if (!rule) return 'BAD_ACTION';
  if (!rule.who.some((role) => roles[role])) return 'FORBIDDEN';
  if (!rule.from.includes(status)) return 'BAD_TRANSITION';
  if (action === 'cancel' && status === 'to_pay' && extra.paid > 0) return 'HAS_PAYMENTS';
  if (action === 'delete' && extra.everSubmitted) return 'BAD_TRANSITION';
  return null;
}

/** Actions available now (for the card's buttons). */
export function availableActions(status, roles, extra = {}) {
  return Object.keys(ACTIONS).filter((action) => !actionError(action, status, roles, extra));
}

/** «ЗК-0001». */
export function formatNumber(prefix, seq, digits = 4) {
  const body = String(seq).padStart(Math.max(1, digits), '0');
  return prefix ? `${prefix}-${body}` : body;
}

/** A CSV cell: quoted, and formulas neutralised (=, +, -, @, tab, CR start a formula in Excel). */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
  return /[";\n\r,]/.test(text) || text !== String(value) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows → CSV text with a BOM (Excel opens UTF-8 right), `;` separated. */
export function toCsv(header, rows) {
  const line = (cells) => cells.map(csvCell).join(';');
  return `﻿${[line(header), ...rows.map(line)].join('\r\n')}\r\n`;
}

/** YYYY-MM-DD + n days. */
export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/** Payment registry group of a pay-by day relative to `today` (both YYYY-MM-DD). */
export function payGroup(payBy, today) {
  if (!payBy) return 'later';
  if (payBy < today) return 'overdue';
  if (payBy === today) return 'today';
  if (payBy <= addDays(today, 7)) return 'week';
  return 'later';
}

/** Totals per currency: [{ currency, amount }] sorted by currency. */
export function totalsByCurrency(rows, field = 'amount') {
  const map = new Map();
  for (const row of rows) map.set(row.currency, cents((map.get(row.currency) || 0) + Number(row[field] || 0)));
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount }));
}

/** A calendar day (YYYY-MM-DD) or null. */
export function day(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

/** Filter chips of the list (spec §5.3): mine, waiting, urgent, overdue, to_pay, active, finished. */
export const CHIPS = ['mine', 'waiting', 'urgent', 'overdue', 'to_pay', 'active', 'finished'];

/**
 * What is missing before a request may go to approval (spec §2: only the
 * essence, the amount and the attachment are required). Codes, empty = ready.
 */
export function readyErrors(row, { invoiceCount = 0, invoiceRequired = false, currencies = null } = {}) {
  const errors = [];
  if (!String(row.title || '').trim()) errors.push('TITLE_REQUIRED');
  if (!(Number(row.amount) > 0)) errors.push('AMOUNT_REQUIRED');
  if (currencies && !currencies.includes(row.currency)) errors.push('CURRENCY');
  if (invoiceRequired && invoiceCount < 1) errors.push('INVOICE_REQUIRED');
  return errors;
}
