import { formatDate } from '../../services/datetime.js';

/** Notification texts of the Procurement module, per recipient language and regional settings. */

const SYMBOL = { KGS: { ru: 'сом', en: 'KGS' } };

/** "5 000 USD" / "120 000 сом" with the recipient's separators. */
export function moneyText(amount, currency, locale = 'ru') {
  if (amount === null || amount === undefined) return '';
  const value = Number(amount);
  const digits = Number.isInteger(value) ? 0 : 2;
  const number = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value);
  return `${number} ${SYMBOL[currency]?.[locale] || currency || ''}`.trim();
}

const lines = (...parts) => parts.filter(Boolean).join('\n');
const head = (doc) => [doc.number, doc.title].filter(Boolean).join(' · ');
const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');

export const PROCUREMENT_MESSAGES = {
  toPay: ({ doc, locale }) => ({
    en: { title: `To pay: ${head(doc)}`, body: lines(moneyText(doc.remaining ?? doc.amount, doc.currency, 'en'), doc.supplier ? `Supplier: ${doc.supplier}` : '', doc.payBy ? `Pay by ${dayText(doc.payBy, 'en', doc.regional)}` : '') },
    ru: { title: `К оплате: ${head(doc)}`, body: lines(moneyText(doc.remaining ?? doc.amount, doc.currency, 'ru'), doc.supplier ? `Поставщик: ${doc.supplier}` : '', doc.payBy ? `Оплатить до ${dayText(doc.payBy, 'ru', doc.regional)}` : '') },
  }),
  paid: ({ doc, payment, full, actor }) => ({
    en: { title: full ? `Paid: ${head(doc)}` : `Partly paid: ${head(doc)}`, body: lines(`${moneyText(payment.amount, doc.currency, 'en')} — ${dayText(payment.paidOn, 'en', doc.regional)}`, full ? '' : `Paid ${moneyText(doc.paid, doc.currency, 'en')} of ${moneyText(doc.amount, doc.currency, 'en')}`, actor) },
    ru: { title: full ? `Оплачено: ${head(doc)}` : `Оплачено частично: ${head(doc)}`, body: lines(`${moneyText(payment.amount, doc.currency, 'ru')} — ${dayText(payment.paidOn, 'ru', doc.regional)}`, full ? '' : `Оплачено ${moneyText(doc.paid, doc.currency, 'ru')} из ${moneyText(doc.amount, doc.currency, 'ru')}`, actor) },
  }),
  delivered: ({ doc, partial, actor }) => ({
    en: { title: partial ? `Partly delivered: ${head(doc)}` : `Delivered: ${head(doc)}`, body: lines(actor) },
    ru: { title: partial ? `Поставлено частично: ${head(doc)}` : `Поставлено: ${head(doc)}`, body: lines(actor) },
  }),
  assigned: ({ doc, actor }) => ({
    en: { title: `You are responsible for ${head(doc)}`, body: lines(moneyText(doc.amount, doc.currency, 'en'), actor) },
    ru: { title: `Вы ответственный по заявке ${head(doc)}`, body: lines(moneyText(doc.amount, doc.currency, 'ru'), actor) },
  }),
  paySoon: ({ doc }) => ({
    en: { title: `Payment due ${dayText(doc.payBy, 'en', doc.regional)}: ${head(doc)}`, body: lines(`Left to pay: ${moneyText(doc.remaining, doc.currency, 'en')}`) },
    ru: { title: `Оплатить до ${dayText(doc.payBy, 'ru', doc.regional)}: ${head(doc)}`, body: lines(`Осталось оплатить: ${moneyText(doc.remaining, doc.currency, 'ru')}`) },
  }),
  payOverdue: ({ doc }) => ({
    en: { title: `Payment overdue: ${head(doc)}`, body: lines(`Was due ${dayText(doc.payBy, 'en', doc.regional)}`, `Left to pay: ${moneyText(doc.remaining, doc.currency, 'en')}`) },
    ru: { title: `Просрочена оплата: ${head(doc)}`, body: lines(`Срок был ${dayText(doc.payBy, 'ru', doc.regional)}`, `Осталось оплатить: ${moneyText(doc.remaining, doc.currency, 'ru')}`) },
  }),
  deliverSoon: ({ doc }) => ({
    en: { title: `Delivery due ${dayText(doc.deliverBy, 'en', doc.regional)}: ${head(doc)}`, body: lines(doc.supplier ? `Supplier: ${doc.supplier}` : '') },
    ru: { title: `Поставить до ${dayText(doc.deliverBy, 'ru', doc.regional)}: ${head(doc)}`, body: lines(doc.supplier ? `Поставщик: ${doc.supplier}` : '') },
  }),
  deliverOverdue: ({ doc }) => ({
    en: { title: `Delivery overdue: ${head(doc)}`, body: lines(`Was due ${dayText(doc.deliverBy, 'en', doc.regional)}`, doc.supplier ? `Supplier: ${doc.supplier}` : '') },
    ru: { title: `Просрочена поставка: ${head(doc)}`, body: lines(`Срок был ${dayText(doc.deliverBy, 'ru', doc.regional)}`, doc.supplier ? `Поставщик: ${doc.supplier}` : '') },
  }),
};

/** `render` for notify(): the recipient's language and regional settings (dates). */
export function procurementMessage(kind, params) {
  return (locale, regional) => {
    const texts = PROCUREMENT_MESSAGES[kind]({ ...params, doc: { ...params.doc, regional: regional || null } });
    return texts[locale] || texts.en;
  };
}
