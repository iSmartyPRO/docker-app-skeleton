import { formatDateTime } from '../../services/datetime.js';
import { formatNumber, translator } from '../../services/i18n/index.js';
import { localized } from './logic.js';

/*
 * Notification texts of approvals in the recipient's language
 * (locales/<lang>/approvals.js → notify.*; pattern: tasks/messages.js).
 */

const money = (t, amount, currency) =>
  amount === null || amount === undefined || amount === '' ? '' : `${formatNumber(t.locale, Number(amount), { maximumFractionDigits: 2 })} ${currency || ''}`.trim();
const lines = (...parts) => parts.filter(Boolean).join('\n');
const n = (key) => `approvals.notify.${key}`;

/** "Заявка на закупку ЗК-0001 «Ноутбуки»" */
function docLabel(t, doc) {
  const type = localized(doc.typeTitle, t.locale);
  const quoted = doc.title ? t(n('quoted'), { title: doc.title }) : '';
  return [type, doc.number, quoted].filter(Boolean).join(' ');
}

const quote = (value) => (value ? `“${String(value).slice(0, 300)}”` : '');
const by = (t, actor) => (actor ? t(n('by'), { actor }) : '');
const due = (t, value, regional) => (value ? t(n('due'), { date: formatDateTime(value, regional, t.locale) }) : '');
const stageLine = (t, stage) => (stage ? t(n('stage'), { stage }) : '');

const MESSAGES = {
  request: (t, { doc, actor, stage, delegated, comment }, regional) => ({
    title: delegated ? t(n('request.delegated'), { actor, doc: docLabel(t, doc) }) : t(n('request.title'), { doc: docLabel(t, doc) }),
    body: lines(money(t, doc.amount, doc.currency), stageLine(t, stage), due(t, doc.dueAt, regional), quote(comment)),
  }),
  question: (t, { doc, actor, comment }) => ({ title: t(n('question.title'), { actor, doc: docLabel(t, doc) }), body: lines(quote(comment), t(n('question.body'))) }),
  answer: (t, { doc, actor, comment }) => ({ title: t(n('answer.title'), { actor, doc: docLabel(t, doc) }), body: lines(quote(comment), t(n('answer.body'))) }),
  approved: (t, { doc }) => ({ title: t(n('approved.title'), { doc: docLabel(t, doc) }), body: money(t, doc.amount, doc.currency) }),
  progress: (t, { doc, actor, stage }) => ({ title: t(n('progress.title'), { stage, doc: docLabel(t, doc) }), body: by(t, actor) }),
  rejected: (t, { doc, actor, comment }) => ({ title: t(n('rejected.title'), { doc: docLabel(t, doc) }), body: lines(quote(comment), by(t, actor)) }),
  returned: (t, { doc, actor, comment }) => ({ title: t(n('returned.title'), { doc: docLabel(t, doc) }), body: lines(quote(comment), by(t, actor), t(n('returned.body'))) }),
  withdrawn: (t, { doc, actor }) => ({ title: t(n('withdrawn.title'), { doc: docLabel(t, doc) }), body: by(t, actor) }),
  reminder: (t, { doc }, regional) => ({ title: t(n('reminder.title'), { doc: docLabel(t, doc) }), body: lines(money(t, doc.amount, doc.currency), due(t, doc.dueAt, regional)) }),
  overdue: (t, { doc }, regional) => ({ title: t(n('overdue.title'), { doc: docLabel(t, doc) }), body: lines(money(t, doc.amount, doc.currency), due(t, doc.dueAt, regional)) }),
  escalation: (t, { doc, stage, approvers }, regional) => ({
    title: t(n('escalation.title'), { doc: docLabel(t, doc) }),
    body: lines(stageLine(t, stage), approvers ? t(n('escalation.waiting'), { approvers }) : '', due(t, doc.dueAt, regional)),
  }),
  noApprovers: (t, { doc, stage }) => ({ title: t(n('noApprovers.title'), { doc: docLabel(t, doc) }), body: t(n('noApprovers.body'), { stage }) }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function approvalMessage(kind, params) {
  return (locale, regional) => MESSAGES[kind](translator(locale), params, regional || undefined);
}
