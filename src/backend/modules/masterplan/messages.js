import { formatDateTime } from '../../services/datetime.js';

/*
 * Notification texts of the Masterplan module, per recipient language
 * (pattern: crm/messages.js). Moments are written in the recipient's region
 * settings (`regional` comes from notify()).
 */

const lines = (...parts) => parts.filter(Boolean).join('\n');
const when = (value, locale, regional) => (value ? formatDateTime(value, regional || undefined, locale) : '');

const STATUS = {
  ru: { not_for_sale: 'Не в продаже', free: 'Свободно', reserve: 'Резерв', booking: 'Бронь', deposit: 'Задаток', contract: 'Договор', sold: 'Продано', handed: 'Передано' },
  en: { not_for_sale: 'Not for sale', free: 'Available', reserve: 'Reserved', booking: 'Booked', deposit: 'Deposit', contract: 'Contract', sold: 'Sold', handed: 'Handed over' },
};
export const statusName = (status, locale = 'ru') => (STATUS[locale] || STATUS.en)[status] || status;

export const MP_MESSAGES = {
  expiring: ({ code, project, endsAt, kind, regional }) => ({
    ru: { title: `${kind === 'reserve' ? 'Резерв' : 'Бронь'} ${code} скоро истекает`, body: lines(project, `До: ${when(endsAt, 'ru', regional)}`) },
    en: { title: `${kind === 'reserve' ? 'Reserve' : 'Booking'} of ${code} expires soon`, body: lines(project, `Until: ${when(endsAt, 'en', regional)}`) },
  }),
  expired: ({ code, project, manager, kind }) => ({
    ru: { title: `${kind === 'reserve' ? 'Резерв' : 'Бронь'} ${code} снят${kind === 'reserve' ? '' : 'а'} автоматически`, body: lines(project, 'Срок истёк, объект снова свободен.', manager ? `Менеджер: ${manager}` : '') },
    en: { title: `${kind === 'reserve' ? 'Reserve' : 'Booking'} of ${code} released automatically`, body: lines(project, 'The time ran out; the unit is available again.', manager ? `Manager: ${manager}` : '') },
  }),
  bulkStatus: ({ count, sample, project, to, actor, reason }) => ({
    ru: { title: `${statusName(to, 'ru')}: ${count} объект(ов)`, body: lines(project, sample, reason ? `Причина: ${reason}` : '', actor) },
    en: { title: `${statusName(to, 'en')}: ${count} unit(s)`, body: lines(project, sample, reason ? `Reason: ${reason}` : '', actor) },
  }),
  status: ({ code, project, to, actor, reason }) => ({
    ru: { title: `${code}: ${statusName(to, 'ru')}`, body: lines(project, reason ? `Причина: ${reason}` : '', actor) },
    en: { title: `${code}: ${statusName(to, 'en')}`, body: lines(project, reason ? `Reason: ${reason}` : '', actor) },
  }),
  report: ({ objects, stage, percent, project, actor }) => ({
    ru: { title: `Новый фотоотчёт: ${objects}`, body: lines(project, stage ? `${stage}${percent != null ? ` — ${percent}%` : ''}` : '', actor) },
    en: { title: `New construction report: ${objects}`, body: lines(project, stage ? `${stage}${percent != null ? ` — ${percent}%` : ''}` : '', actor) },
  }),
  reportReview: ({ objects, project, actor }) => ({
    ru: { title: `Отчёт на проверке: ${objects}`, body: lines(project, actor) },
    en: { title: `Report to review: ${objects}`, body: lines(project, actor) },
  }),
  reportReviewed: ({ objects, published, note }) => ({
    ru: { title: published ? `Отчёт опубликован: ${objects}` : `Отчёт возвращён: ${objects}`, body: note ? `Комментарий: ${note}` : '' },
    en: { title: published ? `Report published: ${objects}` : `Report returned: ${objects}`, body: note ? `Comment: ${note}` : '' },
  }),
  stale: ({ count, days, project, sample }) => ({
    ru: { title: `Нет отчётов больше ${days} дней: ${count}`, body: lines(project, sample) },
    en: { title: `No reports for over ${days} days: ${count}`, body: lines(project, sample) },
  }),
  delay: ({ code, days, stage, project }) => ({
    ru: { title: `Отставание ${days} дн.: ${code}`, body: lines(project, stage ? `Этап: ${stage}` : '') },
    en: { title: `${days} days behind: ${code}`, body: lines(project, stage ? `Stage: ${stage}` : '') },
  }),
  accessRequest: ({ actor, note }) => ({
    ru: { title: `Запрос доступа к «Мастерплану»: ${actor}`, body: note || '' },
    en: { title: `Masterplan access request: ${actor}`, body: note || '' },
  }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function mpMessage(kind, params) {
  return (locale, regional) => {
    const texts = MP_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}
