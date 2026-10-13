import { REGIONAL_DEFAULTS, isValidTimeZone, startOfDay, startOfWeek, wallToInstant } from '../../services/datetime.js';

/*
 * Pure helpers of the CRM module (no database): money, ranks, dates, time
 * buckets of activities, CSV cells, the parameter binder used by every query.
 */

export const RANK_STEP = 1024;
export const MAX_BULK = 1000;
export const MAX_EXPORT = 20000;

/** Collects query parameters: `p.add(value)` → "$n". */
export class Params {
  constructor(values = []) {
    this.values = [...values];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Money is NUMERIC in the database; the API returns numbers rounded to cents. */
export const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** "1 500,50" → 1500.5; null for anything that is not a non-negative amount. */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[\s ]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n >= 1e16) return null;
  return Math.round(n * 100) / 100;
}

/** Sums per currency: [{ currency, sum }] → { KGS: 1500, USD: 20 }. */
export function sumsByCurrency(rows) {
  const out = {};
  for (const row of rows) {
    if (!row.currency) continue;
    out[row.currency] = money((out[row.currency] || 0) + Number(row.sum || 0));
  }
  return out;
}

/**
 * A rank between two neighbours (kanban drag): `prev` is the card that ends up
 * above, `next` the one below; either may be null. Returns null when the gap
 * is exhausted and the column must be re-spread first.
 */
export function midRank(prev, next, step = RANK_STEP) {
  const a = prev === null || prev === undefined ? null : Number(prev);
  const b = next === null || next === undefined ? null : Number(next);
  if (a !== null && b !== null) {
    if (Math.abs(b - a) < 1e-6) return null;
    return (a + b) / 2;
  }
  if (a !== null) return a + step;
  if (b !== null) return b - step;
  return step;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value) {
  const text = String(value ?? '').slice(0, 10);
  if (!DATE_RE.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

export function parseStamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const toDateString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** A valid IANA zone, else CRM_TZ, else the portal default zone. */
export function cleanZone(tz) {
  if (isValidTimeZone(String(tz || '').slice(0, 64))) return String(tz).slice(0, 64);
  return isValidTimeZone(process.env.CRM_TZ) ? process.env.CRM_TZ : REGIONAL_DEFAULTS.timeZone;
}

/** The instant of local midnight of y-m-d in a zone (DST safe). */
export function zonedMidnight(y, m, d, tz) {
  return wallToInstant({ year: y, month: m, day: d }, tz);
}

/** The instant a 'YYYY-MM-DD' day starts in the zone (plus `addDays`); null for anything else. */
export function dayStartAt(text, tz, addDays = 0) {
  if (!DATE_RE.test(String(text || ''))) return null;
  const [y, m, d] = String(text).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + addDays));
  return zonedMidnight(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), cleanZone(tz));
}

/**
 * Time boundaries for activity buckets in the viewer's zone: now, start and
 * end of today, end of this week, end of next week. Weeks start on
 * `weekStart` (1 Monday, 0 Sunday, 6 Saturday).
 */
export function bucketBounds(now = new Date(), tz = 'UTC', weekStart = 1) {
  const zone = cleanZone(tz);
  const first = [0, 1, 6].includes(Number(weekStart)) ? Number(weekStart) : 1;
  return {
    now,
    startToday: startOfDay(now, zone),
    endToday: startOfDay(now, zone, 1),
    endWeek: startOfWeek(now, zone, first, 1),
    endNextWeek: startOfWeek(now, zone, first, 2),
    zone,
    weekStart: first,
  };
}

/**
 * Bounds for a request: explicit valid `tz` / `weekStart` parameters win
 * (the app sends the person's resolved values), else the person's region
 * settings (ctx.regional, set by the routes).
 */
export function boundsFor(ctx, input = {}, now = new Date()) {
  const zone = isValidTimeZone(input?.tz) ? input.tz : ctx?.regional?.timeZone;
  const sent = input?.weekStart;
  const weekStart = sent !== undefined && sent !== null && sent !== '' && [0, 1, 6].includes(Number(sent)) ? Number(sent) : ctx?.regional?.weekStart ?? 1;
  return bucketBounds(now, zone, weekStart);
}

export const BUCKETS = ['overdue', 'today', 'week', 'nextWeek', 'later', 'none'];

/** Where a deal stands by its nearest open activity (`minDue` = earliest due date, `open` = open activities). */
export function activityBucket(minDue, open, bounds) {
  if (!open) return 'none';
  if (!minDue) return 'later';
  const due = new Date(minDue).getTime();
  if (due < bounds.now.getTime()) return 'overdue';
  if (due < bounds.endToday.getTime()) return 'today';
  if (due < bounds.endWeek.getTime()) return 'week';
  if (due < bounds.endNextWeek.getTime()) return 'nextWeek';
  return 'later';
}

/** The counters' grouping: overdue · today · planned (anything later or without a date) · none. */
export function counterBucket(minDue, open, bounds) {
  const bucket = activityBucket(minDue, open, bounds);
  return ['week', 'nextWeek', 'later'].includes(bucket) ? 'planned' : bucket;
}

/** SQL twin of activityBucket over `a.min_due` / `a.open` (see deals.js ACTIVITY_JOIN). */
export function bucketSql(p, bounds) {
  const now = p.add(bounds.now);
  const endToday = p.add(bounds.endToday);
  const endWeek = p.add(bounds.endWeek);
  const endNext = p.add(bounds.endNextWeek);
  return `CASE WHEN COALESCE(a.open, 0) = 0 THEN 'none'
    WHEN a.min_due IS NULL THEN 'later'
    WHEN a.min_due < ${now}::timestamptz THEN 'overdue'
    WHEN a.min_due < ${endToday}::timestamptz THEN 'today'
    WHEN a.min_due < ${endWeek}::timestamptz THEN 'week'
    WHEN a.min_due < ${endNext}::timestamptz THEN 'nextWeek'
    ELSE 'later' END`;
}

/** A number already formatted for the CSV ("-5,5"): written as is, never taken for a formula. */
export class CsvNumber {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

/** A number with a decimal comma for Excel, or null when `value` is not a number. */
export function csvNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? new CsvNumber(String(n).replace('.', ',')) : null;
}

/**
 * One CSV cell (same rules as drive/activity.js): text a spreadsheet would read
 * as a formula (= + - @, or a leading tab / CR) gets a leading apostrophe.
 */
export const csvCell = (value) => {
  if (value == null) return '';
  let text = String(value);
  if (typeof value !== 'number' && !(value instanceof CsvNumber) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Comma-separated positive ids ("1,2,x" → [1, 2]); `me` becomes the given user id. */
export function idList(value, me = null, max = 200) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(',');
  const out = [];
  for (const item of items) {
    const text = String(item).trim();
    if (text === 'me' && me) out.push(me);
    else if (/^\d{1,9}$/.test(text) && Number(text) > 0) out.push(Number(text));
  }
  return [...new Set(out)].slice(0, max);
}

export const likePattern = (text) => `%${String(text).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export const posInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
};
