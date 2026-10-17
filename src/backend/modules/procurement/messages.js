import { formatDate } from '../../services/datetime.js';
import { moneyText, translator } from '../../services/i18n/index.js';

/*
 * Notification texts of the Procurement module in the recipient's language
 * (locales/<lang>/procurement.js → notify.*) and regional settings.
 */

/** "5 000 USD" / "120 000 сом" with the recipient's separators (services/i18n). */
export { moneyText };

const lines = (...parts) => parts.filter(Boolean).join('\n');
const head = (doc) => [doc.number, doc.title].filter(Boolean).join(' · ');
const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');
const supplier = (t, doc) => (doc.supplier ? t('procurement.notify.supplier', { name: doc.supplier }) : '');
const money = (t, amount, doc) => moneyText(amount, doc.currency, t.locale);
const day = (t, value, doc) => dayText(value, t.locale, doc.regional);

export const PROCUREMENT_MESSAGES = {
  toPay: (t, { doc }) => ({
    title: t('procurement.notify.toPay.title', { doc: head(doc) }),
    body: lines(money(t, doc.remaining ?? doc.amount, doc), supplier(t, doc), doc.payBy ? t('procurement.notify.toPay.payBy', { date: day(t, doc.payBy, doc) }) : ''),
  }),
  paid: (t, { doc, payment, full, actor }) => ({
    title: t(`procurement.notify.paid.${full ? 'full' : 'part'}`, { doc: head(doc) }),
    body: lines(`${money(t, payment.amount, doc)} — ${day(t, payment.paidOn, doc)}`, full ? '' : t('procurement.notify.paid.totals', { paid: money(t, doc.paid, doc), total: money(t, doc.amount, doc) }), actor),
  }),
  delivered: (t, { doc, partial, actor }) => ({ title: t(`procurement.notify.delivered.${partial ? 'part' : 'full'}`, { doc: head(doc) }), body: lines(actor) }),
  assigned: (t, { doc, actor }) => ({ title: t('procurement.notify.assigned.title', { doc: head(doc) }), body: lines(money(t, doc.amount, doc), actor) }),
  paySoon: (t, { doc }) => ({
    title: t('procurement.notify.paySoon.title', { date: day(t, doc.payBy, doc), doc: head(doc) }),
    body: lines(t('procurement.notify.left', { amount: money(t, doc.remaining, doc) })),
  }),
  payOverdue: (t, { doc }) => ({
    title: t('procurement.notify.payOverdue.title', { doc: head(doc) }),
    body: lines(t('procurement.notify.wasDue', { date: day(t, doc.payBy, doc) }), t('procurement.notify.left', { amount: money(t, doc.remaining, doc) })),
  }),
  deliverSoon: (t, { doc }) => ({ title: t('procurement.notify.deliverSoon.title', { date: day(t, doc.deliverBy, doc), doc: head(doc) }), body: lines(supplier(t, doc)) }),
  deliverOverdue: (t, { doc }) => ({
    title: t('procurement.notify.deliverOverdue.title', { doc: head(doc) }),
    body: lines(t('procurement.notify.wasDue', { date: day(t, doc.deliverBy, doc) }), supplier(t, doc)),
  }),
};

/** `render` for notify(): the recipient's language and regional settings (dates). */
export function procurementMessage(kind, params) {
  return (locale, regional) => PROCUREMENT_MESSAGES[kind](translator(locale), { ...params, doc: { ...params.doc, regional: regional || null } });
}
