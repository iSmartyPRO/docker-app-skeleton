import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { markNotificationsRead } from '../../../services/api';
import { inZone, intlOptions, useRegional } from '../../../lib/datetime';
import { enabledModules, moduleLabel } from '../../registry';
import { MODULE_COLORS } from '../../resources/api';
import { useWidgetData } from '../api';
import { WidgetState, When, cap, initials, localeTag, timeOf } from './common';

// ── Welcome ─────────────────────────────────────────────────────────────────

function greeting(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

function useNow(every = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

function untilText(start, now, t) {
  const minutes = Math.round((new Date(start) - now) / 60000);
  if (minutes < 1) return t('dashboard.welcome.now');
  if (minutes < 60) return t('dashboard.welcome.inMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('dashboard.welcome.inHours', { h: hours, m: minutes % 60 });
  return null;
}

export function Welcome({ widget }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const now = useNow();
  const state = useWidgetData('welcome', widget.settings);
  const data = state.data || {};
  const first = (user?.displayName || user?.username || '').split(/\s+/)[0];
  const tasks = data.tasks;
  const events = data.events;

  const parts = [];
  if (tasks?.today) parts.push(t('dashboard.welcome.tasksToday', { count: tasks.today }));
  if (events?.today) parts.push(t('dashboard.welcome.eventsToday', { count: events.today }));
  const summary = state.data ? (parts.length ? t('dashboard.welcome.youHave', { list: parts.join(t('dashboard.welcome.and')) }) : t('dashboard.welcome.clear')) : ' ';
  const next = events?.next;
  const until = next ? untilText(next.start, now, t) : null;

  return (
    <div className="dw-welcome">
      <div className="dw-welcome__glow" aria-hidden />
      <div className="dw-welcome__main">
        <span className="dw-welcome__date">{cap(now.toLocaleDateString(localeTag(locale), intlOptions({ weekday: 'long', day: 'numeric', month: 'long' })))}</span>
        <h2>
          {t(`dashboard.welcome.${greeting(inZone(now).hour())}`)}
          {first ? `, ${first}` : ''}
        </h2>
        <p>{summary}</p>
        {widget.settings.showStats !== false && (
          <div className="dw-welcome__chips">
            {tasks && (
              <>
                <Link to="/app/tasks" className="dw-chip">
                  <b>{tasks.open}</b> {t('dashboard.welcome.open')}
                </Link>
                {tasks.overdue > 0 && (
                  <Link to="/app/tasks" className="dw-chip is-danger">
                    <b>{tasks.overdue}</b> {t('dashboard.welcome.overdue')}
                  </Link>
                )}
                {tasks.done_today > 0 && (
                  <span className="dw-chip is-ok">
                    <b>{tasks.done_today}</b> {t('dashboard.welcome.doneToday')}
                  </span>
                )}
              </>
            )}
            {data.unread > 0 && (
              <span className="dw-chip is-info">
                <b>{data.unread}</b> {t('dashboard.welcome.unread')}
              </span>
            )}
          </div>
        )}
      </div>
      {next && (
        <Link to={`/app/calendar/e/${next.id}`} className="dw-welcome__next" style={{ '--c': next.color || 'var(--dc-accent)' }}>
          <span className="dw-welcome__next-label">{t('dashboard.welcome.next')}</span>
          <strong>{next.title}</strong>
          <span>
            {timeOf(next.start, locale)}
            {until && <em> · {until}</em>}
          </span>
          {next.meetingUrl && new Date(next.start) - now <= 15 * 60000 && (
            <Button
              size="small"
              type="primary"
              onClick={(event) => {
                event.preventDefault();
                window.open(next.meetingUrl, '_blank', 'noopener');
              }}
            >
              {t('dashboard.welcome.join')}
            </Button>
          )}
        </Link>
      )}
    </div>
  );
}

// ── Quick access ────────────────────────────────────────────────────────────

// Tile geometry, kept in step with .dw-quick in dashboard.css.
const QUICK = {
  tiles: { minW: 76, rowH: 96, gap: 4, rowGap: 8 },
  list: { minW: 200, rowH: 48, gap: 4, rowGap: 4 },
};
// Phones size the card to its content: up to this many rows, then «More».
const PHONE_ROWS = 3;

/** Width and height of an element, live. */
function useBox() {
  const [node, setNode] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (Math.round(width) === prev.w && Math.round(height) === prev.h ? prev : { w: Math.round(width), h: Math.round(height) }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, box];
}

function QuickTile({ module, settings, t }) {
  return (
    <Link to={module.path} className="dw-quick__item" title={moduleLabel(module, settings, t)}>
      <span className="dw-quick__icon">
        <MenuIcon name={module.icon} />
      </span>
      <span className="dw-quick__label">{moduleLabel(module, settings, t)}</span>
    </Link>
  );
}

/**
 * App tiles in the launcher's icon style. Columns follow the card's width;
 * rows follow its height on the grid (on phones: the content, up to three
 * rows). Apps that do not fit go behind a «More» tile, so nothing is clipped.
 */
export function QuickActions({ widget, size }) {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [measure, box] = useBox();
  const chosen = widget.settings.modules;
  const modules = enabledModules(settings, user).filter((module) => module.id !== 'dashboard' && (!chosen?.length || chosen.includes(module.id)));
  if (!modules.length) return <div className="dw-empty"><strong>{t('dashboard.quick.none')}</strong></div>;
  const phone = size.cols === 1;
  // A card too low for one row of tiles shows the list instead.
  const list = widget.settings.style === 'list' || size.w <= 2 || (!phone && box.h > 0 && box.h < QUICK.tiles.rowH);
  const geo = list ? QUICK.list : QUICK.tiles;
  const cols = box.w ? Math.max(1, Math.floor((box.w + geo.gap) / (geo.minW + geo.gap))) : list ? 1 : 4;
  const rows = phone ? (list ? 8 : PHONE_ROWS) : Math.max(1, Math.floor((box.h + geo.rowGap) / (geo.rowH + geo.rowGap)));
  const capacity = box.w ? cols * rows : modules.length;
  const shown = modules.length > capacity ? modules.slice(0, Math.max(0, capacity - 1)) : modules;
  const rest = modules.slice(shown.length);
  return (
    <div ref={measure} className={`dw-quick${list ? ' is-list' : ''}${phone ? ' is-auto' : ''}`}>
      <div className="dw-quick__grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shown.map((module) => (
          <QuickTile key={module.id} module={module} settings={settings} t={t} />
        ))}
        {rest.length > 0 && (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="launcher"
            popupRender={() => (
              <div className="launcher__panel">
                <div className="launcher__title">{t('dashboard.quick.moreTitle')}</div>
                <div className="launcher__grid">
                  {rest.map((module) => (
                    <Link key={module.id} to={module.path} className="launcher__app">
                      <MenuIcon name={module.icon} />
                      <span>{moduleLabel(module, settings, t)}</span>
                    </Link>
                  ))}
                </div>
                <Link to="/apps" className="launcher__all">{t('apps.all')} →</Link>
              </div>
            )}
          >
            <button type="button" className="dw-quick__item is-more" aria-label={t('dashboard.quick.moreN', { n: rest.length })}>
              <span className="dw-quick__icon">
                <span className="dw-quick__dots" aria-hidden>
                  {rest.slice(0, 4).map((module) => (
                    <MenuIcon key={module.id} name={module.icon} />
                  ))}
                </span>
              </span>
              <span className="dw-quick__label">{t('dashboard.quick.moreN', { n: rest.length })}</span>
            </button>
          </Dropdown>
        )}
      </div>
    </div>
  );
}

