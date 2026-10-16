import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined, PlusOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { CrmProvider, useCrm } from './CrmContext';
import { CreateButton } from './components/Toolbar';
import CreateDealDialog from './components/CreateDealDialog';
import SideRail, { useSideRail } from '../shared/SideRail';
import { lastView } from './lib';
import '../shared/module.css';
import './crm.css';

const DealsPage = lazy(() => import('./pages/DealsPage'));
const MyActivitiesPage = lazy(() => import('./pages/MyActivitiesPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
const PipelinesPage = lazy(() => import('./pages/PipelinesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Sidebar({ onNavigate, onCreate }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { pipelines, mine, canAdmin, companiesEnabled } = useCrm();
  const location = useLocation();
  const view = lastView(user);
  const totalOpen = pipelines.reduce((sum, pipeline) => sum + (pipeline.counts?.open || 0), 0);
  const due = (mine?.overdue || 0) + (mine?.today || 0);
  const currentPipeline = new URLSearchParams(location.search).get('pipeline');
  const { collapsed } = useSideRail();
  const link = (to, icon, label, extra, end, tour) => (
    <NavLink to={to} end={end} className="mod-nav__link" onClick={onNavigate} data-tour={tour}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {extra}
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/crm" className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="target" />
        <span>{t('apps.crm.name')}</span>
      </NavLink>
      {collapsed ? (
        <Button type="primary" className="mod-rail-keep mod-rail-create" aria-label={t('crm.create.full')} data-tip={t('crm.create.full')} icon={<PlusOutlined />} onClick={() => onCreate(false)} />
      ) : (
        <CreateButton block onFull={() => { onNavigate?.(); onCreate(false); }} onQuick={() => { onNavigate?.(); onCreate(true); }} />
      )}
      <nav className="mod-nav">
        <NavLink to={`/app/crm/deals/${view}`} className={() => `mod-nav__link${location.pathname.startsWith('/app/crm/deals') && !currentPipeline ? ' active' : ''}`} onClick={onNavigate}>
          <MenuIcon name="briefcase" variant="mono" />
          <span className="mod-nav__text">{t('crm.deals')}</span>
          {totalOpen > 0 && <span className="mod-nav__count">{totalOpen}</span>}
        </NavLink>
        {link('/app/crm/activities', 'checklist', t('crm.my.title'), due > 0 && <span className={`mod-nav__count${mine?.overdue ? ' is-alert' : ''}`}>{due}</span>, false, 'crm.activities')}
      </nav>
      {pipelines.length > 1 && (
        <>
          <div className="mod-side__label">
            <span>{t('crm.pipelines.short')}</span>
            {canAdmin && (
              <NavLink to="/app/crm/pipelines" onClick={onNavigate} aria-label={t('crm.pipelines.setup')} className="crm-side-gear">
                ⚙
              </NavLink>
            )}
          </div>
          <nav className="mod-nav">
            {pipelines.map((pipeline) => (
              <NavLink
                key={pipeline.id}
                to={`/app/crm/deals/${view}?pipeline=${pipeline.id}`}
                className={() => `mod-nav__link${location.pathname.startsWith('/app/crm/deals') && currentPipeline === String(pipeline.id) ? ' active' : ''}`}
                onClick={onNavigate}
              >
                <span className="mod-dot" style={{ '--c': pipeline.color }} />
                <span className="mod-nav__text">{pipeline.name}</span>
                {pipeline.counts?.open > 0 && <span className="mod-nav__count">{pipeline.counts.open}</span>}
              </NavLink>
            ))}
          </nav>
        </>
      )}
      {companiesEnabled && (
        <>
          <div className="mod-side__label"><span>{t('crm.clients')}</span></div>
          <nav className="mod-nav">
            {link('/app/companies', 'building', t('crm.client.companies'), null, true)}
            {link('/app/companies/people', 'people', t('crm.client.people'))}
          </nav>
        </>
      )}
      <nav className="mod-nav crm-side__bottom">
        {canAdmin && link('/app/crm/pipelines', 'kanban', t('crm.pipelines.title'))}
        {link('/app/crm/trash', 'trash', t('crm.trash.title'))}
        {canAdmin && link('/app/crm/settings', 'general', t('crm.settingsLink'))}
      </nav>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { meta, error, touch } = useCrm();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(null);
  const location = useLocation();
  // The deal card opens over the view: the whole /deals section animates as one page.
  const transitionKey = location.pathname.startsWith('/app/crm/deals') ? 'deals' : location.pathname;

  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  const create = (quick) => setCreating({ quick });
  return (
    <div className="mod-shell crm-shell">
      <SideRail moduleKey="crm">
        <Sidebar onCreate={create} />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} onCreate={create} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('apps.crm.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={transitionKey}>
            <Routes>
              <Route index element={<Navigate to={`/app/crm/deals/${lastView(user)}${location.search}`} replace />} />
              <Route path="deals" element={<Navigate to={`/app/crm/deals/${lastView(user)}${location.search}`} replace />} />
              <Route path="deals/:param" element={<DealsPage />} />
              <Route path="activities" element={<MyActivitiesPage />} />
              <Route path="trash" element={<TrashPage />} />
              <Route path="pipelines" element={<PipelinesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/app/crm" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
      <CreateDealDialog
        open={creating}
        onClose={(deal) => {
          setCreating(null);
          if (deal) {
            touch();
            navigate(`/app/crm/deals/${deal.id}`);
          }
        }}
      />
    </div>
  );
}

/** CRM: /app/crm/deals/kanban|list|activities|calendar, /deals/:id, /activities, /trash, /pipelines. */
export default function CrmApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <CrmProvider>
        <Shell />
      </CrmProvider>
    </div>
  );
}
