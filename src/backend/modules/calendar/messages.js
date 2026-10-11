/** Notification texts for the calendar module, per recipient language. */

const DATE_FORMAT = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/** Human date in the event's time zone (all-day events: date only). */
export function whenText(locale, { start, allDay, timezone }) {
  const options = allDay ? { dateStyle: 'medium', timeZone: 'UTC' } : { ...DATE_FORMAT, timeZone: timezone || 'UTC' };
  try {
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

export function eventMessage(kind, params) {
  const when = { en: whenText('en', params), ru: whenText('ru', params) };
  const texts = TEXTS[kind]({ ...params, when, lead: leadText(params.minutes || 0) });
  return (locale) => texts[locale] || texts.en;
}
