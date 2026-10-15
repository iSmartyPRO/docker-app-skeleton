import { formatDate } from '../../services/datetime.js';

/*
 * Notification texts of the Contracts module, per recipient language and
 * region settings (dates in their format). Pattern: crm/messages.js.
 */

const STATUS = {
  ru: { draft: 'Проект', approval: 'На согласовании', question: 'Нужен ответ', approved: 'Согласован', signed: 'Подписан', active: 'Действует', expiring: 'Истекает', completed: 'Завершён', rejected: 'Отклонён', terminated: 'Расторгнут' },
  en: { draft: 'Draft', approval: 'In approval', question: 'Answer needed', approved: 'Approved', signed: 'Signed', active: 'In force', expiring: 'Expiring', completed: 'Completed', rejected: 'Rejected', terminated: 'Terminated' },
};
const IMPORTANCE = { ru: { high: 'высокая', medium: 'средняя', low: 'низкая' }, en: { high: 'high', medium: 'medium', low: 'low' } };
const ROLE = { ru: { lawyer: 'юристом', owner: 'ответственным' }, en: { lawyer: 'the lawyer', owner: 'the business owner' } };

const DEPOSIT_STATUS = {
  ru: { expected: 'ожидается', received: 'получен', credited: 'зачтён в оплату', returned: 'возвращён', forfeited: 'удержан' },
  en: { expected: 'expected', received: 'received', credited: 'credited to the price', returned: 'returned', forfeited: 'retained' },
};
const SYMBOL = { KGS: { ru: 'сом', en: 'KGS' } };

/** "5 000 USD" / "120 000 сом" with the recipient's separators (as procurement/messages.js). */
export function moneyText(amount, currency, locale = 'ru') {
  if (amount === null || amount === undefined) return '';
  const value = Number(amount);
  const digits = Number.isInteger(value) ? 0 : 2;
  const number = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value);
  return `${number} ${SYMBOL[currency]?.[locale] || currency || ''}`.trim();
}

const lines = (...parts) => parts.filter(Boolean).join('\n');
const day = (value, locale, regional) => (value ? formatDate(value, regional || undefined, locale) : '');
const name = (c) => `${c.number} «${c.title}»`;
const nameEn = (c) => `${c.number} “${c.title}”`;
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const daysRu = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const daysEn = (n) => `${n} day${n === 1 ? '' : 's'}`;

