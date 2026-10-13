import { useEffect, useState } from 'react';
import { Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { mpApi } from '../api';
import { formatMoney, formatPercent } from '../lib';
import { StatusTag } from './bits';

/** One history row as text (spec §8.1.4: who, when, what was, what became). */
function EventText({ event }) {
  const { t, locale } = useLocale();
  const d = event.data || {};
  switch (event.kind) {
    case 'created':
      return t('mp.ev.created');
    case 'status':
    case 'expired':
      return (
        <>
          {event.kind === 'expired' ? t('mp.ev.expired') : t(`mp.ev.transition.${d.transition || 'forward'}`)} <StatusTag status={d.from} /> → <StatusTag status={d.to} />
          {d.manager && <span className="mp-ev__extra">{t('mp.ev.manager', { name: d.manager.name })}</span>}
          {d.client && <span className="mp-ev__extra">{t('mp.ev.client', { name: d.client.name })}</span>}
          {d.endsAt && <span className="mp-ev__extra">{t('mp.ev.until', { when: fmtDateTime(d.endsAt) })}</span>}
          {d.contract?.number && <span className="mp-ev__extra">{t('mp.ev.contract', { number: d.contract.number, date: fmtDate(d.contract.date) })}</span>}
          {d.reason && <span className="mp-ev__reason">«{d.reason}»</span>}
        </>
      );
    case 'migration':
      return (
        <>
          <b>{t('mp.ev.migration')}</b> <StatusTag status={d.from} /> → <StatusTag status={d.to} />
          {d.date && <span className="mp-ev__extra">{t('mp.ev.migrationDate', { date: fmtDate(d.date) })}</span>}
          {d.manager && <span className="mp-ev__extra">{t('mp.ev.manager', { name: d.manager.name })}</span>}
          {d.client && <span className="mp-ev__extra">{t('mp.ev.client', { name: d.client.name })}</span>}
          {d.contract?.number && <span className="mp-ev__extra">{t('mp.ev.contract', { number: d.contract.number, date: fmtDate(d.contract.date) })}</span>}
          {d.amount !== undefined && d.amount !== null && <span className="mp-ev__extra">{formatMoney(d.amount, null, locale)}</span>}
          {d.endsAt ? <span className="mp-ev__extra">{t('mp.ev.until', { when: fmtDateTime(d.endsAt) })}</span> : d.noTimer ? <span className="mp-ev__extra">{t('mp.ev.noTimer')}</span> : null}
          {d.source === 'import' && <span className="mp-ev__extra">{t('mp.ev.viaImport')}</span>}
          {d.reason && <span className="mp-ev__reason">«{d.reason}»</span>}
        </>
      );
    case 'extend':
      return (
        <>
          {d.endsAt ? t('mp.ev.extend', { when: fmtDateTime(d.endsAt), n: d.extensions }) : t('mp.ev.extendNoDate', { n: d.extensions })}
          {d.reason && <span className="mp-ev__reason">«{d.reason}»</span>}
        </>
      );
    case 'price':
      return (
        <>
          {t('mp.ev.price')} {formatMoney(d.from, d.currency, locale)} → <b>{formatMoney(d.to, d.currency, locale)}</b>
          {d.reason && <span className="mp-ev__reason">«{d.reason}»</span>}
        </>
      );
    case 'manager':
      return t('mp.ev.managerChanged', { from: d.from?.name || '—', to: d.to?.name || '—' });
    case 'fields':
      return t('mp.ev.fields', { n: (d.changes || []).length });
    case 'report':
      return (
        <>
          {t('mp.ev.report')} {d.stage && <b>{d.stage.name}</b>} {d.percent !== null && d.percent !== undefined && formatPercent(d.percent, locale)}
          {d.status && d.status !== 'published' && <span className="mp-ev__extra">{t(`mp.report.state.${d.status}`)}</span>}
        </>
      );
    case 'stage':
      return (
        <>
          {t('mp.ev.stage')} <b>{d.stage?.name}</b> {d.percent !== undefined && d.percent !== null ? formatPercent(d.percent, locale) : ''}
        </>
      );
    case 'readiness':
      return d.manual ? t('mp.ev.readinessManual', { value: formatPercent(d.readiness, locale) }) : t('mp.ev.readinessAuto');
    case 'moved':
      return d.bulk > 1 ? t('mp.ev.movedBulk', { n: d.bulk }) : t('mp.ev.moved');
    case 'bulk':
      return t('mp.ev.bulk', { n: d.count, from: d.from, to: d.to });
    case 'crm_stage':
      return t('mp.ev.crmStage', { stage: d.stage?.name || '', status: t(`mp.status.${d.action}`), code: d.code || '' });
    case 'report_deleted':
      return (
        <>
          {t('mp.ev.reportDeleted')} {d.stage?.name && <b>{d.stage.name}</b>} {d.percent !== null && d.percent !== undefined && formatPercent(d.percent, locale)}
          {d.factDate && <span className="mp-ev__extra">{fmtDate(d.factDate)}</span>}
          {d.restored && <span className="mp-ev__extra">{t('mp.ev.progressBack', { from: formatPercent(d.restored.from, locale), to: formatPercent(d.restored.to, locale) })}</span>}
        </>
      );
    case 'report_edited':
      return (
        <>
          {t('mp.ev.reportEdited')} {d.stage?.name && <b>{d.stage.name}</b>}
          {d.percent && <span className="mp-ev__extra">{formatPercent(d.percent.from, locale)} → {formatPercent(d.percent.to, locale)}</span>}
          {d.factDate && <span className="mp-ev__extra">{fmtDate(d.factDate.from)} → {fmtDate(d.factDate.to)}</span>}
          {d.status && <span className="mp-ev__extra">{t(`mp.report.state.${d.status.to}`)}</span>}
          {d.photosRemoved > 0 && <span className="mp-ev__extra">{t('mp.ev.photosRemoved', { n: d.photosRemoved })}</span>}
          {d.photosAdded > 0 && <span className="mp-ev__extra">{t('mp.ev.photosAdded', { n: d.photosAdded })}</span>}
        </>
      );
    default:
      return t('mp.ev.other');
  }
}

export default function EventList({ nodeId }) {
  const { t } = useLocale();
  const [events, setEvents] = useState(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    setEvents(null);
    mpApi
      .events(nodeId)
      .then((res) => {
        setEvents(res.data.events);
        setMore(res.data.hasMore);
      })
      .catch(() => setEvents([]));
  }, [nodeId]);
  if (!events) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (!events.length) return <p className="mp-muted">{t('mp.ev.none')}</p>;
  return (
    <>
      <ol className="mp-events">
        {events.map((event) => (
          <li key={event.id}>
            <div className="mp-ev__text">
              <EventText event={event} />
            </div>
            <div className="mp-ev__meta">
              {event.author?.name || t('mp.ev.system')} · {fmtDateTime(event.createdAt)}
            </div>
          </li>
        ))}
      </ol>
      {more && (
        <Button
          block
          onClick={async () => {
            const res = await mpApi.events(nodeId, events[events.length - 1].id);
            setEvents([...events, ...res.data.events]);
            setMore(res.data.hasMore);
          }}
        >
          {t('mp.ev.more')}
        </Button>
      )}
    </>
  );
}
