import { localeTag, normalizeLocale } from './i18n/languages.js';
/*
 * Time zones and date/time formats, one place for the whole server.
 *
 * The portal has regional settings (Settings → General → Region and time):
 *   timeZone    IANA zone, e.g. 'Asia/Bishkek' — "today", deadlines, reminders
 *   dateFormat  'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'D MMM YYYY'
 *   timeFormat  '24' | '12'
 *   weekStart   1 (Monday) | 0 (Sunday) | 6 (Saturday)
 *
 * Each person may override any of them (users.regional); a null value follows
 * the portal. For the zone a person may also choose 'device': the zone their
 * browser reports (users.device_tz, saved by the app).
 *
 * Instants are stored and passed around in UTC (TIMESTAMPTZ / ISO strings);
 * zones matter only when a moment is shown to a person or a wall-clock value
 * ("tomorrow at 9:00", "today") is turned into an instant.
 */

export const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D MMM YYYY'];
export const TIME_FORMATS = ['24', '12'];
export const WEEK_STARTS = [1, 0, 6];

// Building an Intl.DateTimeFormat costs tens of microseconds and these helpers
// run several times per request (dashboards, inbox counts): the answers and
// the per-zone formatters are kept. Zone names are few; the maps are capped.
const ZONE_CHECKS = new Map();
const ZONE_FORMATTERS = new Map();
const ZONE_CACHE_MAX = 500;

export const REGIONAL_DEFAULTS = {
  timeZone: process.env.TZ && isValidTimeZone(process.env.TZ) ? process.env.TZ : 'Asia/Bishkek',
  dateFormat: 'DD.MM.YYYY',
  timeFormat: '24',
  weekStart: 1,
};

function remember(map, key, value) {
  if (map.size >= ZONE_CACHE_MAX) map.clear();
  map.set(key, value);
  return value;
}

export function isValidTimeZone(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return false;
  const known = ZONE_CHECKS.get(zone);
  if (known !== undefined) return known;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return remember(ZONE_CHECKS, zone, true);
  } catch {
    return remember(ZONE_CHECKS, zone, false);
  }
}

function partsFormatter(timeZone) {
  return (
    ZONE_FORMATTERS.get(timeZone) ||
    remember(
      ZONE_FORMATTERS,
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
        hourCycle: 'h23',
      })
    )
  );
}

/** Portal settings: every key valid, unknown values fall back to the defaults. */
export function sanitizeRegional(input = {}, current = REGIONAL_DEFAULTS) {
  const next = { ...REGIONAL_DEFAULTS, ...current };
  if (isValidTimeZone(input.timeZone)) next.timeZone = input.timeZone;
  if (DATE_FORMATS.includes(input.dateFormat)) next.dateFormat = input.dateFormat;
  if (TIME_FORMATS.includes(String(input.timeFormat))) next.timeFormat = String(input.timeFormat);
  if (WEEK_STARTS.includes(Number(input.weekStart)) && input.weekStart !== null && input.weekStart !== '') next.weekStart = Number(input.weekStart);
  return next;
}

/**
 * A person's overrides: null (or 'portal') = follow the portal; the zone may
 * also be 'device'.
 */
export function sanitizeUserRegional(input = {}, current = {}) {
  const next = { timeZone: null, dateFormat: null, timeFormat: null, weekStart: null, ...current };
  const portal = (value) => value === null || value === 'portal' || value === '';
  if (input.timeZone !== undefined) next.timeZone = portal(input.timeZone) ? null : input.timeZone === 'device' || isValidTimeZone(input.timeZone) ? input.timeZone : next.timeZone;
  if (input.dateFormat !== undefined) next.dateFormat = portal(input.dateFormat) ? null : DATE_FORMATS.includes(input.dateFormat) ? input.dateFormat : next.dateFormat;
  if (input.timeFormat !== undefined) next.timeFormat = portal(input.timeFormat) ? null : TIME_FORMATS.includes(String(input.timeFormat)) ? String(input.timeFormat) : next.timeFormat;
  if (input.weekStart !== undefined) next.weekStart = portal(input.weekStart) ? null : WEEK_STARTS.includes(Number(input.weekStart)) ? Number(input.weekStart) : next.weekStart;
  return next;
}

/**
 * What applies to a person: their overrides over the portal's settings.
 * `user` is a users row (regional, device_tz, notify_prefs, locale) or null.
 */
