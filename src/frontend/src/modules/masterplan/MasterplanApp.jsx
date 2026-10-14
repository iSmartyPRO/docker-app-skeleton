import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { App as AntApp, Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { MpProvider, ProjectProvider, useMp, useProject } from './MpContext';
import { mpApi } from './api';
import { can, readStore, userKey, writeStore } from './lib';
import '../shared/module.css';
import './masterplan.css';
import SideRail from '../shared/SideRail';

const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ChessPage = lazy(() => import('./pages/ChessPage'));
const RegistryPage = lazy(() => import('./pages/RegistryPage'));
const ConstructionPage = lazy(() => import('./pages/ConstructionPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StructurePage = lazy(() => import('./pages/StructurePage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const PROJECT_VIEWS = [
  { key: 'plan', icon: 'map' },
  { key: 'chess', icon: 'layers' },
  { key: 'registry', icon: 'file' },
  { key: 'construction', icon: 'tasks' },
  { key: 'dashboard', icon: 'chart', cap: 'dashboard' },
  { key: 'structure', icon: 'general', configure: true },
];

function currentProjectId(pathname) {
  const match = pathname.match(/^\/app\/masterplan\/p\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { projects, isAdmin } = useMp();
  const location = useLocation();
  const projectId = currentProjectId(location.pathname) || readStore(userKey(user, 'project'), null);
  const project = projects.find((item) => item.id === Number(projectId)) || projects[0] || null;
  const link = (to, icon, label, extra) => (
    <NavLink to={to} className="mod-nav__link" onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {extra}
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/masterplan" end className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="siteplan" />
        <span>{t('apps.masterplan.name')}</span>
      </NavLink>
      {project && (
        <>
          <div className="mod-side__label">
            <span className="mp-side__project">{project.name}</span>
          </div>
          <nav className="mod-nav">
            {PROJECT_VIEWS.filter((view) => (!view.cap || can(project.caps, view.cap)) && (!view.configure || project.canConfigure)).map((view) => (
              <NavLink key={view.key} to={`/app/masterplan/p/${project.id}/${view.key}`} className="mod-nav__link" onClick={onNavigate}>
                <MenuIcon name={view.icon} variant="mono" />
                <span className="mod-nav__text">{t(`mp.nav.${view.key}`)}</span>
              </NavLink>
            ))}
          </nav>
        </>
      )}
      <div className="mod-side__label">
        <span>{t('mp.nav.work')}</span>
      </div>
      <nav className="mod-nav">
        {link('/app/masterplan/bookings', 'clock', t('mp.nav.bookings'))}
        {link('/app/masterplan/projects', 'project', t('mp.nav.projects'), projects.length > 0 && <span className="mod-nav__count">{projects.length}</span>)}
      </nav>
      {projects.length > 1 && (
        <>
          <div className="mod-side__label">
            <span>{t('mp.nav.allProjects')}</span>
          </div>
          <nav className="mod-nav">
            {projects.map((item) => (
              <NavLink key={item.id} to={`/app/masterplan/p/${item.id}/plan`} className={() => `mod-nav__link${item.id === project?.id ? ' active' : ''}`} onClick={onNavigate}>
                <span className="mod-dot" style={{ '--c': item.archived ? '#94A3B8' : 'var(--da-primary)' }} />
                <span className="mod-nav__text">{item.name}</span>
              </NavLink>
            ))}
          </nav>
        </>
      )}
      {isAdmin && (
        <nav className="mod-nav mp-side__bottom">
          {link('/app/masterplan/settings', 'general', t('mp.nav.settings'))}
        </nav>
      )}
    </div>
  );
}

/** "Доступ ещё не выдан" with «Запросить доступ» (spec §11.1, adapted to portal roles). */
function NoAccess() {
  const { t } = useLocale();
  const { message } = AntApp.useApp();
  const [sent, setSent] = useState(false);
  return (
    <Result
      icon={<span className="mp-noaccess"><MenuIcon name="siteplan" /></span>}
      title={t('mp.noAccess.title')}
      subTitle={t('mp.noAccess.text')}
      extra={
        <Button
          type="primary"
          disabled={sent}
          onClick={async () => {
            try {
              await mpApi.requestAccess('');
              setSent(true);
              message.success(t('mp.noAccess.sent'));
            } catch (err) {
              message.error(errorMessage(err));
            }
          }}
        >
          {sent ? t('mp.noAccess.sentShort') : t('mp.noAccess.request')}
        </Button>
      }
    />
  );
}

/** Pages render once the project's data is there (or say why it is not). */
function ProjectGate({ children }) {
  const { t } = useLocale();
  const { data, error, reload } = useProject();
  if (error && !data) return <Result status="warning" title={errorMessage(error)} extra={<Button onClick={reload}>{t('common.retry')}</Button>} />;
  if (!data) {
    return (
      <div className="page-fallback">
        <Spin />
      </div>
    );
  }
  return children;
}

/** Project pages share the project's live data. */
function ProjectRoute({ page: Page }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const { projectById } = useMp();
  const location = useLocation();
  const presentation = new URLSearchParams(location.search).get('presentation') === '1';
  if (!projectById(projectId)) return <Navigate to="/app/masterplan/projects" replace />;
  writeStore(userKey(user, 'project'), Number(projectId));
  return (
    <ProjectProvider projectId={Number(projectId)} presentation={presentation} key={`${projectId}-${presentation}`}>
      <ProjectGate>
        <Page />
      </ProjectGate>
    </ProjectProvider>
  );
}

function Home() {
  const { user } = useAuth();
  const { projects } = useMp();
  const { search } = useLocation();
  const last = readStore(userKey(user, 'project'), null);
  const project = projects.find((item) => item.id === last) || (projects.length === 1 ? projects[0] : null);
  return <Navigate to={project ? `/app/masterplan/p/${project.id}/plan${search}` : `/app/masterplan/projects${search}`} replace />;
}

function Shell() {
  const { t } = useLocale();
  const { meta, error, me, projects } = useMp();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  if (!me.hasAccess && !projects.length) return <NoAccess />;
  // The plan fills the screen; other pages keep the usual padding.
  const fullBleed = /\/p\/\d+\/plan/.test(location.pathname);
  return (
    <div className={`mod-shell mp-shell${fullBleed ? ' is-full' : ''}`}>
      <SideRail moduleKey="masterplan">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('apps.masterplan.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={location.pathname.replace(/\?.*$/, '')}>
            <Routes>
              <Route index element={<Home />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="p/:projectId" element={<Navigate to="plan" replace />} />
              <Route path="p/:projectId/plan" element={<ProjectRoute page={PlanPage} />} />
              <Route path="p/:projectId/chess" element={<ProjectRoute page={ChessPage} />} />
              <Route path="p/:projectId/registry" element={<ProjectRoute page={RegistryPage} />} />
              <Route path="p/:projectId/construction" element={<ProjectRoute page={ConstructionPage} />} />
              <Route path="p/:projectId/dashboard" element={<ProjectRoute page={DashboardPage} />} />
              <Route path="p/:projectId/structure" element={<ProjectRoute page={StructurePage} />} />
              <Route path="*" element={<Navigate to="/app/masterplan" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Masterplan: /app/masterplan/p/:projectId/plan|chess|registry|construction|dashboard|structure, /bookings, /projects, /settings. */
export default function MasterplanApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <MpProvider>
        <Shell />
      </MpProvider>
    </div>
  );
}
