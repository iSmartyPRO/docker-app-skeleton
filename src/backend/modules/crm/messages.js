import { formatDateTime } from '../../services/datetime.js';

/** Notification texts of the CRM module, per recipient language (pattern: tasks/messages.js). */

const amountText = (amount, currency) => (amount ? `${Number(amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency || ''}`.trim() : '');
/** A moment in the recipient's region settings; `zone` (legacy param) only when no settings are known. */
const when = (value, locale, zone, regional) => {
  if (!value) return '';
  const r = regional || (zone ? { timeZone: zone, dateFormat: 'DD.MM.YYYY', timeFormat: '24' } : undefined);
  return formatDateTime(value, r, locale);
};
const lines = (...parts) => parts.filter(Boolean).join('\n');

export const CRM_MESSAGES = {
  assigned: ({ title, actor, amount, currency }) => ({
    en: { title: `Deal “${title}” is assigned to you`, body: lines(amountText(amount, currency), actor) },
    ru: { title: `Вам передана сделка «${title}»`, body: lines(amountText(amount, currency), actor) },
  }),
  activity: ({ title, deal, actor, dueAt, zone, regional }) => ({
    en: { title: `New activity: ${title}`, body: lines(`Deal “${deal}”`, dueAt ? `Due: ${when(dueAt, 'en', zone, regional)}` : '', actor) },
    ru: { title: `Новое дело: ${title}`, body: lines(`Сделка «${deal}»`, dueAt ? `Срок: ${when(dueAt, 'ru', zone, regional)}` : '', actor) },
  }),
  activityDue: ({ title, deal, dueAt, zone, regional }) => ({
    en: { title: `Reminder: ${title}`, body: lines(`Deal “${deal}”`, dueAt ? `Due: ${when(dueAt, 'en', zone, regional)}` : '') },
    ru: { title: `Напоминание: ${title}`, body: lines(`Сделка «${deal}»`, dueAt ? `Срок: ${when(dueAt, 'ru', zone, regional)}` : '') },
  }),
  stage: ({ title, stage, actor, lostReason }) => ({
    en: { title: `Deal “${title}”: stage “${stage}”`, body: lines(lostReason ? `Reason: ${lostReason}` : '', actor) },
    ru: { title: `Сделка «${title}»: стадия «${stage}»`, body: lines(lostReason ? `Причина: ${lostReason}` : '', actor) },
  }),
};

/** `render` for notify(): the recipient's language and region settings (dates). */
export function crmMessage(kind, params) {
  return (locale, regional) => {
    const texts = CRM_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}
