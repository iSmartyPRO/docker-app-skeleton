import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatDue, formatMoney, isOverdue } from '../lib';

const ICON_PATHS = {
  call: 'M5.2 2.6h2l1 3-1.5 1.1a8 8 0 0 0 3.6 3.6l1.1-1.5 3 1v2c0 .7-.6 1.3-1.3 1.3C7 13.1 2.9 9 2.9 3.9c0-.7.6-1.3 1.3-1.3Z',
  meeting: 'M5.5 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Zm5.6 0a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM1.8 13.2c.3-2.3 1.8-3.8 3.7-3.8s3.4 1.5 3.7 3.8M9.6 9.6c.5-.2 1-.3 1.5-.3 1.6 0 2.8 1.2 3.1 3.1',
  task: 'M3 8.3 6.2 11.4 13 4.6',
  email: 'M2.4 4.2h11.2v8H2.4zM2.6 4.5 8 8.7l5.4-4.2',
  other: 'M4 8h.01M8 8h.01M12 8h.01',
};

/** Small line icon for an activity kind (call, meeting, task, email, other). */
export function ActivityIcon({ kind, size = 14 }) {
  const path = ICON_PATHS[kind] || ICON_PATHS.other;
  return (
    <svg className="crm-act-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={kind === 'other' ? 2.6 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function Glyph({ name, size = 14 }) {
  const paths = {
    building: 'M3 13.5V3.2c0-.4.3-.7.7-.7h5.6c.4 0 .7.3.7.7v10.3M10 6h2.3c.4 0 .7.3.7.7v6.8M2 13.5h12M5.3 5h1.4M5.3 7.5h1.4M5.3 10h1.4',
    person: 'M8 7.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM3 13.6c.4-2.6 2.4-4.2 5-4.2s4.6 1.6 5 4.2',
    phone: ICON_PATHS.call,
    mail: ICON_PATHS.email,
    clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Zm0-9v3.2l2 1.3',
    plus: 'M8 3.5v9M3.5 8h9',
    check: ICON_PATHS.task,
    trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.6c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.6-8.6',
    edit: 'M10.8 2.8 13.2 5.2 6 12.4l-3 .6.6-3 7.2-7.2Z',
    pin: 'M6 2.5h4M7 2.5v4L4.6 9h6.8L9 6.5v-4M8 9v4.5',
    chat: 'M2.5 4.2c0-1 .8-1.7 1.7-1.7h7.6c1 0 1.7.8 1.7 1.7v5c0 1-.8 1.7-1.7 1.7H7l-3 2.4v-2.4h-.1c-.8 0-1.4-.7-1.4-1.5V4.2Z',
    flag: 'M3.5 14V2.8m0 0h7.8l-1.6 2.6 1.6 2.6H3.5',
    filter: 'M2.5 3.5h11L9.3 8.6v4l-2.6 1.2V8.6L2.5 3.5Z',
    columns: 'M2.5 3h11v10h-11zM6.2 3v10M9.8 3v10',
    link: 'M6.6 9.4 9.4 6.6M7.2 4.4l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M8.8 11.6l-1.1 1.1A2.6 2.6 0 0 1 4 9l1.1-1.1',
    external: 'M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3.2c0 .4-.4.8-.8.8H3.3c-.4 0-.8-.4-.8-.8V5.3c0-.4.4-.8.8-.8h3.2',
    trophy: 'M5 2.5h6v3.3a3 3 0 0 1-6 0V2.5ZM5 4H2.8c0 2 1 3 2.4 3.2M11 4h2.2c0 2-1 3-2.4 3.2M8 8.8v2.6M5.5 13.5h5',
    close: 'M4 4l8 8M12 4l-8 8',
    copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  };
  return (
    <svg className="crm-glyph" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.plus} />
    </svg>
  );
}

export function Money({ amount, currency, className = '' }) {
  const { locale } = useLocale();
  return <span className={`crm-money ${className}`}>{formatMoney(amount, currency, locale)}</span>;
}

/** The nearest open activity: kind icon, due, red when overdue. */
export function NextActivity({ next, compact }) {
  const { t, locale } = useLocale();
  if (!next) return null;
  const overdue = next.overdue ?? isOverdue(next.dueAt);
  return (
    <Tooltip title={next.title || t(`crm.act.kind.${next.kind}`)}>
      <span className={`crm-next${overdue ? ' is-overdue' : ''}${compact ? ' is-compact' : ''}`}>
        <ActivityIcon kind={next.kind} size={12} />
        <span className="crm-next__text">{formatDue(next.dueAt, locale, t)}</span>
      </span>
    </Tooltip>
  );
}

/** Open activities count: red when some are overdue. */
export function ActivityBadge({ activity }) {
  const { t } = useLocale();
  if (!activity?.open) return null;
  return (
    <Tooltip title={activity.overdue ? t('crm.act.badgeOverdue', { n: activity.open, overdue: activity.overdue }) : t('crm.act.badge', { n: activity.open })}>
      <span className={`crm-badge${activity.overdue ? ' is-alert' : ''}`}>{activity.open}</span>
    </Tooltip>
  );
}

export function StageTag({ stage }) {
  if (!stage) return null;
  return (
    <span className="crm-stage-tag" style={{ '--c': stage.color }}>
      <span className="status-pip" />
      {stage.name}
    </span>
  );
}

/** Empty state with a call to action, shared by every view. */
export function Empty({ icon = 'flag', title, text, action }) {
  return (
    <div className="crm-empty">
      <span className="crm-empty__icon">
        <Glyph name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
