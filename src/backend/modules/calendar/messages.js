import { formatDate, formatDateTime, isValidTimeZone, zoneLabel, zoneOffsetMinutes } from '../../services/datetime.js';

/** Notification texts for the calendar module, per recipient language. */

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
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', options).format(new Date(start));
  } catch {
    return new Date(start).toISOString();
  }
}

const TEXTS = {
  invited: (p) => ({
    en: { title: `Invitation: ${p.title}`, body: `${p.when.en}${p.location ? ` · ${p.location}` : ''}\n${p.actor} invited you` },
    ru: { title: `Приглашение: ${p.title}`, body: `${p.when.ru}${p.location ? ` · ${p.location}` : ''}\nПриглашает ${p.actor}` },
  }),
  updated: (p) => ({
    en: { title: `Event changed: ${p.title}`, body: `${p.when.en}${p.location ? ` · ${p.location}` : ''}` },
    ru: { title: `Событие изменено: ${p.title}`, body: `${p.when.ru}${p.location ? ` · ${p.location}` : ''}` },
  }),
  cancelled: (p) => ({
    en: { title: `Event cancelled: ${p.title}`, body: p.when.en },
    ru: { title: `Событие отменено: ${p.title}`, body: p.when.ru },
  }),
  rsvp: (p) => ({
    en: { title: `${p.actor} ${{ accepted: 'accepted', declined: 'declined', tentative: 'may attend' }[p.status]}: ${p.title}`, body: p.when.en },
    ru: { title: `${p.actor} ${{ accepted: 'примет участие', declined: 'отказался(-ась)', tentative: 'возможно, придёт' }[p.status]}: ${p.title}`, body: p.when.ru },
  }),
  followNew: (p) => ({
    en: { title: `New in “${p.calendar}”: ${p.title}`, body: `${p.when.en}${p.location ? ` · ${p.location}` : ''}${p.actor ? `\n${p.actor}` : ''}` },
    ru: { title: `Новое в «${p.calendar}»: ${p.title}`, body: `${p.when.ru}${p.location ? ` · ${p.location}` : ''}${p.actor ? `\n${p.actor}` : ''}` },
  }),
  followUpdated: (p) => ({
    en: { title: `Changed in “${p.calendar}”: ${p.title}`, body: `${p.when.en}${p.location ? ` · ${p.location}` : ''}${p.actor ? `\n${p.actor}` : ''}` },
    ru: { title: `Изменено в «${p.calendar}»: ${p.title}`, body: `${p.when.ru}${p.location ? ` · ${p.location}` : ''}${p.actor ? `\n${p.actor}` : ''}` },
  }),
  followDeleted: (p) => ({
    en: { title: `Removed from “${p.calendar}”: ${p.title}`, body: `${p.when.en}${p.actor ? `\n${p.actor}` : ''}` },
    ru: { title: `Удалено из «${p.calendar}»: ${p.title}`, body: `${p.when.ru}${p.actor ? `\n${p.actor}` : ''}` },
  }),
  reminder: (p) => ({
    en: { title: `${p.minutes === 0 ? 'Starting now' : `In ${p.lead.en}`}: ${p.title}`, body: `${p.when.en}${p.location ? ` · ${p.location}` : ''}` },
    ru: { title: `${p.minutes === 0 ? 'Начинается' : `Через ${p.lead.ru}`}: ${p.title}`, body: `${p.when.ru}${p.location ? ` · ${p.location}` : ''}` },
  }),
};

export function leadText(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return { en: `${days} day${days > 1 ? 's' : ''}`, ru: `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}` };
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return { en: `${hours} hour${hours > 1 ? 's' : ''}`, ru: `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}` };
  }
  return { en: `${minutes} min`, ru: `${minutes} мин` };
}

/** `render` for notify(): the recipient's language, and their region settings for the date. */
export function eventMessage(kind, params) {
  return (locale, regional) => {
    const when = { en: whenText('en', params, regional), ru: whenText('ru', params, regional) };
    const texts = TEXTS[kind]({ ...params, when, lead: leadText(params.minutes || 0) });
    return texts[locale] || texts.en;
  };
}