export const CONTRACT_MESSAGES = {
  assigned: ({ contract, role, actor }) => ({
    ru: { title: `Вы назначены ${ROLE.ru[role]} по договору ${name(contract)}`, body: lines(contract.counterparty, actor) },
    en: { title: `You are ${ROLE.en[role]} of contract ${nameEn(contract)}`, body: lines(contract.counterparty, actor) },
  }),
  status: ({ contract, status, actor, comment, regional }) => ({
    ru: {
      title: `Договор ${name(contract)}: ${STATUS.ru[status] || status}`,
      body: lines(status === 'expiring' && contract.endsOn ? `Окончание ${day(contract.endsOn, 'ru', regional)}` : '', comment, actor),
    },
    en: {
      title: `Contract ${nameEn(contract)}: ${STATUS.en[status] || status}`,
      body: lines(status === 'expiring' && contract.endsOn ? `Ends ${day(contract.endsOn, 'en', regional)}` : '', comment, actor),
    },
  }),
  prolonged: ({ contract, endsOn, regional }) => ({
    ru: { title: `Договор ${name(contract)} пролонгирован`, body: `Новый срок — до ${day(endsOn, 'ru', regional)}` },
    en: { title: `Contract ${nameEn(contract)} was prolonged`, body: `New term until ${day(endsOn, 'en', regional)}` },
  }),
  version: ({ contract, no, comment, actor }) => ({
    ru: { title: `Новая версия ${no} договора ${name(contract)}`, body: lines(comment ? `Что изменено: ${comment}` : '', actor) },
    en: { title: `New version ${no} of contract ${nameEn(contract)}`, body: lines(comment ? `What changed: ${comment}` : '', actor) },
  }),
  risk: ({ contract, risk, actor }) => ({
    ru: { title: `Риск #${risk.no} (${IMPORTANCE.ru[risk.importance]}) в договоре ${name(contract)}`, body: lines(risk.clause ? `Пункт ${risk.clause}` : '', risk.text, actor) },
    en: { title: `Risk #${risk.no} (${IMPORTANCE.en[risk.importance]}) in contract ${nameEn(contract)}`, body: lines(risk.clause ? `Clause ${risk.clause}` : '', risk.text, actor) },
  }),
  reminderEnd: ({ contract, left, target, regional }) => ({
    ru: { title: `Договор ${name(contract)} заканчивается через ${daysRu(left)}`, body: lines(`Окончание ${day(target, 'ru', regional)}`, contract.counterparty) },
    en: { title: `Contract ${nameEn(contract)} ends in ${daysEn(left)}`, body: lines(`Ends ${day(target, 'en', regional)}`, contract.counterparty) },
  }),
  reminderNotice: ({ contract, left, target, regional }) => ({
    ru: {
      title: `Договор ${name(contract)}: отказ от пролонгации — до ${day(target, 'ru', regional)}`,
      body: lines(left === 0 ? 'Сегодня последний день, чтобы уведомить об отказе' : `Осталось ${daysRu(left)}, чтобы уведомить об отказе`, contract.endsOn ? `Иначе договор продлится после ${day(contract.endsOn, 'ru', regional)}` : ''),
    },
    en: {
      title: `Contract ${nameEn(contract)}: refuse prolongation by ${day(target, 'en', regional)}`,
      body: lines(left === 0 ? 'Today is the last day to send the refusal' : `${daysEn(left)} left to send the refusal`, contract.endsOn ? `Otherwise it renews after ${day(contract.endsOn, 'en', regional)}` : ''),
    },
  }),
  // ── Deposit and payments ──
  depositReceived: ({ contract, deposit, actor, regional }) => ({
    ru: {
      title: `${deposit.kind === 'advance' ? 'Аванс' : 'Задаток'} получен: договор ${name(contract)}`,
      body: lines(`${moneyText(deposit.amount, deposit.currency, 'ru')} — ${day(deposit.receivedOn, 'ru', regional)}`, contract.counterparty, actor),
    },
    en: {
      title: `${deposit.kind === 'advance' ? 'Advance' : 'Deposit'} received: contract ${nameEn(contract)}`,
      body: lines(`${moneyText(deposit.amount, deposit.currency, 'en')} — ${day(deposit.receivedOn, 'en', regional)}`, contract.counterparty, actor),
    },
  }),
  depositStatus: ({ contract, deposit, actor }) => ({
    ru: { title: `${deposit.kind === 'advance' ? 'Аванс' : 'Задаток'} по договору ${name(contract)}: ${DEPOSIT_STATUS.ru[deposit.status]}`, body: lines(deposit.settledAmount ? moneyText(deposit.settledAmount, deposit.currency, 'ru') : '', deposit.note, actor) },
    en: { title: `${deposit.kind === 'advance' ? 'Advance' : 'Deposit'} of contract ${nameEn(contract)}: ${DEPOSIT_STATUS.en[deposit.status]}`, body: lines(deposit.settledAmount ? moneyText(deposit.settledAmount, deposit.currency, 'en') : '', deposit.note, actor) },
  }),
  paymentReceived: ({ contract, payment, totals, actor, regional }) => ({
    ru: {
      title: `${totals.full ? 'Оплачен полностью' : 'Поступила оплата'}: договор ${name(contract)}`,
      body: lines(`${moneyText(payment.amount, contract.currency, 'ru')} — ${day(payment.paidOn, 'ru', regional)}`, `Оплачено ${moneyText(totals.paid, contract.currency, 'ru')} из ${moneyText(totals.total, contract.currency, 'ru')} (${totals.percent} %)`, actor),
    },
    en: {
      title: `${totals.full ? 'Paid in full' : 'Payment received'}: contract ${nameEn(contract)}`,
      body: lines(`${moneyText(payment.amount, contract.currency, 'en')} — ${day(payment.paidOn, 'en', regional)}`, `Paid ${moneyText(totals.paid, contract.currency, 'en')} of ${moneyText(totals.total, contract.currency, 'en')} (${totals.percent}%)`, actor),
    },
  }),
  paymentDue: ({ contract, row, left, regional }) => ({
    ru: {
      title: left === 0 ? `Сегодня платёж по договору ${name(contract)}` : `Платёж по договору ${name(contract)} через ${daysRu(left)}`,
      body: lines(`${moneyText(row.left, contract.currency, 'ru')} — до ${day(row.dueOn, 'ru', regional)}`, contract.counterparty),
    },
    en: {
      title: left === 0 ? `Payment due today: contract ${nameEn(contract)}` : `Payment due in ${daysEn(left)}: contract ${nameEn(contract)}`,
      body: lines(`${moneyText(row.left, contract.currency, 'en')} — by ${day(row.dueOn, 'en', regional)}`, contract.counterparty),
    },
  }),
  paymentOverdue: ({ contract, row, regional }) => ({
    ru: { title: `Платёж просрочен: договор ${name(contract)}`, body: lines(`${moneyText(row.left, contract.currency, 'ru')} — срок был ${day(row.dueOn, 'ru', regional)}`, contract.counterparty) },
    en: { title: `Payment overdue: contract ${nameEn(contract)}`, body: lines(`${moneyText(row.left, contract.currency, 'en')} — was due ${day(row.dueOn, 'en', regional)}`, contract.counterparty) },
  }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function contractMessage(kind, params) {
  return (locale, regional) => {
    const texts = CONTRACT_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}

export const statusName = (status, locale = 'ru') => (STATUS[locale] || STATUS.en)[status] || status;
