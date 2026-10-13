import rrulePkg from 'rrule';
import { isValidTimeZone } from '../../services/datetime.js';

const { RRule } = rrulePkg;

/*
 * Recurring events are expanded in the event's own time zone, so "every
 * Monday at 09:00" stays at 09:00 local time across DST changes. rrule works
 * on "floating" dates (wall-clock time stored as UTC), so occurrences are
 * converted wall time ↔ real instants with Intl.
 */

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MAX_OCCURRENCES = 1000;
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** A named IANA zone (a missing one is not: Intl would quietly use the server's). */
export function validTimeZone(tz) {
  return isValidTimeZone(tz);
}

const formatters = new Map();
function partsIn(date, tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  const parts = Object.fromEntries(formatters.get(tz).formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** Real instant → the same wall-clock time expressed as a UTC date. */
export function toWall(date, tz) {
  return new Date(partsIn(date, tz));
}

/** Wall-clock time (as a UTC date) in `tz` → real instant. */
export function fromWall(wall, tz) {
  const guess = wall.getTime();
  const offset = partsIn(new Date(guess), tz) - guess;
  let result = guess - offset;
  const corrected = partsIn(new Date(result), tz) - result;
  if (corrected !== offset) result = guess - corrected;
  return new Date(result);
}

/**
 * Accepts a small, safe subset of RFC 5545 RRULE:
 * FREQ, INTERVAL, BYDAY (MO..SU, optional ±n for monthly), BYMONTHDAY, COUNT, UNTIL.
 * Returns the normalised rule string, or null for "does not repeat".
 */
export function normalizeRule(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^RRULE:/i, '').toUpperCase();
  if (!text) return null;
  const parts = {};
  for (const pair of text.split(';')) {
    const [key, value] = pair.split('=');
    if (key && value) parts[key] = value;
  }
  if (!FREQS.includes(parts.FREQ)) return null;
  const out = [`FREQ=${parts.FREQ}`];
  const interval = Number(parts.INTERVAL);
  if (Number.isInteger(interval) && interval > 1 && interval <= 365) out.push(`INTERVAL=${interval}`);
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',').filter((day) => /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.test(day) && DAYS.includes(day.slice(-2)));
    if (days.length) out.push(`BYDAY=${days.join(',')}`);
  }
  // 0 never matches and would make rrule scan forever.
  if (parts.BYMONTHDAY && /^-?\d{1,2}$/.test(parts.BYMONTHDAY) && Number(parts.BYMONTHDAY) !== 0 && Math.abs(Number(parts.BYMONTHDAY)) <= 31) {
    out.push(`BYMONTHDAY=${Number(parts.BYMONTHDAY)}`);
  }
  const count = Number(parts.COUNT);
  if (Number.isInteger(count) && count > 0 && count <= 1000) out.push(`COUNT=${count}`);
  else if (parts.UNTIL && /^\d{8}(T\d{6}Z?)?$/.test(parts.UNTIL)) out.push(`UNTIL=${parts.UNTIL.length === 8 ? `${parts.UNTIL}T235959Z` : parts.UNTIL.replace(/Z?$/, 'Z')}`);
  return out.join(';');
}

/**
 * SQL condition (alias `e`) that skips series whose UNTIL lies well before
 * `param` (a timestamptz placeholder such as '$2'), so finished series are not
 * loaded and expanded on every request. The margin covers the longest event
 * (62 days) and wall-clock zones; COUNT-limited series are still loaded.
 */
export function seriesNotOverBefore(param) {
  const until = `substring(e.rrule from 'UNTIL=([0-9]{8})')`;
  return `(${until} IS NULL OR to_date(${until}, 'YYYYMMDD') >= (${param}::timestamptz - interval '64 days')::date)`;
}

/**
 * Occurrence starts of an event within [from, to).
 * Non-recurring events return their start when it overlaps the window.
 */
export function occurrences(event, from, to) {
  const start = new Date(event.starts_at);
  const duration = new Date(event.ends_at) - start;
  if (!event.rrule) {
    return start < to && new Date(start.getTime() + duration) > from ? [start] : [];
  }
  const tz = event.all_day ? 'UTC' : event.timezone || 'UTC';
  const rule = new RRule({ ...RRule.parseString(event.rrule), dtstart: toWall(start, tz) });
  // Look back by the duration so events that started before the window but are still running are included.
  const windowStart = toWall(new Date(from.getTime() - duration), tz);
  const windowEnd = toWall(to, tz);
  const excluded = new Set((event.exdates || []).map((date) => new Date(date).getTime()));
  // The iterator stops rrule after MAX_OCCURRENCES instead of collecting everything.
  return rule
    .between(windowStart, windowEnd, true, (date, index) => index < MAX_OCCURRENCES)
    .map((wall) => fromWall(wall, tz))
    .filter((date) => !excluded.has(date.getTime()) && date < to && new Date(date.getTime() + duration) > from);
}
