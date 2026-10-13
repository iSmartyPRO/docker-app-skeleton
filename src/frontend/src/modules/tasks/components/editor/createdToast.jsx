import { inZone } from '../../../../lib/datetime';
import { formatDateTime } from '../../../../lib/format';

/**
 * "Task WEB-12 created · deadline Sun 19 Oct → In the calendar": the toast
 * tells where the new task went, so a deadline next week is not a surprise.
 */
export function createdToast(message, t, locale, task, navigate, text) {
  const due = task?.dueAt ? inZone(task.dueAt) : null;
  message.success({
    duration: 6,
    content: (
      <span className="tk-created">
        {text || t('tasks.created', { ref: task.ref })}
        {due && (
          <>
            {' · '}
            {t('tasks.v2.toast.due', { date: formatDateTime(task.dueAt, locale, { weekday: 'short', day: 'numeric', month: 'short' }) })}{' '}
            <button type="button" className="tk-created__link" onClick={() => navigate(`/app/calendar?date=${due.format('YYYY-MM-DD')}`)}>
              {t('tasks.v2.toast.calendar')} →
            </button>
          </>
        )}
      </span>
    ),
  });
}
