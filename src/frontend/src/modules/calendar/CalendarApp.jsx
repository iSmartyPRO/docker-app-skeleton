import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import ruLocale from '@fullcalendar/core/locales/ru';
import { App, Button, Calendar as MiniCalendar, Drawer, Dropdown, Result, Segmented, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import { MenuIcon } from '../../components/icons/menuIcons';
import { IconGoogle } from '../../components/icons/AdminIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import api, { startGoogle } from '../../services/api';
import AccessDialog from '../shared/AccessDialog';
import { calendarApi, calendarLabel } from './api';
import EventDialog from './components/EventDialog';
import EventDetails from './components/EventDetails';
import CalendarDialog from './components/CalendarDialog';
import { askScope } from './components/scope';
import '../shared/module.css';
import './calendar.css';

const VIEWS = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay', agenda: 'listWeek' };
const HIDDEN_KEY = 'cal_hidden';

function useHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [hidden, toggle];
}

function CalendarToggle({ id, color, name, hidden, onToggle, menu }) {
  const on = !hidden.has(id);
  return (
    <div className={`cal-toggle${on ? ' is-on' : ''}`}>
      <button type="button" className="cal-toggle__main" onClick={() => onToggle(id)} aria-pressed={on}>
        <span className="cal-toggle__box" style={{ '--c': color }}>{on ? '✓' : ''}</span>
        <span className="cal-toggle__name">{name}</span>
      </button>
      {menu}
    </div>
  );
}

/** Keeps the time-grid tidy: "09:00" style labels everywhere. */
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false };

function toFcEvent(item, kind) {
  const classNames = [`is-${kind}`];
  if (item.myStatus === 'needs') classNames.push('is-pending');
  if (item.myStatus === 'declined') classNames.push('is-declined');
  return {
    id: `${kind}:${item.key}`,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: item.allDay,
    editable: Boolean(item.canEdit) && !(kind === 'google' && item.recurring),
    classNames,
    extendedProps: { kind, data: item, color: item.color },
  };
}

function taskToFc(task) {
  const due = dayjs(task.dueAt);
  const done = task.statusCategory === 'done';
  return {
    id: `task:${task.id}`,
    title: `${task.ref} · ${task.title}`,
    start: task.dueTime ? due.toISOString() : due.format('YYYY-MM-DD'),
    allDay: !task.dueTime,
    editable: false,
    classNames: ['is-task', done ? 'is-done' : '', task.overdue ? 'is-overdue' : ''].filter(Boolean),
    extendedProps: { kind: 'task', data: task, color: task.project.color || '#64748B' },
  };
}

function EventContent({ arg }) {
  const { event, timeText, view } = arg;
  const { kind, data } = event.extendedProps;
  const list = view.type.startsWith('list');
  return (
    <div className="fc-ev">
      {kind === 'task' && <span className="fc-ev__mark">✓</span>}
      {kind === 'google' && <span className="fc-ev__g"><IconGoogle size={12} /></span>}
      {!list && timeText && !event.allDay && <span className="fc-ev__time">{timeText}</span>}
      <span className="fc-ev__title">{event.title}</span>
      {data?.recurring && kind !== 'task' && <span className="fc-ev__repeat">↻</span>}
      {data?.attendees?.length > 1 && !list && <span className="fc-ev__people">{data.attendees.length}</span>}
    </div>
  );
}

