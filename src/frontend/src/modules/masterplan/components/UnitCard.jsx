import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Image, InputNumber, Input, Modal, Skeleton, Tabs, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { Person } from '../../shared/People';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { STATUSES, TIMED, formatArea, formatMoney, formatNumber, formatPercent, sumLines } from '../lib';
import { Countdown, Empty, Facts, Money, Readiness, ScheduleBadge, StatusTag, TypeIcon } from './bits';
import StatusDialog, { conflictText } from './StatusDialog';
import ReportDialog from './ReportDialog';
import ReportFeed from './ReportFeed';
import EventList from './EventList';

const RANK = Object.fromEntries(STATUSES.map((status, index) => [status, index]));

/** Which status moves are buttons and which are rollbacks. */
export function splitMoves(unit, next) {
  const forward = [];
  const back = [];
  for (const to of next || []) {
    const release = to === 'free' && TIMED.has(unit.status);
    const open = to === 'free' && unit.status === 'not_for_sale';
    if (to === 'not_for_sale' || release || open || RANK[to] > RANK[unit.status]) forward.push(to);
    else back.push(to);
  }
  // Moving the sale on comes first, then releasing, then closing sales.
  const weight = (to) => (to === 'not_for_sale' ? 3 : to === 'free' && unit.status !== 'not_for_sale' ? 2 : 1);
  forward.sort((a, b) => weight(a) - weight(b));
  return { forward, back };
}

function actionLabel(t, unit, to) {
  if (to === 'free' && TIMED.has(unit.status)) return t('mp.action.release');
  if (to === 'free' && unit.status === 'not_for_sale') return t('mp.action.open');
  return t(`mp.action.btn.${to}`);
}

/**
 * The side card of a node (§9.4–9.5) — opens over the plan, the chessboard
 * or the registry without leaving the page. Units: status, price, actions by
 * right, tabs Overview · Construction · Sale · Prices · History. Levels and
 * buildings: summary by status, readiness, reports.
 */
