import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Calendar, Drawer, Popover, Select, TimePicker } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { useAuth } from '../../../../context/AuthContext';
import { fmtTime, fromPicker, pickerFormat, toPicker, useRegional } from '../../../../lib/datetime';
import { formatDateTime } from '../../../../lib/format';
import { Person, UserAvatar } from '../../../shared/People';
import { tasksApi } from '../../api';
import { useTasks } from '../../TasksContext';

// ── People ──────────────────────────────────────────────────────────────────

let peopleCache = { userId: undefined, promise: null };
/** Everyone who can be given a task (active accounts), loaded once per page and signed-in person. */
export function usePeople() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [people, setPeople] = useState([]);
  useEffect(() => {
    if (!userId) {
      setPeople([]);
      return undefined;
    }
    if (peopleCache.userId !== userId || !peopleCache.promise) {
      peopleCache = { userId, promise: tasksApi.subjects().then((res) => res.data.users).catch(() => []) };
    }
    let alive = true;
    peopleCache.promise.then((list) => alive && setPeople(list));
    return () => {
      alive = false;
    };
  }, [userId]);
  return people;
}

export function PeopleSelect({ value, onChange, multiple, placeholder, allowClear = true, disabled, autoFocus, open, onDropdownVisibleChange, exclude = [] }) {
  const people = usePeople();
  const options = useMemo(
    () =>
      people
        .filter((user) => !exclude.includes(user.id))
        .map((user) => ({ value: user.id, search: `${user.name} ${user.username}`.toLowerCase(), label: <Person user={user} size={20} /> })),
    [people, exclude]
  );
  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      value={value ?? (multiple ? [] : undefined)}
      onChange={onChange}
      options={options}
      showSearch
      allowClear={allowClear}
      disabled={disabled}
      autoFocus={autoFocus}
      open={open}
      onDropdownVisibleChange={onDropdownVisibleChange}
      placeholder={placeholder}
      filterOption={(input, option) => option.search.includes(input.toLowerCase())}
      variant="borderless"
      className="te-select"
      popupMatchSelectWidth={280}
      maxTagCount="responsive"
    />
  );
}

/** A person as a pill; clicking opens the picker. */
export function PersonPill({ user, placeholder, onClick, disabled }) {
  return (
    <button type="button" className={`te-pill${user ? '' : ' is-empty'}`} onClick={onClick} disabled={disabled}>
      {user ? (
        <>
          <UserAvatar user={user} size={22} tip={false} />
          <span>{user.name}</span>
        </>
      ) : (
        <span>{placeholder}</span>
      )}
    </button>
  );
}

// ── Deadline ────────────────────────────────────────────────────────────────

/*
 * Deadlines are instants (dueAt, ISO). Presets and the picker work with picker
 * values — the person's wall-clock time (lib/datetime toPicker) — so "today
 * 19:00" is 19:00 in the person's zone whatever the device's zone is.
 */
const wallNow = () => toPicker(new Date());

/** Presets: { key, date } where `date` is a picker value (wall-clock) and `iso` the instant. */
export function presetDates() {
  const now = wallNow();
  const at = (day) => day.hour(19).minute(0).second(0).millisecond(0);
  const friday = now.day() <= 5 ? now.day(5) : now.add(1, 'week').day(5);
  // Late in the day "today" means the end of it; in the last half hour it is gone.
  const today = at(now).isAfter(now.add(30, 'minute')) ? at(now) : now.hour(23).minute(59).second(0).millisecond(0);
  return [
    ...(today.isAfter(now.add(30, 'minute')) ? [{ key: 'today', date: today }] : []),
    { key: 'tomorrow', date: at(now.add(1, 'day')) },
    { key: 'weekEnd', date: at(friday) },
    { key: 'inWeek', date: at(now.add(7, 'day')) },
    { key: 'monthEnd', date: at(now.endOf('month')) },
  ].map((preset) => ({ ...preset, iso: fromPicker(preset.date) }));
}

/** The default deadline of a new task: a week ahead at 19:00. */
export const defaultDeadline = () => presetDates().find((preset) => preset.key === 'inWeek').iso;

export function formatDeadline(value, locale, t) {
  if (!value) return null;
  const date = toPicker(value);
  const days = date.startOf('day').diff(wallNow().startOf('day'), 'day');
  const day = days === 0 ? t('tasks.due.today') : days === 1 ? t('tasks.due.tomorrow') : formatDateTime(value, locale, { day: 'numeric', month: 'long', ...(Math.abs(days) > 300 ? { year: 'numeric' } : {}) });
  return `${day}, ${fmtTime(value)}`;
}

