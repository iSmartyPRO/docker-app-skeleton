import { formatDateTime } from '../../services/datetime.js';
import { localized } from './logic.js';

/** Notification texts of approvals, per recipient language (pattern: crm/messages.js). */

const money = (amount, currency, locale) =>
  amount === null || amount === undefined || amount === '' ? '' : `${Number(amount).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 2 })} ${currency || ''}`.trim();
const lines = (...parts) => parts.filter(Boolean).join('\n');

/** "Заявка на закупку ЗК-0001 «Ноутбуки»" */
function docLabel(doc, locale) {
  const type = localized(doc.typeTitle, locale);
  const quoted = locale === 'en' ? `“${doc.title}”` : `«${doc.title}»`;
  return [type, doc.number, quoted].filter(Boolean).join(' ');
}

const quote = (value) => (value ? `“${String(value).slice(0, 300)}”` : '');
const by = (actor, locale) => (actor ? (locale === 'en' ? `By ${actor}` : `Автор действия: ${actor}`) : '');
const due = (value, locale, regional) => (value ? (locale === 'en' ? `Due: ${formatDateTime(value, regional, 'en')}` : `Срок: ${formatDateTime(value, regional, 'ru')}`) : '');

const MESSAGES = {
  request: ({ doc, actor, stage, delegated, comment }, locale, regional) => ({
    title: delegated
      ? locale === 'en'
        ? `${actor} passed an approval to you: ${docLabel(doc, 'en')}`
        : `${actor} передал(а) вам согласование: ${docLabel(doc, 'ru')}`
      : locale === 'en'
        ? `Waiting for your approval: ${docLabel(doc, 'en')}`
        : `Ждёт вашего согласования: ${docLabel(doc, 'ru')}`,
    body: lines(money(doc.amount, doc.currency, locale), stage ? (locale === 'en' ? `Stage: ${stage}` : `Этап: ${stage}`) : '', due(doc.dueAt, locale, regional), quote(comment)),
  }),
  question: ({ doc, actor, comment }, locale) => ({
    title: locale === 'en' ? `${actor} asks about ${docLabel(doc, 'en')}` : `${actor} задаёт вопрос: ${docLabel(doc, 'ru')}`,
    body: lines(quote(comment), locale === 'en' ? 'Answer to return it to approval.' : 'Ответьте, чтобы вернуть документ на согласование.'),
  }),
  answer: ({ doc, actor, comment }, locale) => ({
    title: locale === 'en' ? `${actor} answered: ${docLabel(doc, 'en')}` : `${actor} ответил(а): ${docLabel(doc, 'ru')}`,
    body: lines(quote(comment), locale === 'en' ? 'The document is back on your approval.' : 'Документ снова ждёт вашего решения.'),
  }),
  approved: ({ doc }, locale) => ({
    title: locale === 'en' ? `Approved: ${docLabel(doc, 'en')}` : `Согласовано: ${docLabel(doc, 'ru')}`,
    body: money(doc.amount, doc.currency, locale),
  }),
  progress: ({ doc, actor, stage }, locale) => ({
    title: locale === 'en' ? `Stage “${stage}” approved: ${docLabel(doc, 'en')}` : `Этап «${stage}» согласован: ${docLabel(doc, 'ru')}`,
    body: by(actor, locale),
  }),
  rejected: ({ doc, actor, comment }, locale) => ({
    title: locale === 'en' ? `Rejected: ${docLabel(doc, 'en')}` : `Отклонено: ${docLabel(doc, 'ru')}`,
    body: lines(quote(comment), by(actor, locale)),
  }),
  returned: ({ doc, actor, comment }, locale) => ({
    title: locale === 'en' ? `Returned for rework: ${docLabel(doc, 'en')}` : `Возвращено на доработку: ${docLabel(doc, 'ru')}`,
    body: lines(quote(comment), by(actor, locale), locale === 'en' ? 'Make the changes and send it again.' : 'Внесите правки и отправьте заново.'),
  }),
  withdrawn: ({ doc, actor }, locale) => ({
    title: locale === 'en' ? `Withdrawn by the author: ${docLabel(doc, 'en')}` : `Автор отозвал документ: ${docLabel(doc, 'ru')}`,
    body: by(actor, locale),
  }),
  reminder: ({ doc }, locale, regional) => ({
    title: locale === 'en' ? `Reminder: ${docLabel(doc, 'en')} waits for your decision` : `Напоминание: ${docLabel(doc, 'ru')} ждёт вашего решения`,
    body: lines(money(doc.amount, doc.currency, locale), due(doc.dueAt, locale, regional)),
  }),
  overdue: ({ doc }, locale, regional) => ({
    title: locale === 'en' ? `Overdue: ${docLabel(doc, 'en')}` : `Просрочено согласование: ${docLabel(doc, 'ru')}`,
    body: lines(money(doc.amount, doc.currency, locale), due(doc.dueAt, locale, regional)),
  }),
  escalation: ({ doc, stage, approvers }, locale, regional) => ({
    title: locale === 'en' ? `Escalation: ${docLabel(doc, 'en')} is overdue` : `Эскалация: просрочено согласование ${docLabel(doc, 'ru')}`,
    body: lines(
      stage ? (locale === 'en' ? `Stage: ${stage}` : `Этап: ${stage}`) : '',
      approvers ? (locale === 'en' ? `Waiting for: ${approvers}` : `Ждёт: ${approvers}`) : '',
      due(doc.dueAt, locale, regional)
    ),
  }),
  noApprovers: ({ doc, stage }, locale) => ({
    title: locale === 'en' ? `Nobody can approve ${docLabel(doc, 'en')}` : `Некому согласовать ${docLabel(doc, 'ru')}`,
    body: locale === 'en' ? `Stage “${stage}” has no active approvers. Check the route.` : `На этапе «${stage}» нет активных согласующих. Проверьте маршрут.`,
  }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function approvalMessage(kind, params) {
  return (locale, regional) => MESSAGES[kind](params, locale === 'en' ? 'en' : 'ru', regional || undefined);
}
