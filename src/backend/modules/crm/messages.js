/** Notification texts of the CRM module, per recipient language (pattern: tasks/messages.js). */

const amountText = (amount, currency) => (amount ? `${Number(amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency || ''}`.trim() : '');
const when = (value, locale, zone) =>
  value ? new Date(value).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const lines = (...parts) => parts.filter(Boolean).join('\n');

export const CRM_MESSAGES = {
  assigned: ({ title, actor, amount, currency }) => ({
    en: { title: `Deal “${title}” is assigned to you`, body: lines(amountText(amount, currency), actor) },
    ru: { title: `Вам передана сделка «${title}»`, body: lines(amountText(amount, currency), actor) },
  }),
  activity: ({ title, deal, actor, dueAt, zone }) => ({
    en: { title: `New activity: ${title}`, body: lines(`Deal “${deal}”`, dueAt ? `Due: ${when(dueAt, 'en', zone)}` : '', actor) },
    ru: { title: `Новое дело: ${title}`, body: lines(`Сделка «${deal}»`, dueAt ? `Срок: ${when(dueAt, 'ru', zone)}` : '', actor) },
  }),
  activityDue: ({ title, deal, dueAt, zone }) => ({
    en: { title: `Reminder: ${title}`, body: lines(`Deal “${deal}”`, dueAt ? `Due: ${when(dueAt, 'en', zone)}` : '') },
    ru: { title: `Напоминание: ${title}`, body: lines(`Сделка «${deal}»`, dueAt ? `Срок: ${when(dueAt, 'ru', zone)}` : '') },
  }),
  stage: ({ title, stage, actor, lostReason }) => ({
    en: { title: `Deal “${title}”: stage “${stage}”`, body: lines(lostReason ? `Reason: ${lostReason}` : '', actor) },
    ru: { title: `Сделка «${title}»: стадия «${stage}»`, body: lines(lostReason ? `Причина: ${lostReason}` : '', actor) },
  }),
};

/** `render` for notify(): picks the recipient's language. */
export function crmMessage(kind, params) {
  const texts = CRM_MESSAGES[kind](params);
  return (locale) => texts[locale] || texts.en;
}
