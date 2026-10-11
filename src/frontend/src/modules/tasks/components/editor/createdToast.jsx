import dayjs from 'dayjs';

/**
 * "Task WEB-12 created · deadline Sun 19 Oct → In the calendar": the toast
 * tells where the new task went, so a deadline next week is not a surprise.
 */
export function createdToast(message, t, locale, task, navigate, text) {
  const due = task?.dueAt ? dayjs(task.dueAt) : null;
  message.success({
    duration: 6,
    content: (
      <span className="tk-created">
        {text || t('tasks.created', { ref: task.ref })}
        {due && (
          <>
            {' · '}
            {t('tasks.v2.toast.due', { date: due.toDate().toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) })}{' '}
            <button type="button" className="tk-created__link" onClick={() => navigate(`/app/calendar?date=${due.format('YYYY-MM-DD')}`)}>
              {t('tasks.v2.toast.calendar')} →
            </button>
          </>
        )}
      </span>
    ),
  });
}