function Shell() {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { id: routeEventId } = useParams();
  const calendarRef = useRef(null);
  const [home, setHome] = useState(null);
  const [error, setError] = useState(null);
  const [hidden, toggleHidden] = useHidden();
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleError, setGoogleError] = useState('');
  const [title, setTitle] = useState('');
  const [current, setCurrent] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [view, setView] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [calendarDialog, setCalendarDialog] = useState(null);
  const [accessFor, setAccessFor] = useState(null);
  const state = useRef({});

  const loadHome = useCallback(async () => {
    const res = await calendarApi.home();
    setHome(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    loadHome()
      .then((data) => {
        const narrow = window.innerWidth < 700;
        const preferred = data.config.defaultView === 'week' && narrow ? 'day' : data.config.defaultView;
        setView(VIEWS[preferred] || 'timeGridWeek');
      })
      .catch(setError);
  }, [loadHome]);

  state.current = { home, hidden };
  const refetch = useCallback(() => calendarRef.current?.getApi().refetchEvents(), []);
  useEffect(() => {
    refetch();
  }, [hidden, refetch]);

  // Deep link /app/calendar/e/:id (notifications) opens the event card.
  useEffect(() => {
    if (!routeEventId || !home) return;
    calendarApi
      .event(routeEventId)
      .then((res) => {
        setDetails(res.data.event);
        calendarRef.current?.getApi().gotoDate(res.data.event.start);
      })
      .catch((err) => message.error(errorMessage(err)));
  }, [routeEventId, home, message]);

  const portalSource = useCallback((info, success, failure) => {
    const { home: data, hidden: off } = state.current;
    if (!data) return success([]);
    const visible = data.calendars.filter((calendar) => !off.has(`c:${calendar.id}`)).map((calendar) => calendar.id);
    calendarApi
      .events({ from: info.startStr, to: info.endStr, calendars: visible.join(',') || '0', invitations: off.has('invited') ? '0' : '1' })
      .then((res) => success(res.data.events.filter((item) => !(item.invited && off.has('invited'))).map((item) => toFcEvent(item, 'portal'))))
      .catch(failure);
    return undefined;
  }, []);

  const googleSource = useCallback((info, success) => {
    const { home: data, hidden: off } = state.current;
    if (!data?.google?.calendar || off.has('google')) return success([]);
    calendarApi
      .googleEvents({ from: info.startStr, to: info.endStr })
      .then((res) => {
        setGoogleCalendars(res.data.calendars);
        setGoogleError('');
        success(res.data.items.filter((item) => !off.has(`g:${item.googleCalendarId}`)).map((item) => toFcEvent(item, 'google')));
      })
      .catch((err) => {
        setGoogleError(errorMessage(err));
        success([]);
      });
    return undefined;
  }, []);

  const taskSource = useCallback((info, success) => {
    const { home: data, hidden: off } = state.current;
    if (!data?.config?.showTasks || off.has('tasks')) return success([]);
    api
      .get('/app/tasks/calendar', { params: { from: info.startStr, to: info.endStr, mine: '1' } })
      .then((res) => success(res.data.tasks.map(taskToFc)))
      .catch(() => success([]));
    return undefined;
  }, []);

  // FullCalendar re-applies options whose identity changes: keep them stable.
  const onDatesSet = useCallback((info) => {
    setTitle(info.view.title);
    setCurrent(dayjs(info.view.currentStart).format('YYYY-MM-DD'));
  }, []);
  const renderEvent = useCallback((arg) => <EventContent arg={arg} />, []);
  const onEventMount = useCallback(({ el, event }) => el.style.setProperty('--ev', event.extendedProps.color || '#3B82F6'), []);
  const onLoading = useCallback((isLoading) => document.body.classList.toggle('cal-loading', isLoading), []);
  const onNavLinkDay = useCallback((date) => {
    setView('timeGridDay');
    calendarRef.current?.getApi().changeView('timeGridDay', date);
  }, []);
  const businessHours = useMemo(
    () => (home ? { daysOfWeek: [1, 2, 3, 4, 5], startTime: home.config.dayStart, endTime: home.config.dayEnd } : null),
    [home]
  );
  const plugins = useMemo(() => [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin], []);
  const locales = useMemo(() => [ruLocale], []);

  const eventSources = useMemo(() => [{ events: portalSource }, { events: googleSource }, { events: taskSource }], [portalSource, googleSource, taskSource]);

  const writable = (home?.calendars || []).filter((calendar) => calendar.level === 'edit' || calendar.level === 'manage');

  const onEventClick = ({ event, jsEvent }) => {
    jsEvent.preventDefault();
    const { kind, data } = event.extendedProps;
    if (kind === 'task') {
      navigate(`/app/tasks/${data.ref}`);
      return;
    }
    setDetails(data);
  };

  const onSelect = ({ start, end, allDay }) => {
    if (!writable.length && !googleCalendars.some((calendar) => calendar.writable)) return;
    setEditor({ draft: { start: start.toISOString(), end: end.toISOString(), allDay } });
    calendarRef.current?.getApi().unselect();
  };

  /** Drag & drop / resize: portal (with scope for series) or Google. */
  const onMoveEvent = async ({ event, oldEvent, revert }) => {
    const { kind, data } = event.extendedProps;
    const allDay = event.allDay;
    const start = allDay ? dayjs(event.start).format('YYYY-MM-DD') : event.start.toISOString();
    const endValue = event.end || dayjs(event.start).add(1, allDay ? 'day' : 'hour').toDate();
    const end = allDay ? dayjs(endValue).format('YYYY-MM-DD') : endValue.toISOString();
    try {
      if (kind === 'google') {
        await calendarApi.updateGoogle({ googleCalendarId: data.googleCalendarId, eventId: data.id, start, end, allDay, title: data.title });
      } else {
        let scope = 'all';
        if (data.recurring) {
          scope = await askScope(modal, t, 'edit');
          if (!scope) {
            revert();
            return;
          }
        }
        // Moving the whole series shifts its first occurrence by the same amount.
        let payload = { start, end, allDay };
        if (scope === 'all' && data.recurring) {
          const delta = dayjs(event.start).diff(dayjs(oldEvent.start));
          const duration = dayjs(endValue).diff(dayjs(event.start));
          const series = await calendarApi.event(data.id);
          const shifted = dayjs(series.data.event.start).add(delta, 'millisecond');
          const shiftedEnd = shifted.add(duration, 'millisecond');
          payload = {
            allDay,
            start: allDay ? shifted.format('YYYY-MM-DD') : shifted.toISOString(),
            end: allDay ? shiftedEnd.format('YYYY-MM-DD') : shiftedEnd.toISOString(),
          };
        }
        await calendarApi.updateEvent(data.id, { ...payload, scope, occurrence: data.occurrence });
      }
      refetch();
    } catch (err) {
      message.error(errorMessage(err));
      revert();
    }
  };

  const api_ = () => calendarRef.current?.getApi();
  const go = (action) => {
    const fc = api_();
    if (!fc) return;
    if (action === 'today') fc.today();
    if (action === 'prev') fc.prev();
    if (action === 'next') fc.next();
  };
  const changeView = (next) => {
    setView(next);
    api_()?.changeView(next);
  };

  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!home || !view) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  const { config, google } = home;

  const calendarMenu = (calendar) => {
    if (calendar.level !== 'manage') return null;
    const items = [
      { key: 'edit', label: t('calendar.editCalendar') },
      { key: 'access', label: t('kb.accessMenu') },
      ...(!calendar.personal ? [{ type: 'divider' }, { key: 'delete', danger: true, label: t('common.delete') }] : []),
    ];
    const onClick = ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === 'edit') setCalendarDialog({ calendar });
      if (key === 'access') setAccessFor(calendar);
      if (key === 'delete') {
        modal.confirm({
          title: t('calendar.deleteCalendarConfirm', { name: calendar.name }),
          content: t('calendar.deleteCalendarText'),
          okText: t('common.delete'),
          okButtonProps: { danger: true },
          cancelText: t('common.cancel'),
          onOk: async () => {
            await calendarApi.deleteCalendar(calendar.id);
            await loadHome();
            refetch();
          },
        });
      }
    };
    return (
      <Dropdown trigger={['click']} menu={{ items, onClick }}>
        <button type="button" className="cal-toggle__more" onClick={(event) => event.stopPropagation()}>⋯</button>
      </Dropdown>
    );
  };

  const sidebar = (onNavigate) => (
    <div className="mod-side cal-side">
      <div className="mod-side__brand">
        <MenuIcon name="calendar" />
        <span>{t('apps.calendar.name')}</span>
      </div>
      <Button
        type="primary"
        block
        size="large"
        onClick={() => {
          onNavigate?.();
          setEditor({ draft: { start: dayjs().add(1, 'hour').startOf('hour').toISOString(), end: dayjs().add(2, 'hour').startOf('hour').toISOString(), allDay: false } });
        }}
      >
        + {t('calendar.newEvent')}
      </Button>
      <div className="cal-mini">
        <MiniCalendar
          fullscreen={false}
          headerRender={({ value, onChange }) => (
            <div className="cal-mini__head">
              <strong>{value.format('MMMM YYYY')}</strong>
              <span>
                <button type="button" onClick={() => onChange(value.subtract(1, 'month'))} aria-label="prev">‹</button>
                <button type="button" onClick={() => onChange(value.add(1, 'month'))} aria-label="next">›</button>
              </span>
            </div>
          )}
          value={dayjs(current)}
          onSelect={(date, info) => {
            if (info?.source && info.source !== 'date') return;
            setCurrent(date.format('YYYY-MM-DD'));
            api_()?.gotoDate(date.toDate());
            onNavigate?.();
          }}
        />
      </div>
      <div className="mod-side__label">
        <span>{t('calendar.myCalendars')}</span>
        {config.canCreateCalendars && (
          <button type="button" onClick={() => setCalendarDialog({})} aria-label={t('calendar.newCalendar')}>+</button>
        )}
      </div>
      {home.calendars.map((calendar) => (
        <CalendarToggle
          key={calendar.id}
          id={`c:${calendar.id}`}
          color={calendar.color}
          name={calendarLabel(calendar, t)}
          hidden={hidden}
          onToggle={toggleHidden}
          menu={calendarMenu(calendar)}
        />
      ))}
      <div className="mod-side__label"><span>{t('calendar.more')}</span></div>
      <CalendarToggle id="invited" color="#8B5CF6" name={t('calendar.invitations')} hidden={hidden} onToggle={toggleHidden} />
      {config.showTasks && <CalendarToggle id="tasks" color="#0CA678" name={t('calendar.taskDeadlines')} hidden={hidden} onToggle={toggleHidden} />}

      {google.available && (
        <>
          <div className="mod-side__label"><span>Google Calendar</span></div>
          {!google.calendar ? (
            <div className="cal-google-cta">
              <IconGoogle size={28} />
              <p>{t(google.connected ? 'calendar.googleGrant' : 'calendar.googleConnect')}</p>
              <Button size="small" onClick={() => startGoogle('connect', '/app/calendar')}>
                {t(google.connected ? 'connections.grantCalendar' : 'connections.connect')}
              </Button>
            </div>
          ) : (
            <>
              <CalendarToggle id="google" color="#4285F4" name={google.email || 'Google'} hidden={hidden} onToggle={toggleHidden} />
              {!hidden.has('google') &&
                googleCalendars.map((calendar) => (
                  <CalendarToggle key={calendar.id} id={`g:${calendar.id}`} color={calendar.color} name={calendar.name} hidden={hidden} onToggle={toggleHidden} />
                ))}
              {googleError && <div className="cal-google-error">{googleError}</div>}
              <button type="button" className="cal-link" onClick={() => navigate('/account/connections')}>
                {t('calendar.chooseGoogle')} →
              </button>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="mod-shell">
      <aside className="mod-shell__side">{sidebar()}</aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        {sidebar(() => setDrawer(false))}
      </Drawer>
      <main className="mod-shell__main cal-main">
        <div className="cal-toolbar">
          <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>} />
          <Button onClick={() => go('today')}>{t('calendar.today')}</Button>
          <div className="cal-toolbar__nav">
            <Button type="text" onClick={() => go('prev')} aria-label="prev">‹</Button>
            <Button type="text" onClick={() => go('next')} aria-label="next">›</Button>
          </div>
          <h1 className="cal-toolbar__title">{title}</h1>
          <Segmented
            value={view}
            onChange={changeView}
            options={Object.entries(VIEWS).map(([key, value]) => ({ value, label: t(`calendar.view.${key}`) }))}
          />
        </div>
        <div className={`cal-view is-${view}`}>
          <FullCalendar
            ref={calendarRef}
            plugins={plugins}
            initialView={view}
            headerToolbar={false}
            locales={locales}
            locale={locale === 'ru' ? 'ru' : 'en-gb'}
            firstDay={config.weekStart}
            height="100%"
            nowIndicator
            selectable={writable.length > 0}
            selectMirror
            editable
            dayMaxEvents
            navLinks
            navLinkDayClick={onNavLinkDay}
            scrollTime={`${config.dayStart}:00`}
            businessHours={businessHours}
            slotDuration="00:30:00"
            eventTimeFormat={TIME_FORMAT}
            slotLabelFormat={TIME_FORMAT}
            eventSources={eventSources}
            eventContent={renderEvent}
            eventDidMount={onEventMount}
            eventClick={onEventClick}
            select={onSelect}
            eventDrop={onMoveEvent}
            eventResize={onMoveEvent}
            datesSet={onDatesSet}
            loading={onLoading}
            noEventsText={t('calendar.noEvents')}
          />
        </div>
      </main>

      <EventDialog
        open={Boolean(editor)}
        draft={editor?.draft}
        event={editor?.event}
        calendars={home.calendars}
        googleCalendars={googleCalendars}
        config={config}
        onClose={(saved) => {
          setEditor(null);
          if (saved) refetch();
        }}
      />
      <EventDetails
        event={details}
        open={Boolean(details)}
        onClose={() => {
          setDetails(null);
          if (routeEventId) navigate('/app/calendar', { replace: true });
        }}
        onEdit={(event) => {
          setDetails(null);
          setEditor({ event });
        }}
        onChanged={refetch}
      />
      <CalendarDialog
        open={Boolean(calendarDialog)}
        calendar={calendarDialog?.calendar}
        onClose={async (saved) => {
          setCalendarDialog(null);
          if (saved) {
            await loadHome();
            refetch();
          }
        }}
      />
      <AccessDialog
        open={Boolean(accessFor)}
        title={accessFor?.name}
        levelKey="calendar.level"
        load={() => calendarApi.access(accessFor.id)}
        loadSubjects={calendarApi.subjects}
        save={(entries) => calendarApi.saveAccess(accessFor.id, entries)}
        onClose={async (saved) => {
          setAccessFor(null);
          if (saved) await loadHome();
        }}
      />
    </div>
  );
}

/** Calendar app: /app/calendar, /app/calendar/e/:id (event deep link). */
export default function CalendarApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <Routes>
        <Route path="e/:id" element={<Shell />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </div>
  );
}
