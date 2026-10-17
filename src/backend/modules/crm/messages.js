import { formatDateTime } from '../../services/datetime.js';
import { formatNumber, translator } from '../../services/i18n/index.js';

/** Notification texts of the CRM module in the recipient's language (locales/<lang>/crm.js; pattern: tasks/messages.js). */

const amountText = (t, amount, currency) => (amount ? `${formatNumber(t.locale, amount, { maximumFractionDigits: 2 })} ${currency || ''}`.trim() : '');
/** A moment in the recipient's region settings; `zone` (legacy param) only when no settings are known. */
const when = (value, locale, zone, regional) => {
  if (!value) return '';
  const r = regional || (zone ? { timeZone: zone, dateFormat: 'DD.MM.YYYY', timeFormat: '24' } : undefined);
  return formatDateTime(value, r, locale);
};
const lines = (...parts) => parts.filter(Boolean).join('\n');
const due = (t, dueAt, zone, regional) => (dueAt ? t('crm.notify.due', { date: when(dueAt, t.locale, zone, regional) }) : '');

export const CRM_MESSAGES = {
  assigned: (t, { title, actor, amount, currency }) => ({ title: t('crm.notify.assigned.title', { title }), body: lines(amountText(t, amount, currency), actor) }),
  activity: (t, { title, deal, actor, dueAt, zone, regional }) => ({
    title: t('crm.notify.activity.title', { title }),
    body: lines(t('crm.notify.deal', { deal }), due(t, dueAt, zone, regional), actor),
  }),
  activityDue: (t, { title, deal, dueAt, zone, regional }) => ({
    title: t('crm.notify.activityDue.title', { title }),
    body: lines(t('crm.notify.deal', { deal }), due(t, dueAt, zone, regional)),
  }),
  stage: (t, { title, stage, actor, lostReason }) => ({
    title: t('crm.notify.stage.title', { title, stage }),
    body: lines(lostReason ? t('crm.notify.stage.reason', { reason: lostReason }) : '', actor),
  }),
};

/** `render` for notify(): the recipient's language and region settings (dates). */
export function crmMessage(kind, params) {
  return (locale, regional) => CRM_MESSAGES[kind](translator(locale), { ...params, regional: regional || null });
}
