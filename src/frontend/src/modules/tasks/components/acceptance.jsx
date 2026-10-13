import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtSmart } from '../../../lib/datetime';

/*
 * «Принять в работу» and «Поручения» on lists, cards and boards: the
 * acceptance label ("Awaiting acceptance" / red "Not accepted N h"), the
 * order badge and the quick filter chips with counters.
 */

export const isPending = (task) => task?.acceptance?.state === 'pending';
export const isLate = (task) => isPending(task) && Boolean(task.acceptance.overdue);
export const isDone = (task) => task?.statusCategory === 'done';

/** Whole hours the task has been waiting for its assignee (at least 1). */
export function waitingHours(task) {
  const from = task?.acceptance?.assignedAt || task?.createdAt;
  if (!from) return 0;
  return Math.max(1, Math.floor((Date.now() - new Date(from).getTime()) / 3600000));
}

/** "today, 14:30" / "13.10.2026, 09:00" — for "until …" phrases. */
export function untilText(value) {
  const text = fmtSmart(value);
  return /^\p{L}/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function Hourglass() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 1.8h8M4 14.2h8M4.6 1.8c0 3.2 3.4 3.9 3.4 6.2s-3.4 3-3.4 6.2M11.4 1.8c0 3.2-3.4 3.9-3.4 6.2s3.4 3 3.4 6.2" />
    </svg>
  );
}

export function OrderIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 2.5h9v11l-4.5-2.6-4.5 2.6z" />
      <path d="M6 6.2h4" />
    </svg>
  );
}

/** "Awaiting acceptance" (calm) or "Not accepted N h" (red) while the assignee has not accepted the task. */
export function AcceptBadge({ task, compact }) {
  const { t } = useLocale();
  if (!isPending(task) || isDone(task)) return null;
  const late = isLate(task);
  const at = task.acceptance.dueAt ? untilText(task.acceptance.dueAt) : '—';
  const tip = late ? t('tasks.acc.lateTip', { at }) : t('tasks.acc.pendingTip', { name: task.assignee?.name || '—', at });
  return (
    <Tooltip title={tip}>
      <span className={`acc-badge${late ? ' is-late' : ''}${compact ? ' is-compact' : ''}`}>
        <Hourglass />
        {late ? t('tasks.acc.notAccepted', { n: waitingHours(task) }) : t('tasks.acc.pending')}
      </span>
    </Tooltip>
  );
}

/** The «Поручение» badge. */
export function OrderBadge({ task, compact }) {
  const { t } = useLocale();
  if (!task?.order) return null;
  return (
    <Tooltip title={task.orderFlag ? t('tasks.acc.order') : t('tasks.acc.orderAuto')}>
      <span className={`order-badge${compact ? ' is-compact' : ''}`}>
        <OrderIcon />
        {!compact && t('tasks.acc.order')}
      </span>
    </Tooltip>
  );
}

/** Quick filters: what each chip keeps. */
export const FILTERS = {
  important: (task) => !isDone(task) && (task.important || task.priority === 3),
  overdue: (task) => !isDone(task) && Boolean(task.overdue),
  notAccepted: (task) => isPending(task),
  inWork: (task) => !isDone(task) && !isPending(task) && !task.deferred,
  done: (task) => isDone(task),
  orders: (task) => Boolean(task.order),
};
export const FILTER_KEYS = Object.keys(FILTERS);

export function applyFilter(tasks, key) {
  return key && FILTERS[key] ? tasks.filter(FILTERS[key]) : tasks;
}

/** Chips with counters over the tasks on screen; one at a time, a second click clears it. */
export function FilterChips({ tasks, value, onChange, keys = FILTER_KEYS }) {
  const { t } = useLocale();
  return (
    <div className="filter-chips" role="toolbar" aria-label={t('tasks.acc.chipsLabel')}>
      {keys.map((key) => {
        const count = tasks.filter(FILTERS[key]).length;
        const alert = (key === 'overdue' || key === 'notAccepted') && count > 0 && (key === 'overdue' || tasks.some(isLate));
        return (
          <Tooltip key={key} title={t(`tasks.acc.chipTips.${key}`)} mouseEnterDelay={0.6}>
            <button
              type="button"
              className={`filter-chip${value === key ? ' is-on' : ''}${alert ? ' is-alert' : ''}`}
              aria-pressed={value === key}
              onClick={() => onChange(value === key ? null : key)}
            >
              {key === 'orders' && <OrderIcon />}
              {t(`tasks.acc.chips.${key}`)}
              <b>{count}</b>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
