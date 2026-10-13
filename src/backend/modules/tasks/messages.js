import { formatDateTime } from '../../services/datetime.js';

/** Notification texts for the tasks module, per recipient language. */

const PRIORITY = {
  en: ['Low', 'Normal', 'High', 'Urgent'],
  ru: ['Низкий', 'Обычный', 'Высокий', 'Срочный'],
};

export const TASK_MESSAGES = {
  assigned: ({ ref, title, actor, project, acceptByText }) => ({
    en: { title: `${ref} is assigned to you`, body: `${title}\n${actor ? `${actor} · ` : ''}${project}${acceptByText ? `\nPlease accept it by ${acceptByText}` : ''}` },
    ru: { title: `Вам назначена задача ${ref}`, body: `${title}\n${actor ? `${actor} · ` : ''}${project}${acceptByText ? `\nПримите её в работу до ${acceptByText}` : ''}` },
  }),
  accepted: ({ ref, title, actor, comment }) => ({
    en: { title: `${ref} is accepted`, body: `${title}\n${actor}${comment ? `: “${comment}”` : ''}` },
    ru: { title: `Задача ${ref} принята в работу`, body: `${title}\n${actor}${comment ? `: «${comment}»` : ''}` },
  }),
  acceptOverdue: ({ ref, title, hours }) => ({
    en: { title: `Accept ${ref}: waiting ${hours} h`, body: `${title}\nThe originator is waiting for you to accept the task or discuss it.` },
    ru: { title: `Примите задачу ${ref}: ждёт ${hours} ч`, body: `${title}\nПостановщик ждёт, что вы примете задачу или обсудите её.` },
  }),
  notAccepted: ({ ref, title, hours, assignee }) => ({
    en: { title: `${ref} is not accepted in ${hours} h`, body: `${title}${assignee ? `\nAssignee: ${assignee}` : ''}` },
    ru: { title: `Задача ${ref} не принята за ${hours} ч`, body: `${title}${assignee ? `\nИсполнитель: ${assignee}` : ''}` },
  }),
  status: ({ ref, title, actor, status }) => ({
    en: { title: `${ref}: status changed to “${status}”`, body: `${title}${actor ? `\n${actor}` : ''}` },
    ru: { title: `${ref}: статус «${status}»`, body: `${title}${actor ? `\n${actor}` : ''}` },
  }),
  comment: ({ ref, title, actor, snippet }) => ({
    en: { title: `New comment on ${ref}`, body: `${actor}: ${snippet}\n${title}` },
    ru: { title: `Новый комментарий в ${ref}`, body: `${actor}: ${snippet}\n${title}` },
  }),
  mention: ({ ref, title, actor, snippet }) => ({
    en: { title: `${actor} mentioned you in ${ref}`, body: `${snippet}\n${title}` },
    ru: { title: `Вас упомянули в ${ref}`, body: `${actor}: ${snippet}\n${title}` },
  }),
  priority: ({ ref, title, priority }) => ({
    en: { title: `${ref}: priority is now ${PRIORITY.en[priority]}`, body: title },
    ru: { title: `${ref}: приоритет «${PRIORITY.ru[priority]}»`, body: title },
  }),
  dueSoon: ({ ref, title, due }) => ({
    en: { title: `${ref} is due within 24 hours`, body: due ? `${title}\nDeadline: ${due}` : title },
    ru: { title: `Срок задачи ${ref} истекает в течение суток`, body: due ? `${title}\nКрайний срок: ${due}` : title },
  }),
  projectNew: ({ ref, title, actor, project }) => ({
    en: { title: `New task in ${project}: ${ref}`, body: `${title}${actor ? `\n${actor}` : ''}` },
    ru: { title: `Новая задача в «${project}»: ${ref}`, body: `${title}${actor ? `\n${actor}` : ''}` },
  }),
  projectDone: ({ ref, title, actor, project }) => ({
    en: { title: `${ref} is done (${project})`, body: `${title}${actor ? `\n${actor}` : ''}` },
    ru: { title: `Задача ${ref} завершена («${project}»)`, body: `${title}${actor ? `\n${actor}` : ''}` },
  }),
  overdue: ({ ref, title }) => ({
    en: { title: `${ref} is overdue`, body: title },
    ru: { title: `Задача ${ref} просрочена`, body: title },
  }),
};

/**
 * `render` for notify(): picks the recipient's language. A `dueAt` param is
 * shown as `due` in the recipient's region settings (zone and formats).
 */
export function taskMessage(kind, params) {
  return (locale, regional) => {
    const due = params.dueAt ? formatDateTime(params.dueAt, regional || undefined, locale) : '';
    const acceptByText = params.acceptBy ? formatDateTime(params.acceptBy, regional || undefined, locale) : '';
    const texts = TASK_MESSAGES[kind]({ ...params, due, acceptByText });
    return texts[locale] || texts.en;
  };
}

/** Text of a custom reminder ("remind me" on a task) for one recipient. */
export function reminderText(locale, regional, { ref, title, dueAt }) {
  const due = dueAt ? formatDateTime(dueAt, regional || undefined, locale) : '';
  return locale === 'ru'
    ? { title: `Напоминание: ${ref}`, body: `${title}${due ? `\nКрайний срок: ${due}` : ''}` }
    : { title: `Reminder: ${ref}`, body: `${title}${due ? `\nDeadline: ${due}` : ''}` };
}
