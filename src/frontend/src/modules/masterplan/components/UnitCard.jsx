import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, InputNumber, Input, Modal, Popover, Skeleton, Tabs, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { Person } from '../../shared/People';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { STATUSES, TIMED, can, descendants, formatArea, formatMoney, formatNumber, formatPercent, oldNumberLabel, sumLines } from '../lib';
import { Countdown, Empty, Facts, Money, Readiness, ScheduleBadge, StatusTag, TypeIcon } from './bits';
import StatusDialog, { conflictText } from './StatusDialog';
import ReportDialog from './ReportDialog';
import ReportFeed from './ReportFeed';
import EventList from './EventList';
import BuildingBlock, { BuildingHead } from './BuildingCard';
import MediaBlock from './MediaBlock';
import PaymentOptions from './PaymentOptions';
import { BulkStatusDialog } from './BulkDialogs';
import MigrateDialog from './MigrateDialog';

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
export default function UnitCard({ nodeId: openId, version, onClose, onChanged, onNavigate, presentation, dealId }) {
  const { t, locale } = useLocale();
  // The card may walk to another node (a unit of this building, "← building") without the page's help.
  const [nodeId, setNodeId] = useState(openId);
  useEffect(() => setNodeId(openId), [openId]);
  const go = (id) => (onNavigate ? onNavigate(id) : setNodeId(id));
  // The project's live map (absent on pages outside a project, e.g. bookings).
  const projectData = useProject();
  const tree = projectData?.tree || null;
  const [closeAll, setCloseAll] = useState(null);
  const [oldEdit, setOldEdit] = useState(null);
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
  const [migrate, setMigrate] = useState(null);
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
    if (card && version && nodeId === openId && card.node.unit && card.node.unit.version !== version) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // A building: fresh aggregate when any of its units changes in the live map.
  const unitsSignature = useMemo(() => {
    if (!tree || !tree.byId.has(nodeId) || tree.byId.get(nodeId).unit) return '';
    return descendants(tree, nodeId).filter((item) => item.unit).map((item) => `${item.id}:${item.unit.status}:${item.unit.version}:${item.unit.price}`).join(',');
  }, [tree, nodeId]);
  const seenSignature = useRef(unitsSignature);
  useEffect(() => {
    if (seenSignature.current !== unitsSignature && card?.building) load();
    seenSignature.current = unitsSignature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsSignature]);

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
  const building = card.building;
  // Header facts of the unified card: the sector (nearest level above), the old number, the building of a unit.
  const sector = [...card.breadcrumbs].reverse().find((item) => item.kind === 'level') || null;
  const parentBuilding = node.kind === 'unit' && card.breadcrumbs.length && card.breadcrumbs[card.breadcrumbs.length - 1].kind === 'object' ? card.breadcrumbs[card.breadcrumbs.length - 1] : null;
  const oldNumber = oldNumberLabel(node.attrs?.oldNumber);
  const unitIds = building && tree ? descendants(tree, node.id).filter((item) => item.unit).map((item) => item.id) : [];
  const ownMediaEdit = Boolean(actions.configure) || can(card.caps, 'media.edit');
  // attrs follow the server's rule: configure, unit.edit or build.edit.
  const attrsEdit = !presentation && node.kind !== 'level' && Boolean(actions.configure || actions.editUnit || actions.editBuild);
  const saveOld = async () => {
    try {
      await mpApi.updateNode(node.id, { attrs: { oldNumber: (oldEdit || '').trim().replace(/^№\s*/, '') || null } });
      setOldEdit(null);
      message.success(t('common.saved'));
      onChanged?.(null);
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
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
            <button key={item.id} type="button" onClick={() => go(item.id)}>{item.code || item.name}</button>
          ))}
        </nav>
        <button type="button" className="mp-card__close" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </div>
      <div className="mp-card__body">
        {parentBuilding && (
          <button type="button" className="mp-card__back" onClick={() => go(parentBuilding.id)}>
            ← {parentBuilding.name || parentBuilding.code}
          </button>
        )}
        <div className="mp-card__title">
          <TypeIcon node={node} size={26} />
          <div>
            <h2>{node.code || node.name}</h2>
            <p>{[node.code ? node.name : null, node.kind === 'level' ? known(`mp.level.${node.levelKey}`, node.levelKey) : node.type?.name].filter(Boolean).join(' · ')}</p>
            {(sector || oldNumber || attrsEdit) && node.kind !== 'level' && (
              <div className="mp-card__chips">
                {sector && <button type="button" className="mp-chip" onClick={() => go(sector.id)}>{sector.name || sector.code}</button>}
                {oldNumber && <span className="mp-chip is-was">{t('mp.labels.was', { n: oldNumber })}</span>}
                {attrsEdit && (
                  <Popover
                    trigger="click"
                    open={oldEdit !== null}
                    onOpenChange={(open) => setOldEdit(open ? node.attrs?.oldNumber || '' : null)}
                    title={t('mp.attr.oldNumber')}
                    content={
                      <div className="mp-oldedit">
                        <Input autoFocus value={oldEdit || ''} onChange={(event) => setOldEdit(event.target.value)} onPressEnter={saveOld} maxLength={40} placeholder={t('mp.labels.oldHint')} />
                        <Button type="primary" onClick={saveOld}>{t('common.save')}</Button>
                      </div>
                    }
                  >
                    <button type="button" className="mp-chip is-edit" aria-label={t('mp.attr.oldNumber')}>{oldNumber ? '✎' : `＋ ${t('mp.labels.oldAdd')}`}</button>
                  </Popover>
                )}
              </div>
            )}
          </div>
        </div>
        {building && <BuildingHead building={building} presentation={presentation} />}
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
        {unit && unit.price !== undefined && <PaymentOptions unit={unit} project={projectData?.project || null} presentation={presentation} />}
        {!presentation && (forward.length > 0 || back.length > 0 || actions.extend || actions.report || actions.migrate || unit?.deal || (actions.closeAll && unitIds.length > 0)) && (
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
            {actions.closeAll && unitIds.length > 0 && <Button onClick={() => setCloseAll({ ids: unitIds, to: 'not_for_sale' })}>{t('mp.bld.closeAll')}</Button>}
            {actions.report && <Button onClick={() => setReport({ projectId: node.projectId, nodeIds: [node.id] })}>＋ {t('mp.report.short')}</Button>}
            {actions.migrate && <Button onClick={() => setMigrate({ node })}>{t('mp.migrate.action')}…</Button>}
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
            {building && (
              <>
                <Facts
                  items={[
                    { label: t('mp.attr.floors'), value: node.attrs?.floors || (building.floors.length ? building.floors.length : null) },
                    { label: t('mp.bld.totalUnits'), value: formatNumber(building.total, locale) },
                    { label: t('mp.bld.saleArea'), value: building.area ? formatArea(building.area, locale) : null },
                    { label: t('mp.bld.freeArea'), value: building.freeArea ? formatArea(building.freeArea, locale) : null },
                    { label: t('mp.f.finishing'), value: building.finishing.length ? building.finishing.map((key) => t(`mp.finishing.${key}`)).join(', ') : null },
                    { label: t('mp.f.paymentForms'), value: building.paymentForms.length ? building.paymentForms.map((key) => t(`mp.payment.${key}`)).join(', ') : null, wide: true },
                  ]}
                />
                <BuildingBlock
                  node={node}
                  building={building}
                  tree={tree}
                  projectId={node.projectId}
                  presentation={presentation}
                  canReserve={Boolean(actions.reserveUnits) && Boolean(tree)}
                  onOpenUnit={go}
                  onReserve={(target) => setDialog({ node: target, to: 'reserve' })}
                />
              </>
            )}
            {summary && summary.total > 0 && !unit && !building && (
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
                ...Object.entries(node.attrs || {}).filter(([key]) => key !== 'oldNumber' && !(building && key === 'floors')).map(([key, value]) => ({ label: known(`mp.attr.${key}`, key), value: Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? t('common.yes') : t('common.no')) : String(value) })),
                { label: t('mp.f.buildUser'), value: card.responsible?.build ? <Person user={card.responsible.build} /> : null },
                { label: t('mp.f.salesUser'), value: card.responsible?.sales ? <Person user={card.responsible.sales} /> : null },
              ]}
            />
            {node.description && <p className="mp-card__desc">{node.description}</p>}
            {card.series && (
              <MediaBlock
                title={t('mp.series.title')}
                name={card.series}
                hint={actions.seriesMedia ? t('mp.series.hint') : null}
                items={card.seriesMedia || []}
                target={{ projectId: node.projectId, series: card.series }}
                canEdit={Boolean(actions.seriesMedia) && !presentation}
                onChanged={load}
              />
            )}
            <MediaBlock title={t('mp.series.own')} items={card.media || []} target={{ projectId: node.projectId, nodeId: node.id }} canEdit={ownMediaEdit && !presentation && node.kind !== 'level'} onChanged={load} />
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
      <BulkStatusDialog open={closeAll} onClose={(changed) => { setCloseAll(null); if (changed) { load(); onChanged?.(null); } }} />
      <StatusDialog open={dialog} onClose={done} onConflict={() => { load(); onChanged?.(null); }} caps={card.caps} dealId={dealId} />
      <MigrateDialog open={migrate} onClose={(next) => { setMigrate(null); if (next) { onChanged?.(next === true ? null : next); load(); } }} />
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