/** Deadline: presets (today … end of the month), a calendar and the time. */
export function DeadlinePicker({ value, onChange, disabled, allowClear = true, open: forced, onOpenChange }) {
  const { t, locale } = useLocale();
  const regional = useRegional();
  const [own, setOwn] = useState(false);
  const open = forced ?? own;
  const setOpen = (next) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  // `current` and everything passed to pick() are picker values (wall-clock).
  const current = value ? toPicker(value, regional) : null;
  const pick = (date) => {
    onChange(date ? fromPicker(date.second(0).millisecond(0), regional) : null);
  };
  const overdue = value && dayjs(value).isBefore(dayjs());
  const panel = (
    <div className="te-deadline">
      <div className="te-deadline__presets">
        {presetDates().map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => {
              pick(preset.date);
              setOpen(false);
            }}
          >
            <span>{t(`tasks.v2.presets.${preset.key}`)}</span>
            <em>{formatDateTime(preset.iso, locale, { weekday: 'short', day: 'numeric', month: 'short' })}</em>
          </button>
        ))}
        {allowClear && value && (
          <button
            type="button"
            className="is-clear"
            onClick={() => {
              pick(null);
              setOpen(false);
            }}
          >
            {t('tasks.v2.noDeadline')}
          </button>
        )}
      </div>
      <div className="te-deadline__calendar">
        <Calendar
          fullscreen={false}
          value={current || wallNow()}
          onSelect={(date, info) => {
            if (info?.source === 'date') pick((current || wallNow().hour(19).minute(0)).year(date.year()).month(date.month()).date(date.date()));
          }}
        />
        <div className="te-deadline__time">
          <span>{t('tasks.v2.timeLabel')}</span>
          <TimePicker
            format={pickerFormat(regional).time}
            use12Hours={regional.timeFormat === '12'}
            minuteStep={5}
            value={current}
            allowClear={false}
            needConfirm={false}
            onChange={(time) => time && pick((current || wallNow()).hour(time.hour()).minute(time.minute()))}
          />
          <Button type="primary" size="small" onClick={() => setOpen(false)}>
            {t('tasks.v2.done')}
          </Button>
        </div>
      </div>
    </div>
  );
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const pill = (
    <button type="button" className={`te-pill te-due${current ? '' : ' is-empty'}${overdue ? ' is-overdue' : ''}`} disabled={disabled} onClick={narrow ? () => setOpen(true) : undefined}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2.5" />
          <path d="M5 1.8v2.6M11 1.8v2.6M2 7h12" strokeLinecap="round" />
        </svg>
        <span>{current ? formatDeadline(value, locale, t) : t('tasks.v2.noDeadline')}</span>
    </button>
  );
  // On a phone the panel is a sheet from the bottom: a popover would run off the screen.
  if (narrow) {
    return (
      <>
        {pill}
        <Drawer open={open && !disabled} onClose={() => setOpen(false)} placement="bottom" height="auto" className="te-sheet" title={t('tasks.fields.due')} destroyOnHidden>
          {panel}
        </Drawer>
      </>
    );
  }
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen} trigger="click" content={panel} placement="bottomLeft" overlayClassName="te-pop">
      {pill}
    </Popover>
  );
}

// ── Tasks and projects ──────────────────────────────────────────────────────

export function TaskSelect({ value, onChange, exclude = [], placeholder, multiple, autoFocus }) {
  const [options, setOptions] = useState([]);
  const search = (q) => {
    tasksApi
      .tasks({ q, open: q ? undefined : '1', sort: 'updated', limit: 30 })
      .then((res) =>
        setOptions(
          res.data.tasks
            .filter((task) => !exclude.includes(task.id))
            .slice(0, 30)
            .map((task) => ({ value: task.id, ref: task.ref, title: task.title, label: <span className="te-taskopt"><b>{task.ref}</b> {task.title}</span> }))
        )
      )
      .catch(() => {});
  };
  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      value={value}
      onChange={(next, option) => onChange(next, option)}
      showSearch
      filterOption={false}
      onSearch={search}
      options={options}
      placeholder={placeholder}
      autoFocus={autoFocus}
      allowClear
      style={{ width: '100%' }}
    />
  );
}

const RECENT_KEY = 'tasks_recent_projects';
export function rememberProject(id) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((item) => item !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list].slice(0, 6)));
  } catch {
    /* ignore */
  }
}

export function ProjectSelect({ value, onChange, onCreate }) {
  const { t } = useLocale();
  const { projects, config } = useTasks();
  const [tab, setTab] = useState('all');
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    recent = [];
  }
  const writable = projects.filter((project) => ['edit', 'manage'].includes(project.level) && !project.archived);
  const list = tab === 'recent' ? recent.map((id) => writable.find((project) => project.id === id)).filter(Boolean) : writable;
  return (
    <Select
      value={value || undefined}
      onChange={(next) => {
        if (next) rememberProject(next);
        onChange(next || null);
      }}
      allowClear
      showSearch
      optionFilterProp="search"
      placeholder={t('tasks.v2.noProject')}
      className="te-select"
      variant="borderless"
      popupMatchSelectWidth={300}
      dropdownRender={(menu) => (
        <div>
          <div className="te-tabs">
            {['all', 'recent'].map((key) => (
              <button key={key} type="button" className={tab === key ? 'is-active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setTab(key)}>
                {t(`tasks.v2.projectTabs.${key}`)}
              </button>
            ))}
          </div>
          {menu}
          {config?.canCreateProjects && onCreate && (
            <button type="button" className="te-create" onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>
              ＋ {t('tasks.newProject')}
            </button>
          )}
        </div>
      )}
      options={list.map((project) => ({
        value: project.id,
        search: `${project.name} ${project.key}`.toLowerCase(),
        label: (
          <span className="status-option">
            <span className="mod-dot" style={{ '--c': project.color }} />
            {project.name}
          </span>
        ),
      }))}
    />
  );
}
