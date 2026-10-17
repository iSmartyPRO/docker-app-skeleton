import { formatDate } from '../../services/datetime.js';
import { moneyText, translator } from '../../services/i18n/index.js';

/*
 * Notification texts of the Contracts module in the recipient's language and
 * region settings (dates in their format). Texts: locales/<lang>/contracts.js
 * → notify.*; the code only joins the lines. Pattern: tasks/messages.js.
 */

export { moneyText };

const lines = (...parts) => parts.filter(Boolean).join('\n');
const day = (t, value, regional) => (value ? formatDate(value, regional || undefined, t.locale) : '');
const name = (t, c) => t('contracts.notify.name', { number: c.number, title: c.title });
const days = (t, n) => t('contracts.notify.days', { count: n });
const kindOf = (t, deposit) => t(`contracts.notify.depositKind.${deposit.kind === 'advance' ? 'advance' : 'deposit'}`);

/** Message builders: (t, params) → { title, body }; `t` is a translator of one language. */
export const CONTRACT_MESSAGES = {
  assigned: (t, { contract, role, actor }) => ({ title: t(`contracts.notify.assigned.${role === 'owner' ? 'owner' : 'lawyer'}`, { name: name(t, contract) }), body: lines(contract.counterparty, actor) }),
  status: (t, { contract, status, actor, comment, regional }) => ({
    title: t('contracts.notify.status.title', { name: name(t, contract), status: statusName(status, t.locale) }),
    body: lines(status === 'expiring' && contract.endsOn ? t('contracts.notify.ends', { date: day(t, contract.endsOn, regional) }) : '', comment, actor),
  }),
  prolonged: (t, { contract, endsOn, regional }) => ({ title: t('contracts.notify.prolonged.title', { name: name(t, contract) }), body: t('contracts.notify.prolonged.body', { date: day(t, endsOn, regional) }) }),
  version: (t, { contract, no, comment, actor }) => ({ title: t('contracts.notify.version.title', { no, name: name(t, contract) }), body: lines(comment ? t('contracts.notify.version.changed', { comment }) : '', actor) }),
  risk: (t, { contract, risk, actor }) => ({
    title: t('contracts.notify.risk.title', { no: risk.no, importance: t(`contracts.notify.importance.${risk.importance}`), name: name(t, contract) }),
    body: lines(risk.clause ? t('contracts.notify.risk.clause', { clause: risk.clause }) : '', risk.text, actor),
  }),
  reminderEnd: (t, { contract, left, target, regional }) => ({
    title: t('contracts.notify.reminderEnd.title', { name: name(t, contract), days: days(t, left) }),
    body: lines(t('contracts.notify.ends', { date: day(t, target, regional) }), contract.counterparty),
  }),
  reminderNotice: (t, { contract, left, target, regional }) => ({
    title: t('contracts.notify.reminderNotice.title', { name: name(t, contract), date: day(t, target, regional) }),
    body: lines(
      left === 0 ? t('contracts.notify.reminderNotice.lastDay') : t('contracts.notify.reminderNotice.left', { days: days(t, left) }),
      contract.endsOn ? t('contracts.notify.reminderNotice.renews', { date: day(t, contract.endsOn, regional) }) : ''
    ),
  }),
  // ── Deposit and payments ──
  depositReceived: (t, { contract, deposit, actor, regional }) => ({
    title: t('contracts.notify.depositReceived.title', { kind: kindOf(t, deposit), name: name(t, contract) }),
    body: lines(`${moneyText(deposit.amount, deposit.currency, t.locale)} — ${day(t, deposit.receivedOn, regional)}`, contract.counterparty, actor),
  }),
  depositStatus: (t, { contract, deposit, actor }) => ({
    title: t('contracts.notify.depositStatus.title', { kind: kindOf(t, deposit), name: name(t, contract), status: t(`contracts.notify.depositStatus.${deposit.status}`) }),
    body: lines(deposit.settledAmount ? moneyText(deposit.settledAmount, deposit.currency, t.locale) : '', deposit.note, actor),
  }),
  paymentReceived: (t, { contract, payment, totals, actor, regional }) => ({
    title: t(`contracts.notify.paymentReceived.${totals.full ? 'full' : 'part'}`, { name: name(t, contract) }),
    body: lines(
      `${moneyText(payment.amount, contract.currency, t.locale)} — ${day(t, payment.paidOn, regional)}`,
      t('contracts.notify.paymentReceived.totals', { paid: moneyText(totals.paid, contract.currency, t.locale), total: moneyText(totals.total, contract.currency, t.locale), percent: totals.percent }),
      actor
    ),
  }),
  paymentDue: (t, { contract, row, left, regional }) => ({
    title: left === 0 ? t('contracts.notify.paymentDue.today', { name: name(t, contract) }) : t('contracts.notify.paymentDue.in', { name: name(t, contract), days: days(t, left) }),
    body: lines(t('contracts.notify.paymentDue.body', { amount: moneyText(row.left, contract.currency, t.locale), date: day(t, row.dueOn, regional) }), contract.counterparty),
  }),
  paymentOverdue: (t, { contract, row, regional }) => ({
    title: t('contracts.notify.paymentOverdue.title', { name: name(t, contract) }),
    body: lines(t('contracts.notify.paymentOverdue.body', { amount: moneyText(row.left, contract.currency, t.locale), date: day(t, row.dueOn, regional) }), contract.counterparty),
  }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function contractMessage(kind, params) {
  return (locale, regional) => CONTRACT_MESSAGES[kind](translator(locale), { ...params, regional: regional || null });
}

export const statusName = (status, locale = 'ru') => {
  const text = translator(locale)(`contracts.status.${status}`);
  return text === `contracts.status.${status}` ? status : text;
};
