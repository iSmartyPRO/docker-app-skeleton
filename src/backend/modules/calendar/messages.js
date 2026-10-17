import { formatDate, formatDateTime, isValidTimeZone, zoneLabel, zoneOffsetMinutes } from '../../services/datetime.js';
import { localeTag, translator } from '../../services/i18n/index.js';

/** Notification texts for the calendar module in the recipient's language (locales/<lang>/calendar.js). */

const DATE_FORMAT = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/** The stored day of an all-day event ('YYYY-MM-DD': kept as UTC midnight). */
const storedDay = (start) => (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : new Date(start).toISOString().slice(0, 10));

/**
 * Human date of an event.
 *  - With the recipient's region settings (`regional`): their zone and
 *    formats; a timed event planned in another zone (different offset at that
 *    moment) gets the recipient's zone label, e.g. "14.10.2026, 09:00 (UTC+6)".
 *  - Without: the event's own zone, Intl medium style (older callers).
 * All-day events are their calendar day everywhere.
 */
export function whenText(locale, { start, allDay, timezone }, regional = null) {
  try {
    if (regional) {
      if (allDay) return formatDate(storedDay(start), regional, locale);
      const text = formatDateTime(start, regional, locale);
      const foreign = isValidTimeZone(timezone) && zoneOffsetMinutes(start, timezone) !== zoneOffsetMinutes(start, regional.timeZone);
      return foreign ? `${text} (${zoneLabel(regional.timeZone, new Date(start))})` : text;
    }
    const options = allDay ? { dateStyle: 'medium', timeZone: 'UTC' } : { ...DATE_FORMAT, timeZone: timezone || 'UTC' };
    return new Intl.DateTimeFormat(localeTag(locale), options).format(new Date(start));
  } catch {
    return new Date(start).toISOString();
  }
}

const place = (p) => (p.location ? ` · ${p.location}` : '');
const by = (p) => (p.actor ? `\n${p.actor}` : '');

const TEXTS = {
  invited: (t, p) => ({ title: t('calendar.notify.invited.title', { title: p.title }), body: `${p.when}${place(p)}\n${t('calendar.notify.invited.by', { actor: p.actor })}` }),
  updated: (t, p) => ({ title: t('calendar.notify.updated.title', { title: p.title }), body: `${p.when}${place(p)}` }),
  cancelled: (t, p) => ({ title: t('calendar.notify.cancelled.title', { title: p.title }), body: p.when }),
  rsvp: (t, p) => ({ title: t(`calendar.notify.rsvp.${p.status}`, { actor: p.actor, title: p.title }), body: p.when }),
  followNew: (t, p) => ({ title: t('calendar.notify.followNew.title', { calendar: p.calendar, title: p.title }), body: `${p.when}${place(p)}${by(p)}` }),
  followUpdated: (t, p) => ({ title: t('calendar.notify.followUpdated.title', { calendar: p.calendar, title: p.title }), body: `${p.when}${place(p)}${by(p)}` }),
  followDeleted: (t, p) => ({ title: t('calendar.notify.followDeleted.title', { calendar: p.calendar, title: p.title }), body: `${p.when}${by(p)}` }),
  reminder: (t, p) => ({
    title: p.minutes === 0 ? t('calendar.notify.reminder.now', { title: p.title }) : t('calendar.notify.reminder.in', { lead: leadText(p.minutes, t.locale), title: p.title }),
    body: `${p.when}${place(p)}`,
  }),
};

/** "2 days", "1 hour", "15 min" in a language (CLDR plurals: locales/<lang>/calendar.js → lead). */
export function leadText(minutes, locale = 'en') {
  const t = translator(locale);
  if (minutes % 1440 === 0) return t('calendar.lead.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('calendar.lead.hours', { count: minutes / 60 });
  return t('calendar.lead.minutes', { count: minutes });
}

/** `render` for notify(): the recipient's language, and their region settings for the date. */
export function eventMessage(kind, params) {
  return (locale, regional) => {
    const t = translator(locale);
    return TEXTS[kind](t, { ...params, when: whenText(t.locale, params, regional) });
  };
}
