import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Result, Segmented, Spin, Tooltip } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { useMp, useProject } from '../MpContext';
import { EMPTY_FILTER, can, descendants, filterActive, formatArea, formatMoney, formatPercent, matches, readStore, shortLabel, userKey, writeStore } from '../lib';
import { Legend, FilterButton, SearchBox } from '../components/Filters';
import { StatusTag, TypeIcon } from '../components/bits';
import UnitCard from '../components/UnitCard';
import PlanCanvas, { bboxOf } from '../plan/PlanCanvas';
import TilesView from '../plan/TilesView';
import { nodeFill, unitsUnder } from '../plan/colors';

/**
 * The interactive site plan (spec §9.1): background with contours, layers
 * Sales · Construction · Types, legend with counters, filters, hover
 * tooltips, breadcrumbs, the side card without leaving the page, live
 * colours. Without contours the same data shows as tiles ("Схема").
 */
export default function PlanPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { settings } = useMp();
  const { project, nodes, tree, plans, contours, caps, error, data, live, presentation, refreshUnits, reload } = useProject();
  const canvas = useRef(null);
  const [hover, setHover] = useState(null);
  const [filter, setFilterState] = useState(() => ({ ...EMPTY_FILTER, ...readStore(userKey(user, 'filter'), {}) }));
  const setFilter = (next) => {
    setFilterState(next);
    writeStore(userKey(user, 'filter'), { ...next, q: '' });
  };
  const layer = ['sales', 'build', 'types'].includes(search.get('layer')) ? search.get('layer') : can(caps, 'status.view') ? 'sales' : 'build';
  const selectedId = Number(search.get('node')) || null;
  const focusId = Number(search.get('focus')) || null;
  const focus = focusId ? tree.byId.get(focusId) : null;
  const dealId = Number(search.get('deal')) || null;

  const setParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(window.location.search);
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
      setSearch(next, { replace: key !== 'node' });
    },
    [setSearch]
  );

  // The plan to draw: the focused node's own close-up, an ancestor's, or the project's.
  const plan = useMemo(() => {
    if (!plans.length) return null;
    const chain = focus ? [...focus.path].reverse() : [];
    for (const id of chain) {
      const own = plans.find((item) => item.nodeId === id);
      if (own) return own;
    }
    return plans.find((item) => !item.nodeId) || plans[0];
  }, [plans, focus]);
  const [view, setView] = useState(() => readStore(userKey(user, 'planView'), 'plan'));
  const mode = plan && view === 'plan' ? 'plan' : 'tiles';

  const filtering = filterActive(filter);
  const shapes = useMemo(() => {
    if (!plan) return [];
    const ctx = { settings, tree };
    return contours
      .filter((item) => item.planId === plan.id && tree.byId.has(item.nodeId))
      .map((item) => {
        const node = tree.byId.get(item.nodeId);
        const level = node.kind === 'level';
        const fill = nodeFill(node, layer, ctx);
        const under = !node.unit && filtering ? unitsUnder(node, tree) : null;
        const dim = filtering && (node.unit ? !matches(node, filter, user?.id) : under.length > 0 && !under.some((item2) => matches(item2, filter, user?.id)));
        return {
          id: node.id,
          points: item.points,
          level,
          fill: level ? (layer === 'sales' ? 'rgba(148,163,184,.10)' : 'rgba(148,163,184,.08)') : fill,
          stroke: level ? 'rgba(71,85,105,.75)' : 'rgba(15,23,42,.55)',
          dim,
          selected: node.id === selectedId || (level && node.id === focusId),
          hover: hover?.id === node.id,
          label: shortLabel(node),
        };
      });
  }, [plan, contours, tree, layer, filter, filtering, selectedId, focusId, hover?.id, settings, user?.id]);

  // Focus: zoom to the node's contour on this plan (or the whole plan).
  useEffect(() => {
    if (mode !== 'plan' || !canvas.current) return;
    const shape = focusId ? contours.find((item) => item.planId === plan?.id && item.nodeId === focusId) : null;
    if (shape) canvas.current.fitBox(bboxOf(shape.points), 0.12);
    else canvas.current.fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, plan?.id, mode]);

  const scopeUnits = useMemo(() => (focus ? unitsUnder(focus, tree) : nodes.filter((node) => node.unit)), [focus, tree, nodes]);
  const visibleUnits = useMemo(() => scopeUnits.filter((node) => !filter.q || matches(node, { q: filter.q }, user?.id)), [scopeUnits, filter.q, user?.id]);
  const shown = filtering ? scopeUnits.filter((node) => matches(node, filter, user?.id)).length : null;

  const select = (node) => {
    if (!node) return;
    if (node.kind === 'level') {
      setSearch((prev) => {
        const next = new URLSearchParams(prev);
        next.set('focus', String(node.id));
        next.set('node', String(node.id));
        return next;
      });
    } else setParam('node', node.id);
  };

  if (error) return <Result status="warning" title={errorMessage(error)} extra={<Button onClick={reload}>{t('common.retry')}</Button>} />;
  if (!data) {
    return (
      <div className="page-fallback">
        <Spin />
      </div>
    );
  }

  const chain = focus ? focus.path.map((id) => tree.byId.get(id)).filter(Boolean) : [];
  const hovered = hover ? tree.byId.get(hover.id) : null;
  const togglePresentation = () => {
    const next = new URLSearchParams(window.location.search);
    if (presentation) next.delete('presentation');
    else next.set('presentation', '1');
    navigate(`${window.location.pathname}?${next.toString()}`);
  };

  return (
    <div className={`mp-plan${selectedId ? ' has-card' : ''}${presentation ? ' is-presentation' : ''}`}>
      <div className="mp-planbar">
        <div className="mp-planbar__row">
          <nav className="mp-crumbs" aria-label={t('mp.card.path')}>
            <button type="button" onClick={() => { setParam('focus', null); }} className={!focus ? 'is-current' : ''}>{project.name}</button>
            {chain.map((node) => (
              <button key={node.id} type="button" onClick={() => setParam('focus', node.id)} className={node.id === focusId ? 'is-current' : ''}>
                {shortLabel(node)}
              </button>
            ))}
          </nav>
          <span className="mod-toolbar__grow" />
          {live && <span className="mp-live" title={t('mp.plan.liveHint')}><span />{t('mp.plan.live')}</span>}
          {!presentation && <HelpButton id="masterplan" />}
          <Tooltip title={presentation ? t('mp.plan.presentationOff') : t('mp.plan.presentationHint')}>
            <Button onClick={togglePresentation} type={presentation ? 'primary' : 'default'} icon={<span aria-hidden="true">👁</span>}>
              <span className="mp-hide-sm">{presentation ? t('mp.plan.presentationOff') : t('mp.plan.presentation')}</span>
            </Button>
          </Tooltip>
        </div>
        <div className="mp-planbar__row">
          <Segmented
            value={layer}
            onChange={(value) => setParam('layer', value)}
            options={[
              can(caps, 'status.view') ? { value: 'sales', label: t('mp.layer.sales') } : null,
              can(caps, 'build.view') ? { value: 'build', label: t('mp.layer.build') } : null,
              { value: 'types', label: t('mp.layer.types') },
            ].filter(Boolean)}
            aria-label={t('mp.layer.label')}
          />
          {plan && (
            <Segmented
              value={mode}
              onChange={(value) => {
                setView(value);
                writeStore(userKey(user, 'planView'), value);
              }}
              options={[
                { value: 'plan', label: t('mp.plan.drawing') },
                { value: 'tiles', label: t('mp.plan.tiles') },
              ]}
              aria-label={t('mp.plan.view')}
            />
          )}
          <SearchBox value={filter.q} onChange={(q) => setFilter({ ...filter, q })} />
          <FilterButton value={filter} onChange={setFilter} caps={caps} />
          {shown !== null && <span className="mp-shown">{t('mp.plan.shown', { n: shown, total: scopeUnits.length })}</span>}
        </div>
        <Legend units={layer === 'types' ? (focus ? [focus, ...descendants(tree, focus.id)] : nodes) : visibleUnits} filter={filter} onChange={setFilter} layer={layer} caps={caps} />
      </div>

      {dealId && !presentation && (
        <div className="mp-pickbar">
          <span>{t('mp.plan.picking', { id: dealId })}</span>
          <Link to={`/app/crm/deals/${dealId}`}>{t('mp.plan.backToDeal')}</Link>
          <button type="button" onClick={() => setParam('deal', null)} aria-label={t('common.close')}>✕</button>
        </div>
      )}
      <div className="mp-plan__stage">
        {mode === 'plan' ? (
          <PlanCanvas
            ref={canvas}
            width={plan.width}
            height={plan.height}
            background={plan.url}
            shapes={shapes}
            onShapeClick={(id) => select(tree.byId.get(id))}
            onShapeHover={(id, at) => setHover(id ? { id, ...at } : null)}
            onBackgroundClick={() => setParam('node', null)}
            ariaLabel={t('mp.plan.aria')}
          >
            <div className="mp-zoom">
              <button type="button" onClick={() => canvas.current?.zoom(1.4)} aria-label={t('mp.plan.zoomIn')}>＋</button>
              <button type="button" onClick={() => canvas.current?.zoom(1 / 1.4)} aria-label={t('mp.plan.zoomOut')}>－</button>
              <button type="button" onClick={() => { setParam('focus', null); canvas.current?.fit(); }} aria-label={t('mp.plan.fit')} title={t('mp.plan.fit')}>⤢</button>
            </div>
            {hovered && hover && (
              <div className="mp-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
                <div className="mp-tip__head">
                  <TypeIcon node={hovered} size={16} />
                  <b>{shortLabel(hovered)}</b>
                  <span>{hovered.kind === 'level' ? '' : hovered.type?.name}</span>
                </div>
                {hovered.unit?.status && <StatusTag status={hovered.unit.status} manager={hovered.unit.manager && !presentation && ['reserve', 'booking'].includes(hovered.unit.status) ? hovered.unit.manager : null} />}
                <div className="mp-tip__facts">
                  {(hovered.unit?.areaTotal || hovered.area) && <span>{formatArea(hovered.unit?.areaTotal || hovered.area, locale)}</span>}
                  {hovered.unit?.areaPlot && <span>{t('mp.f.plotShort')} {formatArea(hovered.unit.areaPlot, locale)}</span>}
                  {hovered.unit?.price !== undefined && hovered.unit?.price !== null && <b>{formatMoney(hovered.unit.price, hovered.unit.currency, locale)}</b>}
                  {hovered.readiness !== null && hovered.readiness !== undefined && can(caps, 'build.view') && <span>{t('mp.card.readiness')}: {formatPercent(hovered.readiness, locale)}</span>}
                  {hovered.kind === 'level' && <span>{t('mp.plan.units', { n: unitsUnder(hovered, tree).length })}</span>}
                </div>
              </div>
            )}
          </PlanCanvas>
        ) : (
          <div className="mp-plan__tiles">
            {!plan && project.canConfigure && !presentation && (
              <div className="mp-hint">
                <span>{t('mp.plan.noPlan')}</span>
                <Link to={`/app/masterplan/p/${project.id}/structure?tab=plans`}>{t('mp.plan.uploadPlan')} →</Link>
              </div>
            )}
            {nodes.length ? (
              <TilesView tree={tree} root={focus} layer={layer} filter={filter} filtering={filtering} selectedId={selectedId} onSelect={select} userId={user?.id} />
            ) : (
              <div className="mp-hint is-big">
                <strong>{t('mp.plan.emptyTitle')}</strong>
                <span>{t('mp.plan.emptyText')}</span>
                {project.canConfigure && <Link to={`/app/masterplan/p/${project.id}/structure`}>{t('mp.plan.toStructure')} →</Link>}
              </div>
            )}
          </div>
        )}
        {selectedId && tree.byId.has(selectedId) && (
          <UnitCard
            key={selectedId}
            nodeId={selectedId}
            version={tree.byId.get(selectedId)?.unit?.version}
            presentation={presentation}
            dealId={dealId}
            onClose={() => setParam('node', null)}
            onChanged={(node) => (node ? refreshUnits([node.id]) : reload())}
            onNavigate={(id) => select(tree.byId.get(id))}
          />
        )}
      </div>
    </div>
  );
}
