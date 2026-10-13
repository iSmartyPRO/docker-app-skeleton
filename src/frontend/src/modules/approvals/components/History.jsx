import { Avatar } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { initials } from '../../../lib/format';

const ICON = {
  started: '➤', approve: '✓', approved: '★', reject: '✕', return: '↩', question: '?', answer: '💬', delegate: '⇄',
  withdraw: '⤺', restart: '↻', reminder: '⏰', escalated: '⚠', stage_done: '▸',
};

/** «История» of a process: every action, reminder and escalation. */
export default function History({ process }) {
  const { t } = useLocale();
  const events = [...(process.history || [])].filter((event) => event.action !== 'stage_done').reverse();
  if (!events.length) return null;
  return (
    <ol className="apr-history">
      {events.map((event) => (
        <li key={event.id} className={`apr-history__item is-${event.action}`}>
          <span className="apr-history__icon" aria-hidden="true">{ICON[event.action] || '•'}</span>
          <div className="apr-history__body">
            <div className="apr-history__line">
              {event.actor ? (
                <span className="apr-history__who">
                  <Avatar size={18} src={event.actor.avatarUrl || undefined}>
                    {initials(event.actor.name)}
                  </Avatar>
                  {event.actor.name}
                </span>
              ) : (
                <span className="apr-history__who is-system">{t('approvals.history.system')}</span>
              )}
              <span>
                {t(`approvals.history.${event.action}`, {
                  target: event.target?.name || '',
                  stage: event.stageName || (event.stage !== null && event.stage !== undefined ? t('approvals.path.stage', { n: event.stage + 1 }) : ''),
                })}
              </span>
              {event.onBehalfOf && <span className="apr-history__muted">{t('approvals.path.onBehalf', { name: event.onBehalfOf.name })}</span>}
              {event.action === 'approved' && event.data?.auto && <span className="apr-history__muted">{t('approvals.history.auto')}</span>}
            </div>
            {event.comment && <div className="apr-history__comment">{event.comment}</div>}
            <time className="apr-history__time">
              {fmtDateTime(event.at)}
              {event.round > 1 ? ` · ${t('approvals.path.round', { n: event.round })}` : ''}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
