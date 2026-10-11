import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { useWidgetData } from '../api';
import { WidgetState, cap, dayTitle, localeTag, timeOf } from './common';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local day keys an event covers (all-day ends are exclusive). */
function daysOf(event) {
  const start = event.allDay ? new Date(`${event.start}T00:00:00`) : new Date(event.start);
  const end = event.allDay ? new Date(new Date(`${event.end}T00:00:00`).getTime() - 1) : new Date(new Date(event.end).getTime() - 1);
  const keys = [];
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 62 && day <= end; i += 1) {
    keys.push(keyOf(day));
    day.setDate(day.getDate() + 1);
  }
  return keys.length ? keys : [keyOf(start)];
}

function EventRow({ event }) {
  const { t, locale } = useLocale();
  const live = !event.allDay && new Date(event.start) <= new Date() && new Date(event.end) > new Date();
  const soon = !event.allDay && new Date(event.start) - new Date() < 15 * 60000 && new Date(event.start) > new Date();
  return (
    <li>
      <Link to={`/app/calendar/e/${event.id}`} className={`dw-event${live ? ' is-live' : ''}`} style={{ '--c': event.color || 'var(--dc-accent)' }}>
        <span className="dw-event__time">
          {event.allDay ? (
            t('dashboard.agenda.allDay')
          ) : (
            <>
              <b>{timeOf(event.start, locale)}</b>
              <em>{timeOf(event.end, locale)}</em>
            </>
          )}
        </span>
        <span className="dw-event__bar" />
        <span className="dw-event__body">
          <strong>{event.title}</strong>
          <em>
            {live && <span className="dw-live">{t('dashboard.agenda.now')}</span>}
            {event.location || event.calendarName}
          </em>
        </span>
        {event.meetingUrl && (live || soon) && (
          <button
            type="button"
            className="dw-join"
            onClick={(clickEvent) => {
              clickEvent.preventDefault();
              window.open(event.meetingUrl, '_blank', 'noopener');
            }}
          >
            {t('dashboard.welcome.join')}
          </button>
        )}
      </Link>
    </li>
  );
}

// ── Agenda ──────────────────────────────────────────────────────────────────

export function Agenda({ widget }) {
  const { t, locale } = useLocale();
  const state = useWidgetData('agenda', widget.settings, { every: 2 * 60 * 1000 });
  const groups = useMemo(() => {
    const data = state.data;
    if (!data) return [];
    const map = new Map();
    const today = keyOf(new Date());
    const push = (key, entry) => {
      if (key < today) key = today;
      if (!map.has(key)) map.set(key, { events: [], tasks: [] });
      map.get(key)[entry.kind].push(entry.item);
    };
    data.events.forEach((event) => push(daysOf(event)[0], { kind: 'events', item: event }));
    data.tasks.forEach((task) => push(keyOf(new Date(task.dueAt)), { kind: 'tasks', item: task }));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state.data]);
  return (
    <WidgetState state={state} empty={state.data && !groups.length ? t('dashboard.agenda.free', { n: widget.settings.days || 7 }) : null} emptyIcon="☕">
      <div className="dw-agenda">
        {groups.map(([key, group]) => {
          const [y, m, d] = key.split('-').map(Number);
          const date = new Date(y, m - 1, d);
          return (
            <section key={key}>
              <h4>
                <span className="dw-agenda__day">{date.getDate()}</span>
                <span>
                  <b>{dayTitle(date, locale, t)}</b>
                  <em>{date.toLocaleDateString(localeTag(locale), { weekday: 'long', day: 'numeric', month: 'long' })}</em>
                </span>
              </h4>
              <ul className="dw-list">
                {group.events.map((event) => (
                  <EventRow key={event.key} event={event} />
                ))}
                {group.tasks.map((task) => (
                  <li key={`t${task.id}`}>
                    <Link to={`/app/tasks/${task.ref}`} className="dw-event is-task" style={{ '--c': task.color }}>
                      <span className="dw-event__time">☐</span>
                      <span className="dw-event__bar" />
                      <span className="dw-event__body">
                        <strong>{task.title}</strong>
                        <em>
                          {task.ref} · {task.project}
                        </em>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </WidgetState>
  );
}

// ── Month ───────────────────────────────────────────────────────────────────

export function MiniCalendar({ widget, size }) {
  const { t, locale } = useLocale();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [picked, setPicked] = useState(() => keyOf(new Date()));
  // Weeks start on Monday in Russian, Sunday in English.
  const weekStart = locale === 'ru' ? 1 : 0;
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() - weekStart + 7) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const extra = useMemo(() => ({ from: cells[0].toISOString(), to: new Date(cells[41].getTime() + 86400000).toISOString() }), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useWidgetData('miniCalendar', widget.settings, { extra });
  const byDay = useMemo(() => {
    const map = new Map();
    (state.data?.events || []).forEach((event) =>
      daysOf(event).forEach((key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(event);
      })
    );
    return map;
  }, [state.data]);
  const today = keyOf(new Date());
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + weekStart + i).toLocaleDateString(localeTag(locale), { weekday: 'narrow' }));
  const list = byDay.get(picked) || [];
  const showList = size.h >= 5;
  const shift = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className={`dw-month${showList ? '' : ' is-compact'}`}>
      <div className="dw-month__head">
        <strong>{cap(month.toLocaleDateString(localeTag(locale), { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, ''))}</strong>
        <span>
          <button type="button" onClick={() => shift(-1)} aria-label="‹">‹</button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setPicked(today);
            }}
          >
            {t('dashboard.today')}
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="›">›</button>
        </span>
      </div>
      <div className="dw-month__grid">
        {names.map((name, i) => (
          <span key={`n${i}`} className="dw-month__name">{name}</span>
        ))}
        {cells.map((date) => {
          const key = keyOf(date);
          const events = byDay.get(key) || [];
          return (
            <button
              type="button"
              key={key}
              className={`dw-month__cell${date.getMonth() !== month.getMonth() ? ' is-out' : ''}${key === today ? ' is-today' : ''}${key === picked ? ' is-picked' : ''}`}
              onClick={() => setPicked(key)}
            >
              <span>{date.getDate()}</span>
              {events.length > 0 && (
                <i className="dw-month__dots">
                  {events.slice(0, 3).map((event) => (
                    <b key={event.key} style={{ background: event.color || 'var(--dc-accent)' }} />
                  ))}
                </i>
              )}
            </button>
          );
        })}
      </div>
      {showList && (
        <div className="dw-month__list">
          <h5>{dayTitle(new Date(`${picked}T12:00:00`), locale, t)}</h5>
          {list.length ? (
            <ul className="dw-list">
              {list.slice(0, 6).map((event) => (
                <EventRow key={event.key} event={event} />
              ))}
            </ul>
          ) : (
            <span className="dw-muted">{t('dashboard.agenda.noEvents')}</span>
          )}
        </div>
      )}
    </div>
  );
}
