import { Avatar, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime, fmtSmart } from '../../../lib/datetime';
import { initials } from '../../../lib/format';
import { URGENCY_GLYPH, dueText, slaOf, urgencyName, urgencyOf } from '../lib';

/** «🔥 Критично» chip in the level's colour. */
export function UrgencyTag({ meta, value, compact = false }) {
  const { t } = useLocale();
  const level = urgencyOf(meta, value);
  if (!level) return null;
  const name = urgencyName(level, t);
  return (
    <span className={`apr-urgency${compact ? ' is-compact' : ''}`} style={{ '--c': level.color }} title={name}>
      <span aria-hidden="true">{URGENCY_GLYPH[level.icon] || '•'}</span>
      {!compact && <span>{name}</span>}
    </span>
  );
}

/** Deadline in the person's zone, coloured by state: red overdue, yellow soon, grey none. */
export function DueBadge({ dueAt, soonHours = 24, done = false }) {
  const { t } = useLocale();
  const state = done ? 'done' : slaOf(dueAt, soonHours);
  if (!dueAt && !done) return <span className="apr-due is-none">{t('approvals.due.none')}</span>;
  return (
    <Tooltip title={dueAt ? fmtDateTime(dueAt) : null}>
      <span className={`apr-due is-${state}`}>
        <span className="apr-due__dot" aria-hidden="true" />
        {done ? t('approvals.due.done') : state === 'overdue' ? dueText(dueAt, t) : fmtSmart(dueAt)}
      </span>
    </Tooltip>
  );
}

export function Person({ person, size = 22, showName = true }) {
  if (!person) return null;
  return (
    <span className="apr-person">
      <Avatar size={size} src={person.avatarUrl || undefined}>
        {initials(person.name || '?')}
      </Avatar>
      {showName && <span className="apr-person__name">{person.name}</span>}
    </span>
  );
}

/** Process status as a soft pill. */
export function StatusPill({ status }) {
  const { t } = useLocale();
  return <span className={`apr-status is-${status}`}>{t(`approvals.status.${status}`)}</span>;
}