export function resolveRegional(portal = REGIONAL_DEFAULTS, user = null) {
  const base = sanitizeRegional(portal || {});
  const own = user?.regional && typeof user.regional === 'object' ? user.regional : {};
  const device = [user?.device_tz, user?.notify_prefs?.tz].find(isValidTimeZone) || null;
  let timeZone = base.timeZone;
  if (own.timeZone === 'device') timeZone = device || base.timeZone;
  else if (isValidTimeZone(own.timeZone)) timeZone = own.timeZone;
  return {
    timeZone,
    dateFormat: DATE_FORMATS.includes(own.dateFormat) ? own.dateFormat : base.dateFormat,
    timeFormat: TIME_FORMATS.includes(String(own.timeFormat)) ? String(own.timeFormat) : base.timeFormat,
    weekStart: WEEK_STARTS.includes(Number(own.weekStart)) && own.weekStart !== null ? Number(own.weekStart) : base.weekStart,
    locale: normalizeLocale(user?.locale),
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const MONTHS = {
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Calendar fields of an instant in a zone: { year, month (1-12), day, hour, minute, second, weekday (0 = Sunday) }. */
export function zonedParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = partsFormatter(isValidTimeZone(timeZone) ? timeZone : REGIONAL_DEFAULTS.timeZone).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

/** Minutes the zone is ahead of UTC at that instant (e.g. +360 for Asia/Bishkek). */
export function zoneOffsetMinutes(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant of a wall-clock time in a zone (handles DST by re-checking the offset). */
export function wallToInstant({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  const corrected = guess - zoneOffsetMinutes(new Date(instant), timeZone) * 60000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** Midnight that starts the day containing `value`, in the zone (plus `addDays`). */
export function startOfDay(value, timeZone, addDays = 0) {
  const p = zonedParts(value, timeZone);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  const wanted = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() };
  const instant = wallToInstant(wanted, timeZone);
  const target = day.toISOString().slice(0, 10);
  if (isoDay(instant, timeZone) === target) return instant;
  // Midnight skipped by a DST change (e.g. America/Santiago): the day starts
  // at the transition, i.e. midnight read with the offset in force before it.
  const before = zoneOffsetMinutes(new Date(day.getTime() - 12 * 3600000), timeZone);
  const first = new Date(day.getTime() - before * 60000);
  return isoDay(first, timeZone) === target ? first : instant;
}

/** Start of the week (by weekStart) containing `value`, in the zone. */
/** Short month name (1–12) in a language: the tables above, Intl for the others. */
function monthShort(locale, month) {
  const code = normalizeLocale(locale) || 'ru';
  if (MONTHS[code]) return MONTHS[code][month - 1];
  return new Intl.DateTimeFormat(localeTag(code), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 15)));
}

export function startOfWeek(value, timeZone, weekStart = 1, addWeeks = 0) {
  const p = zonedParts(value, timeZone);
  const back = (p.weekday - weekStart + 7) % 7;
  return startOfDay(value, timeZone, -back + addWeeks * 7);
}

/** 'YYYY-MM-DD' of an instant in the zone (for date-only values such as deadlines' days). */
export function isoDay(value, timeZone) {
  const p = zonedParts(value, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

const pad = (n) => String(n).padStart(2, '0');

function dateText(p, dateFormat, locale) {
  switch (dateFormat) {
    case 'DD/MM/YYYY':
      return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
    case 'MM/DD/YYYY':
      return `${pad(p.month)}/${pad(p.day)}/${p.year}`;
    case 'YYYY-MM-DD':
      return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    case 'D MMM YYYY':
      return `${p.day} ${monthShort(locale, p.month)} ${p.year}`;
    default:
      return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
  }
}

function timeText(p, timeFormat) {
  if (String(timeFormat) === '12') {
    const hour = p.hour % 12 || 12;
    return `${hour}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
  }
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Text of a moment for a person: `r` is resolveRegional(...) (or anything with
 * timeZone/dateFormat/timeFormat), `locale` a portal language code.
 *   formatDate(v, r) → "13.10.2026"   formatTime(v, r) → "14:30"
 *   formatDateTime(v, r) → "13.10.2026, 14:30"
 * A date-only value ('YYYY-MM-DD') is shown as that day, never shifted by a zone.
 */
export function formatDate(value, r = REGIONAL_DEFAULTS, locale = r.locale || 'ru') {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return dateText({ year, month, day }, r.dateFormat, locale);
  }
  return dateText(zonedParts(value, r.timeZone), r.dateFormat, locale);
}

export function formatTime(value, r = REGIONAL_DEFAULTS) {
  if (!value) return '';
  return timeText(zonedParts(value, r.timeZone), r.timeFormat);
}

export function formatDateTime(value, r = REGIONAL_DEFAULTS, locale = r.locale || 'ru') {
  if (!value) return '';
  const p = zonedParts(value, r.timeZone);
  return `${dateText(p, r.dateFormat, locale)}, ${timeText(p, r.timeFormat)}`;
}

/** Short zone label for messages, e.g. "UTC+6". */
export function zoneLabel(timeZone, at = new Date()) {
  const minutes = zoneOffsetMinutes(at, timeZone);
  const sign = minutes >= 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad(abs % 60)}` : ''}`;
}
