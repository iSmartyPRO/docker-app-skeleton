export default {
  notify: {
    quoted: '«{title}»',
    by: 'Автор действия: {actor}',
    due: 'Срок: {date}',
    stage: 'Этап: {stage}',
    request: {
      title: 'Ждёт вашего согласования: {doc}',
      delegated: '{actor} передал(а) вам согласование: {doc}',
    },
    question: {
      title: '{actor} задаёт вопрос: {doc}',
      body: 'Ответьте, чтобы вернуть документ на согласование.',
    },
    answer: {
      title: '{actor} ответил(а): {doc}',
      body: 'Документ снова ждёт вашего решения.',
    },
    approved: { title: 'Согласовано: {doc}' },
    progress: { title: 'Этап «{stage}» согласован: {doc}' },
    rejected: { title: 'Отклонено: {doc}' },
    returned: {
      title: 'Возвращено на доработку: {doc}',
      body: 'Внесите правки и отправьте заново.',
    },
    withdrawn: { title: 'Автор отозвал документ: {doc}' },
    reminder: { title: 'Напоминание: {doc} ждёт вашего решения' },
    overdue: { title: 'Просрочено согласование: {doc}' },
    escalation: {
      title: 'Эскалация: просрочено согласование {doc}',
      waiting: 'Ждёт: {approvers}',
    },
    noApprovers: {
      title: 'Некому согласовать {doc}',
      body: 'На этапе «{stage}» нет активных согласующих. Проверьте маршрут.',
    },
  },
};