export default function UnitCard({ nodeId, version, onClose, onChanged, onNavigate, presentation, dealId }) {
  const { t, locale } = useLocale();
  const known = (key, fallback) => {
    const text = t(key);
    return text === key ? fallback : text;
  };
  const { message } = App.useApp();
  const { settings, crmEnabled } = useMp();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [report, setReport] = useState(null);
  const [price, setPrice] = useState(null);
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    try {
      const res = await mpApi.node(nodeId, presentation);
      setCard(res.data);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err);
      return null;
    }
  }, [nodeId, presentation]);

  useEffect(() => {
    setCard(null);
    setTab('overview');
    load();
  }, [load]);

  // Fresh data when someone else changes this unit (the plan passes the live version).
  useEffect(() => {
    if (card && version && card.node.unit && card.node.unit.version !== version) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && !document.querySelector('.ant-modal-wrap') && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const node = card?.node;
  const unit = node?.unit;
  const actions = card?.actions || {};
  const done = async (next) => {
    setDialog(null);
    if (next) {
      onChanged?.(next);
      await load();
    }
  };

  if (error) {
    return (
      <aside className="mp-card">
        <div className="mp-card__head"><button type="button" className="mp-card__close" onClick={onClose} aria-label={t('common.close')}>✕</button></div>
        <Empty icon="⚠️" title={errorMessage(error)} />
      </aside>
    );
  }
  if (!card) {
    return (
      <aside className="mp-card" aria-busy="true">
        <div className="mp-card__body"><Skeleton active title={{ width: '60%' }} paragraph={{ rows: 8 }} /></div>
      </aside>
    );
  }

  const { forward, back } = unit ? splitMoves(unit, actions.next) : { forward: [], back: [] };
  const summary = card.summary;
  const tabs = [
    { key: 'overview', label: t('mp.card.overview') },
    card.stages || card.reports?.length ? { key: 'build', label: t('mp.card.build') } : null,
    unit && (unit.manager || unit.client || unit.contract || unit.booking) && !presentation ? { key: 'sale', label: t('mp.card.sale') } : null,
    unit && card.priceHistory?.length ? { key: 'prices', label: t('mp.card.prices') } : null,
    !presentation ? { key: 'history', label: t('mp.card.history') } : null,
  ].filter(Boolean);

  const priceSave = async () => {
    try {
      const res = await mpApi.updateNode(node.id, { unit: { price: price.value }, version: unit.version, reason: price.reason });
      setPrice(null);
      message.success(t('mp.card.priceSaved'));
      onChanged?.(res.data.node);
      load();
    } catch (err) {
      message.error(conflictText(err, t));
    }
  };

  return (
    <aside className="mp-card" aria-label={node.code || node.name}>
      <div className="mp-card__head">
        <nav className="mp-card__crumbs" aria-label={t('mp.card.path')}>
          {card.breadcrumbs.map((item) => (
            <button key={item.id} type="button" onClick={() => onNavigate?.(item.id)}>{item.code || item.name}</button>
          ))}
        </nav>
        <button type="button" className="mp-card__close" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </div>
      <div className="mp-card__body">
        <div className="mp-card__title">
          <TypeIcon node={node} size={26} />
          <div>
            <h2>{node.code || node.name}</h2>
            <p>{[node.code ? node.name : null, node.kind === 'level' ? known(`mp.level.${node.levelKey}`, node.levelKey) : node.type?.name].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        {unit && (
          <div className="mp-card__sale">
            <StatusTag status={unit.status} size="lg" manager={unit.status && TIMED.has(unit.status) ? unit.manager : null} />
            {unit.booking?.endsAt && !presentation && <Countdown endsAt={unit.booking.endsAt} />}
            {unit.price !== undefined && (
              <div className="mp-card__price">
                <Money amount={unit.price} currency={unit.currency} />
                {unit.pricePerM2 && <span>{formatMoney(Math.round(unit.pricePerM2), unit.currency, locale)} / м²</span>}
                {actions.editPrice && (
                  <Tooltip title={t('mp.card.editPrice')}>
                    <button type="button" className="mp-iconbtn" onClick={() => setPrice({ value: unit.price, reason: '' })} aria-label={t('mp.card.editPrice')}>✎</button>
                  </Tooltip>
                )}
              </div>
            )}
            {unit.minPrice !== undefined && unit.minPrice !== null && <div className="mp-card__min">{t('mp.card.minPrice')}: <Money amount={unit.minPrice} currency={unit.currency} /></div>}
          </div>
        )}
        {!presentation && (forward.length > 0 || back.length > 0 || actions.extend || actions.report || unit?.deal) && (
          <div className="mp-card__actions">
            {forward.map((to, index) => (
              <Button key={to} type={index === 0 && to !== 'not_for_sale' && !(to === 'free' && TIMED.has(unit.status)) ? 'primary' : 'default'} danger={to === 'free' && TIMED.has(unit.status)} onClick={() => setDialog({ node, to })}>
                {actionLabel(t, unit, to)}
              </Button>
            ))}
            {actions.extend && <Button onClick={() => setDialog({ node, extend: true })}>{t('mp.action.extend')}</Button>}
            {back.length > 0 && <Button onClick={() => setDialog({ node, rollback: true })}>{t('mp.action.rollback')}…</Button>}
            {unit?.deal && crmEnabled && (
              <Link className="ant-btn ant-btn-default mp-linkbtn" to={`/app/crm/deals/${unit.deal.id}`}>{t('mp.card.openDeal')} ↗</Link>
            )}
            {actions.report && <Button onClick={() => setReport({ projectId: node.projectId, nodeIds: [node.id] })}>＋ {t('mp.report.short')}</Button>}
          </div>
        )}
        <Tabs activeKey={tab} onChange={setTab} items={tabs} size="small" className="mp-card__tabs" />
        {tab === 'overview' && (
          <div className="mp-card__pane">
            {node.readiness !== null && node.readiness !== undefined && (
              <div className="mp-card__ready">
                <span>{t('mp.card.readiness')}</span>
                <Readiness value={node.readiness} />
                {node.stage && <em>{node.stage.name}</em>}
              </div>
            )}
            {summary && summary.total > 0 && !unit && (
              <div className="mp-card__summary">
                <div className="mp-statusbar" role="img" aria-label={t('mp.card.byStatus')}>
                  {STATUSES.filter((status) => summary.byStatus[status]).map((status) => (
                    <span key={status} style={{ flex: summary.byStatus[status], background: settings.statusColors?.[status] }} title={`${t(`mp.status.${status}`)}: ${summary.byStatus[status]}`} />
                  ))}
                </div>
                <ul className="mp-card__counts">
                  {STATUSES.filter((status) => summary.byStatus[status]).map((status) => (
                    <li key={status}>
                      <StatusTag status={status} />
                      <b>{formatNumber(summary.byStatus[status], locale)}</b>
                      <span>{formatArea(summary.area[status], locale)}</span>
                      {summary.sum[status] && <span className="mp-muted">{sumLines(summary.sum[status], locale).join(' · ')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unit && (
              <Facts
                items={[
                  { label: t('mp.f.areaTotal'), value: unit.areaTotal !== null ? formatArea(unit.areaTotal, locale) : null },
                  { label: t('mp.f.areaLiving'), value: unit.areaLiving !== null ? formatArea(unit.areaLiving, locale) : null },
                  { label: t('mp.f.areaPlot'), value: unit.areaPlot !== null ? formatArea(unit.areaPlot, locale) : null },
                  { label: t('mp.f.areaTerrace'), value: unit.areaTerrace !== null ? formatArea(unit.areaTerrace, locale) : null },
                  { label: t('mp.f.rooms'), value: unit.rooms },
                  { label: t('mp.f.bedrooms'), value: unit.bedrooms },
                  { label: t('mp.f.bathrooms'), value: unit.bathrooms },
                  { label: t('mp.f.levels'), value: unit.levels },
                  { label: t('mp.f.floor'), value: unit.floor },
                  { label: t('mp.f.number'), value: unit.number },
                  { label: t('mp.f.ceiling'), value: unit.ceiling ? `${unit.ceiling} м` : null },
                  { label: t('mp.f.finishing'), value: unit.finishing ? t(`mp.finishing.${unit.finishing}`) : null },
                  { label: t('mp.f.paymentForms'), value: unit.paymentForms?.length ? unit.paymentForms.map((item) => t(`mp.payment.${item}`)).join(', ') : null, wide: true },
                  { label: t('mp.f.discount'), value: unit.discountPct ? formatPercent(unit.discountPct, locale) : null },
                ]}
              />
            )}
            <Facts
              items={[
                { label: t('mp.f.area'), value: !unit && node.area ? formatArea(node.area, locale) : null },
                { label: t('mp.f.handover'), value: node.handover ? t(`mp.finishing.${node.handover}`) : null },
                { label: t('mp.f.contractor'), value: node.contractor },
                { label: t('mp.f.plan'), value: node.planStart || node.planEnd ? `${fmtDate(node.planStart) || '…'} — ${fmtDate(node.planEnd) || '…'}` : null },
                ...Object.entries(node.attrs || {}).map(([key, value]) => ({ label: known(`mp.attr.${key}`, key), value: Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? t('common.yes') : t('common.no')) : String(value) })),
                { label: t('mp.f.buildUser'), value: card.responsible?.build ? <Person user={card.responsible.build} /> : null },
                { label: t('mp.f.salesUser'), value: card.responsible?.sales ? <Person user={card.responsible.sales} /> : null },
              ]}
            />
            {node.description && <p className="mp-card__desc">{node.description}</p>}
            {card.media?.length > 0 && (
              <div className="mp-gallery">
                <Image.PreviewGroup>
                  {card.media.filter((item) => item.mime?.startsWith('image/')).map((item) => (
                    <Image key={item.id} src={item.thumbUrl || item.url} preview={{ src: item.url }} alt={item.name} width={88} height={66} />
                  ))}
                </Image.PreviewGroup>
                {card.media.filter((item) => !item.mime?.startsWith('image/')).map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="mp-doc">📄 {item.name}</a>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'build' && (
          <div className="mp-card__pane">
            {card.stages && (
              <>
                <div className="mp-card__ready">
                  <span>{t('mp.card.readiness')}</span>
                  <Readiness value={card.stages.readiness} />
                  <ScheduleBadge schedule={card.stages.schedule} alertDays={settings.delayAlertDays} />
                </div>
                {card.stages.inherited && <p className="mp-muted mp-small">{t('mp.card.inherited')}</p>}
                <ol className="mp-stages">
                  {card.stages.stages.map((stage) => (
                    <li key={stage.id} className={`is-${stage.state}`}>
                      <span className="mp-stages__name">{stage.name}</span>
                      <span className="mp-stages__bar"><span style={{ width: `${stage.percent}%` }} /></span>
                      <b>{formatPercent(stage.percent, locale)}</b>
                      {(stage.planEnd || stage.factEnd) && (
                        <span className="mp-stages__dates">
                          {stage.planEnd && <span>{t('mp.card.planEnd', { date: fmtDate(stage.planEnd) })}</span>}
                          {stage.factEnd && <span>{t('mp.card.factEnd', { date: fmtDate(stage.factEnd) })}</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <ReportFeed reports={card.reports} compact />
          </div>
        )}
        {tab === 'sale' && unit && (
          <div className="mp-card__pane">
            <Facts
              items={[
                { label: t('mp.f.manager'), value: unit.manager ? <Person user={unit.manager} /> : null },
                { label: t('mp.f.bookingUntil'), value: unit.booking?.endsAt ? <>{fmtDateTime(unit.booking.endsAt)} <Countdown endsAt={unit.booking.endsAt} short /></> : null, wide: true },
                { label: t('mp.f.extensions'), value: unit.booking ? unit.booking.extensions : null },
                { label: t('mp.f.client'), value: unit.client?.name },
                { label: t('mp.f.deal'), value: unit.deal ? <Link to={`/app/crm/deals/${unit.deal.id}`}>{unit.deal.title}</Link> : null, wide: true },
                { label: t('mp.f.contract'), value: unit.contract?.number ? `№ ${unit.contract.number}${unit.contract.date ? ` · ${fmtDate(unit.contract.date)}` : ''}` : null, wide: true },
                { label: t('mp.f.contractAmount'), value: unit.contract?.amount ? formatMoney(unit.contract.amount, unit.currency, locale) : null },
                { label: t('mp.f.paid'), value: unit.paidAmount !== null && unit.paidAmount !== undefined ? formatMoney(unit.paidAmount, unit.currency, locale) : null },
                { label: t('mp.f.remaining'), value: unit.remaining !== null && unit.remaining !== undefined ? formatMoney(unit.remaining, unit.currency, locale) : null },
                { label: t('mp.f.actDate'), value: unit.contract?.actDate ? fmtDate(unit.contract.actDate) : null },
              ]}
            />
          </div>
        )}
        {tab === 'prices' && (
          <div className="mp-card__pane">
            <ul className="mp-prices">
              {card.priceHistory.map((item) => (
                <li key={item.id}>
                  <span className="mp-prices__when">{fmtDateTime(item.createdAt)}</span>
                  <span className="mp-prices__change">
                    {formatMoney(item.from, item.currency, locale)} → <b>{formatMoney(item.to, item.currency, locale)}</b>
                    {item.from ? <em className={item.to >= item.from ? 'is-up' : 'is-down'}>{item.to >= item.from ? '▲' : '▼'} {formatPercent(Math.abs(((item.to - item.from) / item.from) * 100), locale)}</em> : null}
                  </span>
                  <span className="mp-muted">{[item.author, item.reason].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'history' && (
          <div className="mp-card__pane">
            <EventList nodeId={node.id} />
          </div>
        )}
      </div>
      <StatusDialog open={dialog} onClose={done} onConflict={() => { load(); onChanged?.(null); }} caps={card.caps} dealId={dealId} />
      <ReportDialog open={report} onClose={(created) => { setReport(null); if (created) { load(); onChanged?.(null); } }} />
      <Modal open={Boolean(price)} title={t('mp.card.editPrice')} onCancel={() => setPrice(null)} onOk={priceSave} okText={t('common.save')} cancelText={t('common.cancel')} destroyOnClose>
        {price && (
          <>
            <label className="mp-ffield">
              <span>{t('mp.f.price')}</span>
              <InputNumber value={price.value} onChange={(value) => setPrice({ ...price, value })} min={0} style={{ width: '100%' }} addonAfter={unit?.currency} />
            </label>
            <label className="mp-ffield">
              <span>{t('mp.action.reason')}</span>
              <Input value={price.reason} onChange={(event) => setPrice({ ...price, reason: event.target.value })} maxLength={300} />
            </label>
          </>
        )}
      </Modal>
    </aside>
  );
}

export { conflictText };
