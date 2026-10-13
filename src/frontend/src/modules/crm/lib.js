import dayjs from 'dayjs';
import { localeTag } from '../../lib/format';

// ── Local storage (per browser, per user) ─────────────────────────────────

export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the setting just is not remembered */
  }
}

export const userKey = (user, name) => `crm_${name}_${user?.id || 0}`;

// ── Views ─────────────────────────────────────────────────────────────────

export const VIEWS = ['kanban', 'list', 'activities', 'calendar'];

/** The last view of this person (kanban by default). */
export function lastView(user) {
  const view = readStore(userKey(user, 'view'), 'kanban');
  return VIEWS.includes(view) ? view : 'kanban';
}

// ── Money ─────────────────────────────────────────────────────────────────

const formatters = new Map();
function moneyFormatter(currency, locale, digits) {
  const key = `${currency}|${locale}|${digits}`;
  if (!formatters.has(key)) {
    let fmt;
    try {
      fmt = new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency: currency || 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: digits });
    } catch {
      fmt = new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 0, maximumFractionDigits: digits });
    }
    formatters.set(key, fmt);
  }
  return formatters.get(key);
}

/** 1 250 000 сом / $12,500 — whole numbers unless there are cents. */
export function formatMoney(amount, currency, locale) {
  const value = Number(amount) || 0;
  const digits = Math.round(value * 100) % 100 === 0 ? 0 : 2;
  // The som sign (U+20C0) is missing from most fonts: KGS reads as «сом».
  if (currency === 'KGS') return `${new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)} ${locale === 'ru' ? 'сом' : 'KGS'}`;
  return moneyFormatter(currency, locale, digits).format(value);
}

/** Column sums: { KGS: 1200, USD: 300 } → ["1 200 сом", "$300"], biggest first. */
export function sumLines(sum, locale) {
  return Object.entries(sum || {})
    .filter(([, value]) => Number(value))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([currency, value]) => formatMoney(value, currency, locale));
}

export function formatNumber(value, locale) {
  return new Intl.NumberFormat(localeTag(locale)).format(Number(value) || 0);
}

// ── Dates ─────────────────────────────────────────────────────────────────

export function formatDay(value, locale, withYear) {
  if (!value) return '';
  const date = dayjs(value);
  const year = withYear || !date.isSame(dayjs(), 'year');
  return date.toDate().toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}

/** "Today 15:00", "Tomorrow", "12 Oct 10:30" for an activity's due moment. */
export function formatDue(value, locale, t) {
  if (!value) return t('crm.act.noDue');
  const date = dayjs(value);
  const days = date.startOf('day').diff(dayjs().startOf('day'), 'day');
  const timed = !(date.hour() === 23 && date.minute() === 59);
  let day;
  if (days === 0) day = t('crm.due.today');
  else if (days === 1) day = t('crm.due.tomorrow');
  else if (days === -1) day = t('crm.due.yesterday');
  else day = formatDay(value, locale);
  return timed ? `${day}, ${date.format('HH:mm')}` : day;
}

export function isOverdue(value) {
  return Boolean(value) && dayjs(value).isBefore(dayjs());
}

// ── Filters ───────────────────────────────────────────────────────────────

export const EMPTY_FILTER = { group: 'open' };

/** Built-in presets: "In progress" is the default. */
export const BUILTIN_PRESETS = [
  { id: 'work', filter: { group: 'open' } },
  { id: 'mine', filter: { group: 'open', owners: ['me'] } },
  { id: 'closed', filter: { group: 'closed' } },
];

const LIST_KEYS = ['stages', 'owners', 'createdBy'];

export const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/**
 * The filter as query params of the API (lists comma-joined, empties dropped).
 * "Closed" is not a group of the API: it is every stage group narrowed to the
 * won and lost stages of the pipeline.
 */
export function filterParams(filter = {}, pipeline = null) {
  const params = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'clientLabel' || (typeof value === 'object' && !Array.isArray(value))) continue;
    if (Array.isArray(value)) {
      if (value.length) params[key] = value.join(',');
    } else params[key] = value;
  }
  if (params.group === 'closed') {
    params.group = 'all';
    const closed = (pipeline?.stages || []).filter((stage) => stage.kind !== 'open').map((stage) => stage.id);
    const chosen = (filter.stages || []).map(Number).filter((id) => closed.includes(id));
    if (closed.length) params.stages = (chosen.length ? chosen : closed).join(',');
  }
  if (params.source) params.source = String(params.source);
  params.tz = TZ;
  return params;
}

/** How many fields narrow the result besides the stage group (for the badge). */
export function filterCount(filter = {}) {
  return Object.entries(filter).filter(([key, value]) => {
    if (key === 'group' || key === 'q' || key === 'activity' || key === 'clientLabel') return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
  }).length;
}

export function sameFilter(a = {}, b = {}) {
  const norm = (f) => JSON.stringify(filterParams(f), Object.keys(filterParams(f)).sort());
  return norm(a) === norm(b);
}

export function normalizeFilter(filter = {}) {
  const next = { ...EMPTY_FILTER, ...filter };
  for (const key of LIST_KEYS) if (next[key] && !Array.isArray(next[key])) next[key] = String(next[key]).split(',').filter(Boolean);
  return next;
}

// ── Activities ────────────────────────────────────────────────────────────

export const ACTIVITY_KINDS = ['call', 'meeting', 'task', 'email', 'other'];

export const REMIND_OPTIONS = [0, 5, 15, 30, 60, 120, 1440];

// ── Stages ────────────────────────────────────────────────────────────────

export const openStages = (pipeline) => (pipeline?.stages || []).filter((stage) => stage.kind === 'open');
export const wonStage = (pipeline) => (pipeline?.stages || []).find((stage) => stage.kind === 'won');
export const lostStage = (pipeline) => (pipeline?.stages || []).find((stage) => stage.kind === 'lost');

/** A readable text colour on top of a stage colour. */
export function inkOn(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? '#1f2937' : '#fff';
}

// ── Clients ───────────────────────────────────────────────────────────────

export function clientName(deal) {
  return deal?.company?.name || deal?.person?.name || '';
}

/** The client of a deal as a picker value: "c:12" / "p:5". */
export function clientValue(deal) {
  if (deal?.company) return `c:${deal.company.id}`;
  if (deal?.person) return `p:${deal.person.id}`;
  return undefined;
}

export function errorCode(err) {
  return err?.response?.data?.code;
}
