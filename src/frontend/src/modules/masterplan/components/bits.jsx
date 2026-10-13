import { useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { useMp } from '../MpContext';
import { formatMoney, formatPercent, iconOf, readinessColor, statusColor, timeLeft } from '../lib';

/** Sales status as a coloured pill. */
export function StatusTag({ status, manager, size }) {
  const { t } = useLocale();
  const { settings } = useMp();
  if (!status) return <span className="mp-status is-hidden">—</span>;
  return (
    <span className={`mp-status${size === 'lg' ? ' is-lg' : ''}`} style={{ '--c': statusColor(status, settings) }}>
      <span className="mp-status__dot" />
      {t(`mp.status.${status}`)}
      {manager && <span className="mp-status__who">· {manager.name}</span>}
    </span>
  );
}

export function StatusDot({ status }) {
  const { settings } = useMp();
  return <span className="mp-dot" style={{ '--c': statusColor(status, settings) }} />;
}

export function TypeIcon({ node, size = 18 }) {
  return (
    <span className="mp-ticon" style={{ fontSize: size, '--c': node?.type?.color || 'var(--da-primary)' }} aria-hidden="true">
      {iconOf(node)}
    </span>
  );
}

export function Money({ amount, currency, className = '' }) {
  const { locale } = useLocale();
  return <span className={`mp-money ${className}`}>{formatMoney(amount, currency, locale)}</span>;
}

/** Readiness as a thin bar from grey to green with the number. */
export function Readiness({ value, compact }) {
  const { locale } = useLocale();
  if (value === null || value === undefined) return <span className="mp-muted">—</span>;
  return (
    <span className={`mp-ready${compact ? ' is-compact' : ''}`}>
      <span className="mp-ready__bar">
        <span style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: readinessColor(value) }} />
      </span>
      <b>{formatPercent(value, locale)}</b>
    </span>
  );
}

/** "2 д 4 ч" left until a moment, red within a day; re-renders every 30 s. */
export function Countdown({ endsAt, short }) {
  const { t } = useLocale();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const left = timeLeft(endsAt, now);
  if (!left) return null;
  const text = left.overdue
    ? t('mp.time.expired')
    : left.days
      ? t('mp.time.dh', { d: left.days, h: left.hours })
      : left.hours
        ? t('mp.time.hm', { h: left.hours, m: left.minutes })
        : t('mp.time.m', { m: left.minutes });
  return (
    <Tooltip title={fmtDateTime(endsAt)}>
      <span className={`mp-countdown${left.urgent ? ' is-urgent' : ''}${left.overdue ? ' is-over' : ''}`}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8V8l2 1.4" strokeLinecap="round" />
        </svg>
        {short ? text : t('mp.time.left', { text })}
      </span>
    </Tooltip>
  );
}

export function Empty({ icon = '🗺️', title, text, action }) {
  return (
    <div className="mp-empty">
      <span className="mp-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Label: value pairs for cards; empty values are skipped. */
export function Facts({ items }) {
  const list = items.filter((item) => item && item.value !== null && item.value !== undefined && item.value !== '' && item.value !== false);
  if (!list.length) return null;
  return (
    <dl className="mp-facts">
      {list.map((item) => (
        <div key={item.label} className={item.wide ? 'is-wide' : ''}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Schedule badge: ahead / on track / N days behind (red over the threshold). */
export function ScheduleBadge({ schedule, alertDays = 7 }) {
  const { t } = useLocale();
  if (!schedule || schedule.state === 'no_plan') return <span className="mp-sched is-none">{t('mp.sched.no_plan')}</span>;
  if (schedule.state === 'behind') return <span className={`mp-sched is-behind${schedule.delayDays > alertDays ? ' is-alert' : ''}`}>{t('mp.sched.behind', { n: schedule.delayDays })}</span>;
  if (schedule.state === 'ahead') return <span className="mp-sched is-ahead">{t('mp.sched.ahead', { n: -schedule.delayDays })}</span>;
  return <span className="mp-sched is-ok">{t('mp.sched.on_track')}</span>;
}
