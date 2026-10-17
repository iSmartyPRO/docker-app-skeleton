import { fmtDate, fmtDateTime, fmtTime, getRegional, intlOptions } from './datetime';
import { localeTag, normalizeLocale } from '../i18n/languages';
import { translate } from '../i18n/translations';

/** BCP 47 tag of a portal language for Intl: 'ru' → 'ru-RU' (i18n/languages.js). */
export { localeTag };

/**
 * A moment as text in the person's time zone and formats (lib/datetime.js).
 * The usual date/time styles map to the chosen formats; any other Intl options
 * (e.g. { day: 'numeric', month: 'short' }) still get the person's zone and hour cycle.
 */
export function formatDateTime(value, locale, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—';
  const keys = Object.keys(options || {});
  const regional = { ...getRegional(), locale: normalizeLocale(locale) || 'en' };
  if (keys.every((key) => key === 'dateStyle' || key === 'timeStyle')) {
    if (options.dateStyle && options.timeStyle) return fmtDateTime(value, regional);
    if (options.dateStyle) return fmtDate(value, regional);
    if (options.timeStyle) return fmtTime(value, regional);
  }
  return new Date(value).toLocaleString(localeTag(locale), intlOptions(options, regional));
}

/** "5 minutes ago" in the UI language. */
export function formatRelative(value, locale) {
  if (!value) return '—';
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  const steps = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, 'second');
}

export function formatDuration(totalSeconds, locale) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const unit = (key, n) => translate(locale, `format.duration.${key}`, { n }) ?? `${n}${key[0]}`;
  const parts = [];
  if (days) parts.push(unit('days', days));
  if (hours || days) parts.push(unit('hours', hours));
  parts.push(unit('minutes', minutes));
  return parts.join(' ');
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function initials(name = '?') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
