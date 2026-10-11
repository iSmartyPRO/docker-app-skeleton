/** Notification texts for the tasks module, per recipient language. */

const PRIORITY = {
  en: ['Low', 'Normal', 'High', 'Urgent'],
  ru: ['Низкий', 'Обычный', 'Высокий', 'Срочный'],
};

export const TASK_MESSAGES = {
  assigned: ({ ref, title, actor, project }) => ({
    en: { title: `${ref} is assigned to you`, body: `${title}\n${actor ? `${actor} · ` : ''}${project}` },
    ru: { title: `Вам назначена задача ${ref}`, body: `${title}\n${actor ? `${actor} · ` : ''}${project}` },
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
  dueSoon: ({ ref, title }) => ({
    en: { title: `${ref} is due within 24 hours`, body: title },
    ru: { title: `Срок задачи ${ref} истекает в течение суток`, body: title },
  }),
  overdue: ({ ref, title }) => ({
    en: { title: `${ref} is overdue`, body: title },
    ru: { title: `Задача ${ref} просрочена`, body: title },
  }),
};

/** `render` for notify(): picks the recipient's language. */
export function taskMessage(kind, params) {
  const texts = TASK_MESSAGES[kind](params);
  return (locale) => texts[locale] || texts.en;
}
