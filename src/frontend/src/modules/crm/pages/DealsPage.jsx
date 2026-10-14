import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Result } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { useRegional } from '../../../lib/datetime';
import { VIEWS, filterParams, formatNumber, lastView, readStore, userKey, writeStore } from '../lib';
import FilterBar, { useStoredFilter } from '../components/FilterBar';
import CreateDealDialog from '../components/CreateDealDialog';
import { CounterChips, CreateButton, PipelineSwitcher, ViewSwitch } from '../components/Toolbar';
import { Glyph } from '../components/bits';
import KanbanView from '../views/KanbanView';
import ListView from '../views/ListView';
import ActivitiesView from '../views/ActivitiesView';
import CalendarView from '../views/CalendarView';
import DealPanel from '../panel/DealPanel';

/**
 * /app/crm/deals/:view (kanban | list | activities | calendar) and
 * /app/crm/deals/:id — the deal card over the last view. ?pipeline= picks
 * the pipeline; the filter and the view are remembered per person.
 */
export default function DealsPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { param } = useParams();
  const [search, setSearch] = useSearchParams();
  const { pipelines, pipelineById, defaultPipeline, version, touch } = useCrm();
  const [filterState, setFilterState] = useStoredFilter(userKey(user, 'filter'));
  const [counters, setCounters] = useState(null);
  const [creating, setCreating] = useState(null);

  const isView = VIEWS.includes(param);
  const dealId = !isView && /^\d+$/.test(param || '') ? Number(param) : null;
  const view = isView ? param : lastView(user);

  // Remember the view; an unknown address falls back to it.
  useEffect(() => {
    if (isView) writeStore(userKey(user, 'view'), param);
    else if (!dealId) navigate(`/app/crm/deals/${view}${window.location.search}`, { replace: true });
  }, [isView, param, dealId, view, user, navigate]);

  const storedPipeline = readStore(userKey(user, 'pipeline'), null);
  const pipeline = pipelineById(search.get('pipeline')) || pipelineById(storedPipeline) || defaultPipeline;

  const setPipeline = (id) => {
    writeStore(userKey(user, 'pipeline'), id);
    const next = new URLSearchParams(search);
    next.set('pipeline', String(id));
    setSearch(next, { replace: true });
  };

  // «Мои дела» from the sidebar: my open deals on the Activities board.
  useEffect(() => {
    if (search.get('mine') === '1') {
      setFilterState({ presetId: 'mine', filter: { group: 'open', owners: ['me'] } });
      const next = new URLSearchParams(search);
      next.delete('mine');
      setSearch(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { filter } = filterState;
  const regional = useRegional();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => ({ pipeline: pipeline?.id, ...filterParams(filter, pipeline) }), [pipeline, filter, regional.timeZone, regional.weekStart]);
  const countersKey = JSON.stringify({ ...params, activity: undefined });

  useEffect(() => {
    if (!pipeline) return;
    let alive = true;
    crmApi
      .counters(JSON.parse(countersKey))
      .then((res) => alive && setCounters(res.data))
      .catch(() => alive && setCounters(null));
    return () => {
      alive = false;
    };
  }, [countersKey, version, pipeline]);

  const go = (next) => navigate(`/app/crm/deals/${next}${window.location.search}`);
  const openDeal = useCallback((deal) => navigate(`/app/crm/deals/${deal.id}${window.location.search}`), [navigate]);
  const closeDeal = useCallback(() => navigate(`/app/crm/deals/${lastView(user)}${window.location.search}`), [navigate, user]);
  const create = (quick) => setCreating({ pipelineId: pipeline?.id, quick });

  if (!pipeline) {
    return (
      <Result
        icon={<span className="crm-empty__icon is-big"><Glyph name="flag" size={34} /></span>}
        title={t('crm.noPipelines')}
        subTitle={t('crm.noPipelinesText')}
        extra={<Button type="primary" onClick={() => navigate('/app/crm/pipelines')}>{t('crm.pipelines.setup')}</Button>}
      />
    );
  }

  const shared = { pipeline, params, filter, version, onOpen: openDeal, onChanged: touch, onCreate: () => create(false) };
  const openCount = pipeline.counts?.open;

  return (
    <div className="crm-page">
      <header className="mod-hero crm-hero" style={{ '--c': pipeline.color }}>
        <span className="mod-hero__badge" aria-hidden="true">
          <Glyph name="flag" size={24} />
        </span>
        <div className="mod-hero__text">
          <h1>
            {t('crm.deals')}
            <span className="mod-pill">{pipeline.name}</span>
          </h1>
          <p>{openCount !== undefined ? t('crm.hero.open', { n: formatNumber(openCount, locale) }) : t('apps.crm.desc')}</p>
        </div>
        <div className="mod-hero__actions">
          <HelpButton id="crm" />
          <CreateButton onFull={() => create(false)} onQuick={() => create(true)} />
        </div>
      </header>

      <div className="crm-toolbar-wrap">
        <div className="mod-toolbar crm-toolbar">
          {pipelines.length > 0 && <PipelineSwitcher value={pipeline.id} onChange={setPipeline} />}
          <FilterBar value={filterState} onChange={setFilterState} pipeline={pipeline} />
          <span className="mod-toolbar__grow" />
          <ViewSwitch value={view} onChange={go} />
        </div>
      </div>
      <div className="crm-subbar">
        <CounterChips counters={counters} value={filter.activity} onChange={(activity) => setFilterState({ ...filterState, filter: { ...filter, activity } })} />
      </div>

      <div className="crm-view">
        {view === 'kanban' && <KanbanView {...shared} />}
        {view === 'list' && <ListView {...shared} />}
        {view === 'activities' && <ActivitiesView {...shared} />}
        {view === 'calendar' && <CalendarView {...shared} />}
      </div>

      {dealId && <DealPanel id={dealId} onClose={closeDeal} onChanged={touch} />}
      <CreateDealDialog
        open={creating}
        onClose={(deal) => {
          setCreating(null);
          if (deal) {
            touch();
            if (!creating?.quick) openDeal(deal);
          }
        }}
      />
    </div>
  );
}
