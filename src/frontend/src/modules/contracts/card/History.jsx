import { useEffect, useState } from 'react';
import { Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { UserAvatar } from '../../shared/People';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { formatMoney, typeLabel } from '../lib';

const ICON = {
  created: '✦', updated: '✎', status: '→', prolonged: '↻', version: '⬆', current: '★', signed_mark: '✍', signed_unmark: '✍',
  risk: '!', risk_update: '!', risk_delete: '✕',
  deposit: '🔐', schedule: '🗓', payment: '💳', payment_delete: '✕', mp_sync: '🏗',
  started: '➤', approve: '✓', approved: '★', reject: '✕', return: '↩', question: '?', answer: '💬', delegate: '⇄', withdraw: '⤺', restart: '↻', reminder: '⏰', escalated: '⚠',
};

const DAY_FIELDS = ['concludedOn', 'startsOn', 'endsOn'];
const USER_FIELDS = ['lawyerId', 'ownerId'];

/**
 * «История»: everything that happened to the contract — its own events
 * (fields old → new, statuses, versions, risks) merged with the approval's
 * (sent, decisions, questions, answers), newest first.
 */
export default function History({ contract, process, refreshKey }) {
  const { t, locale } = useLocale();
  const { userById, settings } = useContracts();
  const [events, setEvents] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let alive = true;
    contractsApi
      .events(contract.id)
      .then((res) => {
        if (!alive) return;
        setEvents(res.data.events);
        setHasMore(res.data.hasMore);
      })
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [contract.id, refreshKey]);

  const more = async () => {
    const res = await contractsApi.events(contract.id, { before: events[events.length - 1]?.id });
    setEvents((prev) => [...prev, ...res.data.events]);
    setHasMore(res.data.hasMore);
  };

  const value = (key, raw) => {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (DAY_FIELDS.includes(key)) return fmtDate(raw);
    if (USER_FIELDS.includes(key)) return userById(raw)?.name || `#${raw}`;
    if (typeof raw === 'boolean') return raw ? t('common.yes') : t('common.no');
    if (key === 'typeKey') return typeLabel(settings, raw, t);
    if (key === 'direction') return t(`contracts.direction.${raw}`);
    if (key === 'amount') return formatMoney(raw, contract.currency, locale);
    const text = String(raw);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  };

  const line = (event) => {
    const d = event.data || {};
    switch (event.kind) {
      case 'created':
        return t('contracts.history.created');
      case 'updated':
        return (
          <>
            {t('contracts.history.updated')}
            <ul className="ctr-hist__changes">
              {Object.entries(d.changes || {}).map(([key, change]) => (
                <li key={key}>
                  <span className="ctr-muted">{t(`contracts.fields.${key}`)}:</span> <s>{value(key, change.from)}</s> → <b>{value(key, change.to)}</b>
                </li>
              ))}
            </ul>
          </>
        );
      case 'status':
        return (
          <>
            {t('contracts.history.status', { from: t(`contracts.status.${d.from}`), to: t(`contracts.status.${d.to}`) })}
            {d.source === 'dates' && <span className="ctr-muted"> · {t('contracts.history.byDates')}</span>}
            {d.source === 'approval' && <span className="ctr-muted"> · {t('contracts.history.byApproval')}</span>}
          </>
        );
      case 'prolonged':
        return t('contracts.history.prolonged', { date: fmtDate(d.to) });
      case 'version':
        return t(d.signed ? 'contracts.history.versionSigned' : 'contracts.history.version', { no: d.no, name: d.name });
      case 'current':
        return t('contracts.history.current', { no: d.no });
      case 'signed_mark':
        return t('contracts.history.signedMark', { no: d.no });
      case 'signed_unmark':
        return t('contracts.history.signedUnmark', { no: d.no });
      case 'risk':
        return t('contracts.history.risk', { no: d.no, importance: t(`contracts.risks.importance.${d.importance}`) });
      case 'risk_update':
        return d.status ? t('contracts.history.riskStatus', { no: d.no, status: t(`contracts.risks.status.${d.status.to}`) }) : t('contracts.history.riskUpdate', { no: d.no });
      case 'risk_delete':
        return t('contracts.history.riskDelete', { no: d.no });
      case 'deposit': {
        const kind = t(`contracts.pay.deposit.kindShort.${d.kind || 'deposit'}`);
        if (d.action === 'status') return t('contracts.history.deposit.status', { kind, from: t(`contracts.pay.deposit.status.${d.from}`).toLowerCase(), to: t(`contracts.pay.deposit.status.${d.to}`).toLowerCase() });
        if (d.action === 'created') return t('contracts.history.deposit.created', { kind, amount: formatMoney(d.amount, d.currency || contract.currency, locale) });
        return t(`contracts.history.deposit.${['updated', 'deleted', 'file'].includes(d.action) ? d.action : 'updated'}`, { kind });
      }
      case 'schedule':
        return d.rows ? t('contracts.history.schedule', { n: d.rows, total: formatMoney(d.total, contract.currency, locale) }) : t('contracts.history.scheduleCleared');
      case 'payment':
        return t('contracts.history.payment', { amount: formatMoney(d.amount, contract.currency, locale), date: fmtDate(d.paidOn) });
      case 'payment_delete':
        return t('contracts.history.paymentDelete', { amount: formatMoney(d.amount, contract.currency, locale), date: fmtDate(d.paidOn) });
      case 'mp_sync': {
        const unit = d.unit?.code || '—';
        if (d.action === 'paid') return t('contracts.history.mpSync.paid', { unit, amount: formatMoney(d.paid, contract.currency, locale) });
        const to = d.to ? t(`mp.status.${d.to}`) : '';
        return d.result === 'refused' ? t('contracts.history.mpSync.refused', { unit, to, code: d.code || '' }) : t('contracts.history.mpSync.applied', { unit, to });
      }
      default:
        return event.kind;
    }
  };

  if (events === null) return <Skeleton active avatar paragraph={{ rows: 5 }} />;

  const approvalEvents = (process?.history || [])
    .filter((event) => !['stage_done'].includes(event.action))
    .map((event) => ({
      id: `a${event.id}`,
      kind: event.action,
      approval: true,
      actor: event.actor,
      at: event.at,
      comment: event.comment,
      text: t(`approvals.history.${event.action}`, { target: event.target?.name || '', stage: event.stageName || '' }),
    }));
  const own = events.map((event) => ({ ...event, comment: event.data?.comment || null, text: line(event) }));
  const all = [...own, ...approvalEvents].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="ctr-hist">
      <ol>
        {all.map((event) => (
          <li key={event.id} className={`ctr-hist__item is-${event.kind}${event.approval ? ' is-approval' : ''}`}>
            <span className="ctr-hist__icon" aria-hidden="true">{ICON[event.kind] || '•'}</span>
            <div className="ctr-hist__body">
              <div className="ctr-hist__line">
                {event.actor ? (
                  <span className="ctr-hist__who">
                    <UserAvatar user={event.actor} size={18} tip={false} />
                    {event.actor.name}
                  </span>
                ) : (
                  <span className="ctr-hist__who is-system">{t('contracts.history.system')}</span>
                )}
                <span className="ctr-hist__text">{event.text}</span>
              </div>
              {event.comment && <div className="ctr-hist__comment">{event.comment}</div>}
              <time className="ctr-hist__time">{fmtDateTime(event.at)}</time>
            </div>
          </li>
        ))}
      </ol>
      {hasMore && (
        <Button size="small" onClick={more}>
          {t('contracts.history.more')}
        </Button>
      )}
    </div>
  );
}
