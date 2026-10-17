import { formatDateTime } from '../../services/datetime.js';
import { translator } from '../../services/i18n/index.js';

/*
 * Notification texts for the tasks module in the recipient's language.
 * Texts: locales/<lang>/tasks.js → notify.*; the code only joins the lines.
 */

const line = (text) => (text ? `\n${text}` : '');

export const TASK_MESSAGES = {
  assigned: (t, { ref, title, actor, project, acceptByText }) => ({
    title: t('tasks.notify.assigned.title', { ref }),
    body: `${title}\n${actor ? `${actor} · ` : ''}${project}${line(acceptByText && t('tasks.notify.assigned.acceptBy', { time: acceptByText }))}`,
  }),
  accepted: (t, { ref, title, actor, comment }) => ({
    title: t('tasks.notify.accepted.title', { ref }),
    body: `${title}\n${actor}${comment ? t('tasks.notify.accepted.comment', { comment }) : ''}`,
  }),
  acceptOverdue: (t, { ref, title, hours }) => ({ title: t('tasks.notify.acceptOverdue.title', { ref, hours }), body: `${title}\n${t('tasks.notify.acceptOverdue.body')}` }),
  notAccepted: (t, { ref, title, hours, assignee }) => ({
    title: t('tasks.notify.notAccepted.title', { ref, hours }),
    body: `${title}${line(assignee && t('tasks.notify.notAccepted.assignee', { name: assignee }))}`,
  }),
  status: (t, { ref, title, actor, status }) => ({ title: t('tasks.notify.status.title', { ref, status }), body: `${title}${line(actor)}` }),
  comment: (t, { ref, title, actor, snippet }) => ({ title: t('tasks.notify.comment.title', { ref }), body: `${actor}: ${snippet}\n${title}` }),
  mention: (t, { ref, title, actor, snippet }) => ({ title: t('tasks.notify.mention.title', { ref, actor }), body: t('tasks.notify.mention.body', { actor, snippet, title }) }),
  priority: (t, { ref, title, priority }) => ({ title: t('tasks.notify.priority.title', { ref, priority: t(`tasks.priority.${priority}`) }), body: title }),
  dueSoon: (t, { ref, title, due }) => ({ title: t('tasks.notify.dueSoon.title', { ref }), body: due ? `${title}\n${t('tasks.notify.deadline', { due })}` : title }),
  projectNew: (t, { ref, title, actor, project }) => ({ title: t('tasks.notify.projectNew.title', { ref, project }), body: `${title}${line(actor)}` }),
  projectDone: (t, { ref, title, actor, project }) => ({ title: t('tasks.notify.projectDone.title', { ref, project }), body: `${title}${line(actor)}` }),
  overdue: (t, { ref, title }) => ({ title: t('tasks.notify.overdue.title', { ref }), body: title }),
  result: (t, { ref, title, text }) => ({ title: t('tasks.notify.result.title', { ref }), body: `${title}\n${text}` }),
};

/**
 * `render` for notify(): texts in the recipient's language. A `dueAt` param is
 * shown as `due` in the recipient's region settings (zone and formats).
 */
export function taskMessage(kind, params) {
  return (locale, regional) => {
    const due = params.dueAt ? formatDateTime(params.dueAt, regional || undefined, locale) : '';
    const acceptByText = params.acceptBy ? formatDateTime(params.acceptBy, regional || undefined, locale) : '';
    return TASK_MESSAGES[kind](translator(locale), { ...params, due, acceptByText });
  };
}

/** Text of a custom reminder ("remind me" on a task) for one recipient. */
export function reminderText(locale, regional, { ref, title, dueAt }) {
  const t = translator(locale);
  const due = dueAt ? formatDateTime(dueAt, regional || undefined, locale) : '';
  return { title: t('tasks.notify.reminder.title', { ref }), body: `${title}${line(due && t('tasks.notify.deadline', { due }))}` };
}