// ── Clock ───────────────────────────────────────────────────────────────────

export const CLOCK_ZONES = [
  'Asia/Bishkek', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Moscow', 'Europe/Minsk', 'Europe/Kiev', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Istanbul',
  'Asia/Dubai', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Singapore', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
];

function zoneName(zone) {
  return zone === 'UTC' ? 'UTC' : zone.split('/').pop().replace(/_/g, ' ');
}

function offsetMinutes(zone, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - date.getTime()) / 60000);
}

function Analog({ date, zone }) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const h = get('hour') % 12;
  const m = get('minute');
  const s = get('second');
  const hand = (deg, len, cls) => <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} className={cls} />;
  return (
    <svg viewBox="0 0 100 100" className="dw-analog">
      <circle cx="50" cy="50" r="46" className="dw-analog__face" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="8" x2="50" y2={i % 3 ? 12 : 15} transform={`rotate(${i * 30} 50 50)`} className="dw-analog__tick" />
      ))}
      {hand(h * 30 + m / 2, 24, 'dw-analog__h')}
      {hand(m * 6, 34, 'dw-analog__m')}
      {hand(s * 6, 38, 'dw-analog__s')}
      <circle cx="50" cy="50" r="3" className="dw-analog__pin" />
    </svg>
  );
}

export function Clock({ widget, size }) {
  const { t, locale } = useLocale();
  const analog = Boolean(widget.settings.analog);
  const now = useNow(analog ? 1000 : 10000);
  const regional = useRegional();
  // The widget's own 12/24 choice wins; without one it follows the person's time format.
  const hour12 = (widget.settings.format || regional.timeFormat) === '12';
  // "Here" is the person's time zone (regional settings), not necessarily the device's.
  const local = regional.timeZone;
  const zones = (widget.settings.zones || []).filter((zone) => zone !== local).slice(0, 6);
  const fmt = (zone) => now.toLocaleTimeString(localeTag(locale), { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12 });
  const mine = offsetMinutes(local, now);
  return (
    <div className={`dw-clock${size.h <= 2 ? ' is-short' : ''}`}>
      <div className="dw-clock__main">
        {analog && <Analog date={now} zone={local} />}
        <div>
          <strong>{fmt(local)}</strong>
          <span>{cap(now.toLocaleDateString(localeTag(locale), { timeZone: local, weekday: 'long', day: 'numeric', month: 'long' }))}</span>
        </div>
      </div>
      {zones.length > 0 && (
        <ul className="dw-clock__zones">
          {zones.map((zone) => {
            const diff = (offsetMinutes(zone, now) - mine) / 60;
            const hour = Number(now.toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }).slice(0, 2));
            return (
              <li key={zone}>
                <span className="dw-clock__sun">{hour >= 7 && hour < 20 ? '☀' : '☾'}</span>
                <span>{zoneName(zone)}</span>
                <em>{diff === 0 ? t('dashboard.clock.same') : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} ${t('dashboard.clock.h')}`}</em>
                <b>{fmt(zone)}</b>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Note ────────────────────────────────────────────────────────────────────

export const NOTE_COLORS = ['#FEF3C7', '#DCFCE7', '#DBEAFE', '#FCE7F3', '#EDE9FE', '#F1F5F9'];

export function Note({ widget, onSettings }) {
  const { t } = useLocale();
  const [text, setText] = useState(widget.settings.text || '');
  const timer = useRef(null);
  useEffect(() => setText(widget.settings.text || ''), [widget.settings.text]);
  const change = (value) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSettings({ text: value }), 700);
  };
  return (
    <div className="dw-note" style={{ '--note': widget.settings.color || NOTE_COLORS[0] }}>
      <textarea value={text} onChange={(event) => change(event.target.value.slice(0, 4000))} placeholder={t('dashboard.note.placeholder')} spellCheck />
    </div>
  );
}

// ── Notifications ───────────────────────────────────────────────────────────

const MODULE_GLYPH = { tasks: 'tasks', calendar: 'calendar', kb: 'graduation', files: 'folder', drive: 'server', companies: 'building' };

export function Notifications({ widget }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const state = useWidgetData('notifications', widget.settings, { every: 60 * 1000 });
  const [read, setRead] = useState(() => new Set());
  const items = useMemo(() => (state.data?.items || []).map((item) => (read.has(item.id) || read.has('all') ? { ...item, read: true } : item)), [state.data, read]);
  const open = (item) => {
    if (!item.read) markNotificationsRead({ ids: [item.id] }).catch(() => {});
    setRead((prev) => new Set([...prev, item.id]));
    if (item.link) navigate(item.link);
  };
  const unread = read.has('all') ? 0 : Math.max(0, (state.data?.unread || 0) - [...read].filter((id) => id !== 'all').length);
  return (
    <WidgetState state={state} empty={state.data && !items.length ? t('dashboard.notifications.empty') : null} emptyIcon="bell">
      <div className="dw-notes">
        {unread > 0 && (
          <div className="dw-notes__bar">
            <span>{t('dashboard.notifications.unread', { n: unread })}</span>
            <button
              type="button"
              onClick={() => {
                markNotificationsRead({ all: true }).catch(() => {});
                setRead(new Set(['all']));
              }}
            >
              {t('dashboard.notifications.readAll')}
            </button>
          </div>
        )}
        <ul className="dw-list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className={`dw-row${item.read ? '' : ' is-unread'}`} onClick={() => open(item)}>
                {item.actor ? (
                  <Avatar size={30} src={item.actor.avatarUrl || undefined}>{initials(item.actor.name)}</Avatar>
                ) : (
                  <span className="dw-row__icon" style={{ '--c': MODULE_COLORS[item.module] || '#64748B' }}>
                    <MenuIcon name={MODULE_GLYPH[item.module] || 'bell'} variant="mono" />
                  </span>
                )}
                <span className="dw-row__text">
                  <strong>{item.title}</strong>
                  {item.body && <em>{item.body}</em>}
                </span>
                <span className="dw-row__meta">
                  <When value={item.createdAt} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}
