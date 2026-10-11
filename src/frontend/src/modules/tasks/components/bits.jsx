import dayjs from 'dayjs';
import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

export const PRIORITIES = [0, 1, 2, 3];
const PRIORITY_COLOR = ['#94A3B8', '#3B82F6', '#F59E0B', '#EF4444'];

/** Signal-strength bars; urgent is a filled alert square. */
export function PriorityIcon({ value = 1, size = 16 }) {
  const color = PRIORITY_COLOR[value] ?? PRIORITY_COLOR[1];
  if (value === 3) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="prio-icon">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill={color} />
        <path d="M8 4.6v4.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="1.05" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="prio-icon">
      {[0, 1, 2].map((bar) => (
        <rect key={bar} x={2 + bar * 4.4} y={10 - bar * 3.2} width="3" height={4 + bar * 3.2} rx="1" fill={bar <= value ? color : 'currentColor'} opacity={bar <= value ? 1 : 0.18} />
      ))}
    </svg>
  );
}

export function PriorityLabel({ value }) {
  const { t } = useLocale();
  return (
    <span className="prio-label">
      <PriorityIcon value={value} />
      {t(`tasks.priority.${value}`)}
    </span>
  );
}

export function priorityOptions(t) {
  return [...PRIORITIES].reverse().map((value) => ({ value, label: <PriorityLabel value={value} /> }));
}

/** Due date chip: overdue red, today amber, soon blue; date-only tasks show no time. */
export function DueChip({ dueAt, dueTime, done, compact }) {
  const { t, locale } = useLocale();
  if (!dueAt) return null;
  const due = dayjs(dueAt);
  const now = dayjs();
  const days = due.startOf('day').diff(now.startOf('day'), 'day');
  let tone = '';
  if (!done) {
    if (dueTime ? due.isBefore(now) : days < 0) tone = 'is-overdue';
    else if (days === 0) tone = 'is-today';
    else if (days <= 2) tone = 'is-soon';
  }
  let text;
  if (days === 0) text = t('tasks.due.today');
  else if (days === 1) text = t('tasks.due.tomorrow');
  else if (days === -1) text = t('tasks.due.yesterday');
  else text = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', ...(Math.abs(days) > 300 ? { year: 'numeric' } : {}) }).format(due.toDate());
  if (dueTime) text += ` ${due.format('HH:mm')}`;
  return (
    <Tooltip title={due.format(dueTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY')}>
      <span className={`due-chip ${tone}${done ? ' is-done' : ''}${compact ? ' is-compact' : ''}`}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2.5" />
          <path d="M5 1.8v2.6M11 1.8v2.6M2 7h12" strokeLinecap="round" />
        </svg>
        {text}
      </span>
    </Tooltip>
  );
}

/** Stable colour per label text. */
export function labelColor(label) {
  let hash = 0;
  for (const char of String(label)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hues = [215, 250, 280, 330, 10, 30, 45, 140, 165, 190];
  return `hsl(${hues[hash % hues.length]} 70% 45%)`;
}

export function LabelTag({ label }) {
  return (
    <span className="task-label" style={{ '--c': labelColor(label) }}>
      {label}
    </span>
  );
}

export function StatusDot({ color }) {
  return <span className="status-pip" style={{ background: color }} />;
}

/** Progress ring for checklists (done / total). */
export function ChecklistBadge({ done, total }) {
  if (!total) return null;
  const ratio = done / total;
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <span className={`check-badge${done === total ? ' is-full' : ''}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="2" />
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${c * ratio} ${c}`} transform="rotate(-90 8 8)" strokeLinecap="round" />
      </svg>
      {done}/{total}
    </span>
  );
}

export function CommentBadge({ count }) {
  if (!count) return null;
  return (
    <span className="comment-badge">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2.5 4.2c0-1 .8-1.7 1.7-1.7h7.6c1 0 1.7.8 1.7 1.7v5c0 1-.8 1.7-1.7 1.7H7l-3 2.4v-2.4h-.1c-.8 0-1.4-.7-1.4-1.5V4.2Z" strokeLinejoin="round" />
      </svg>
      {count}
    </span>
  );
}

/** Date-only due dates are stored as the end of the local day. */
export function dueFromPicker(value, withTime) {
  if (!value) return null;
  return (withTime ? value.second(0) : value.endOf('day')).toISOString();
}
