import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { useLocale } from '../../../context/LocaleContext';
import api from '../../../services/api';
import { Hint } from '../../../help/Hint';

/**
 * My open tasks without a deadline: drag one onto the calendar to give it a
 * deadline on that day (and time), or open it with a click.
 */
export default function UndatedTasks({ version, onOpen }) {
  const { t } = useLocale();
  const [tasks, setTasks] = useState(null);
  const [all, setAll] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    api
      .get('/app/tasks/tasks', { params: { role: 'doing', open: '1', nodue: '1', deferred: '0', sort: 'updated', limit: 30 } })
      .then((res) => setTasks(res.data.tasks))
      .catch(() => setTasks([]));
  }, [version]);

  useEffect(() => {
    if (!box.current) return undefined;
    const draggable = new Draggable(box.current, {
      itemSelector: '.cal-undated__item',
      eventData: (el) => ({ title: el.dataset.title, create: false, duration: '00:30' }),
    });
    return () => draggable.destroy();
  }, [tasks]);

  if (!tasks || !tasks.length) return null;
  const shown = all ? tasks : tasks.slice(0, 6);
  return (
    <div className="cal-undated">
      <div className="mod-side__label">
        <span className="hp-label">
          {t('calendarTasks.undated')}
          <Hint id="calendar.undated" />
        </span>
        <em>{tasks.length}</em>
      </div>
      <div ref={box} className="cal-undated__list">
        {shown.map((task) => (
          <button key={task.id} type="button" className="cal-undated__item" data-ref={task.ref} data-title={`${task.ref} · ${task.title}`} onClick={() => onOpen(task)} title={t('calendarTasks.dragHint')}>
            <span className="cal-undated__grip" aria-hidden="true">⋮⋮</span>
            <span className="cal-undated__text">
              {task.important && '🔥 '}
              {task.title}
              <em>{task.ref}</em>
            </span>
          </button>
        ))}
      </div>
      {tasks.length > 6 && (
        <button type="button" className="cal-link" onClick={() => setAll(!all)}>
          {all ? t('calendarTasks.less') : t('calendarTasks.more', { n: tasks.length - 6 })}
        </button>
      )}
      <p className="cal-undated__hint">{t('calendarTasks.dragHint')}</p>
    </div>
  );
}
