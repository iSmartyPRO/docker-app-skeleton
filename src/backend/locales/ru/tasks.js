export default {
  priority: ['Низкий', 'Обычный', 'Высокий', 'Срочный'],
  noProject: 'Без проекта',
  starter: {
    name: 'Общие задачи',
    description: 'Задачи команды, которые не относятся к отдельному проекту.',
  },
  statuses: ['К выполнению', 'В работе', 'На проверке', 'Готово'],
  notify: {
    deadline: 'Крайний срок: {due}',
    assigned: {
      title: 'Вам назначена задача {ref}',
      acceptBy: 'Примите её в работу до {time}',
    },
    accepted: {
      title: 'Задача {ref} принята в работу',
      comment: ': «{comment}»',
    },
    acceptOverdue: {
      title: 'Примите задачу {ref}: ждёт {hours} ч',
      body: 'Постановщик ждёт, что вы примете задачу или обсудите её.',
    },
    notAccepted: {
      title: 'Задача {ref} не принята за {hours} ч',
      assignee: 'Исполнитель: {name}',
    },
    status: { title: '{ref}: статус «{status}»' },
    comment: { title: 'Новый комментарий в {ref}' },
    mention: {
      title: 'Вас упомянули в {ref}',
      body: '{actor}: {snippet}\n{title}',
    },
    priority: { title: '{ref}: приоритет «{priority}»' },
    dueSoon: { title: 'Срок задачи {ref} истекает в течение суток' },
    projectNew: { title: 'Новая задача в «{project}»: {ref}' },
    projectDone: { title: 'Задача {ref} завершена («{project}»)' },
    overdue: { title: 'Задача {ref} просрочена' },
    reminder: { title: 'Напоминание: {ref}' },
    result: { title: 'Результат по задаче {ref}' },
  },
};
