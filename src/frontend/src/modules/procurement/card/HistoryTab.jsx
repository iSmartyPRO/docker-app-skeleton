import { useEffect, useState } from 'react';
import { Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { UserAvatar } from '../../shared/People';
import { procApi } from '../api';
import { formatMoney } from '../lib';

const ICON = {
  created: '✦', updated: '✎', document_added: '📎', document_removed: '🗑', payment_added: '💳', payment_removed: '↺', delivered: '🚚', delivery_removed: '↺',
  closed: '■', cancelled: '✕', reopened: '↻', status: '→',
  started: '➤', approve: '✓', approved: '★', reject: '✕', return: '↩', question: '?', answer: '💬', delegate: '⇄', withdraw: '⤺', restart: '↻', reminder: '⏰', escalated: '⚠',
};

/** One line of the request's own history. */
function requestText(event, t, locale) {
  const d = event.data || {};
  switch (event.action) {
    case 'updated':
      return t('procurement.history.updated', { fields: (d.fields || []).map((key) => t(`procurement.fields.${key}`)).join(', ') });
    case 'document_added':
    case 'document_removed':
      return t(`procurement.history.${event.action}`, { names: (d.names || []).join(', ') });
    case 'payment_added':
    case 'payment_removed':
      return t(`procurement.history.${event.action}`, { amount: formatMoney(d.amount, d.currency, locale), date: d.paidOn ? fmtDate(d.paidOn) : '' });
    case 'delivered':
      return d.partial ? t('procurement.history.deliveredPartial') : t('procurement.history.delivered');
    case 'status':
      return t('procurement.history.status', { status: t(`procurement.status.${d.to}`) });
    default:
      return t(`procurement.history.${event.action}`);
  }
}

/** «История»: the request's events and its approval history, merged by time. */
export default function HistoryTab({ id, refreshKey }) {
  const { t, locale } = useLocale();
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let alive = true;
    procApi
      .history(id)
      .then((res) => alive && setEvents(res.data.history))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);
  if (!events) return <Skeleton active />;
  const list = events.filter((event) => !(event.source === 'approval' && event.action === 'stage_done')).reverse();
  return (
    <ol className="apr-history prc-history">
      {list.map((event, index) => (
        <li key={`${event.source}${index}${event.at}`} className={`apr-history__item is-${event.action}`}>
          <span className="apr-history__icon" aria-hidden="true">{ICON[event.action] || '•'}</span>
          <div className="apr-history__body">
            <div className="apr-history__line">
              {event.actor ? (
                <span className="apr-history__who">
                  <UserAvatar user={event.actor} size={18} tip={false} />
                  {event.actor.name}
                </span>
              ) : (
                <span className="apr-history__who is-system">{t('approvals.history.system')}</span>
              )}
              <span>
                {event.source === 'approval'
                  ? t(`approvals.history.${event.action}`, { target: event.target?.name || '', stage: event.data?.stage || '' })
                  : requestText(event, t, locale)}
              </span>
              {event.onBehalfOf && <span className="apr-history__muted">{t('approvals.path.onBehalf', { name: event.onBehalfOf.name })}</span>}
            </div>
            {event.data?.comment && <div className="apr-history__comment">{event.data.comment}</div>}
            <time className="apr-history__time">{fmtDateTime(event.at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
