import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { driveError } from './api';
import { DriveProvider, useDrive } from './DriveContext';
import Home from './pages/Home';
import Browser from './pages/Browser';
import Shortcuts from './pages/Shortcuts';
import MyLinks from './pages/MyLinks';
import Connections from './pages/Connections';
import FilePage from './pages/FilePage';
import EditPage from './pages/EditPage';
import Activity from './pages/Activity';
import '../shared/module.css';
import '../kb/kb.css';
import '../files/files.css';
import './drive.css';
import SideRail from '../shared/SideRail';

/** The drive's name: chosen by the administrator ("iSmarty Drive") or the default. */
export function useDriveTitle() {
  const { t } = useLocale();
  const { settings } = useSettings();
  return settings?.modules?.drive?.title || t('apps.drive.name');
}

/** Stacked-disks mark used for the drive. */
export function DriveGlyph() {
  // Unique per instance: a gradient defined in a hidden copy (the mobile drawer) would not paint.
  const id = `dvg${useId().replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--dv-a, #60A5FA)" />
          <stop offset="1" stopColor="var(--dv-b, #2563EB)" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="36" height="13" rx="4" fill={`url(#${id})`} />
      <rect x="6" y="24" width="36" height="13" rx="4" fill={`url(#${id})`} opacity=".78" />
      <circle cx="13" cy="14.5" r="2" fill="#fff" />
      <circle cx="13" cy="30.5" r="2" fill="#fff" />
      <rect x="19" y="13.4" width="17" height="2.2" rx="1.1" fill="#fff" opacity=".8" />
      <rect x="19" y="29.4" width="17" height="2.2" rx="1.1" fill="#fff" opacity=".8" />
      <path d="M24 37v4M14 43h20" stroke="var(--dv-b, #2563EB)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const STATE_DOT = { ok: null, auth: '#F59E0B', offline: '#EF4444', denied: '#94A3B8', missing: '#94A3B8' };

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { shares, connections, config } = useDrive();
  const title = useDriveTitle();
  const problems = (connections || []).filter((item) => item.status !== 'ok' && item.auth === 'user').length;
  const link = (to, icon, label, end, badge) => (
    <NavLink to={to} end={end} className="mod-nav__link" onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {badge ? <span className="dv-badge">{badge}</span> : null}
    </NavLink>
  );
  return (
    <div className="mod-side dv-side">
      <NavLink to="/app/drive" end className="mod-side__brand dv-brand" onClick={onNavigate}>
        <span className="dv-brand__glyph"><DriveGlyph /></span>
        <span>{title}</span>
      </NavLink>
      <nav className="mod-nav">
        {link('/app/drive', 'home', t('drive.overview'), true)}
        {link('/app/drive/favorites', 'star', t('drive.favorites'))}
        {link('/app/drive/recent', 'spark', t('drive.recent'))}
        {config?.publicLinks && link('/app/drive/links', 'globe', t('drive.myLinks'))}
      </nav>
      <div className="mod-side__label">
        <span>{t('drive.folders')}</span>
      </div>
      <nav className="mod-nav">
        {(shares || []).map((share) => (
          <NavLink key={share.id} to={`/app/drive/s/${share.id}`} className={`mod-nav__link${share.state !== 'ok' ? ' is-dim' : ''}`} onClick={onNavigate}>
            <span className="mod-dot" style={{ '--c': share.color }} />
            <span className="mod-nav__text">{share.title}</span>
            {STATE_DOT[share.state] && <span className="dv-state-dot" style={{ background: STATE_DOT[share.state] }} title={t(`drive.state.${share.state}`)} />}
          </NavLink>
        ))}
        {shares && !shares.length && <div className="mod-side__empty">{t('drive.noSharesShort')}</div>}
      </nav>
      <nav className="mod-nav fs-side__bottom">
        {link('/app/drive/connections', 'key', t('drive.connections'), false, problems)}
        {config?.canAudit && link('/app/drive/activity', 'chart', t('driveActivity.title'))}
        {config?.isAdmin && (
          <NavLink to="/admin/settings/drive" className="mod-nav__link" onClick={onNavigate}>
            <MenuIcon name="general" variant="mono" />
            <span className="mod-nav__text">{t('drive.settings')}</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { config, error } = useDrive();
  const title = useDriveTitle();
  const [drawer, setDrawer] = useState(false);
  const fileRoute = useMatch('/app/drive/v/*');
  const editRoute = useMatch('/app/drive/e/*');
  // Only the page the drive was entered on may jump straight into a lone folder: coming back to the
  // overview later (menu, breadcrumb, Back) always shows the list. Reset when the app is left and re-entered.
  const { pathname } = useLocation();
  const atHome = /^\/app\/drive\/?$/.test(pathname);
  const landing = useRef(atHome);
  useEffect(() => {
    if (!atHome) landing.current = false;
  }, [atHome]);
  if (error) return <Result status="warning" title={driveError(error, t)} />;
  if (!config) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  // A file on its own page takes the whole width: no sidebar.
  if (fileRoute || editRoute) {
    return (
      <Routes>
        <Route path="v/:shareId/*" element={<FilePage />} />
        <Route path="e/:shareId/*" element={<EditPage />} />
      </Routes>
    );
  }
  return (
    <div className="mod-shell">
      <SideRail moduleKey="drive">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>}>
          {title}
        </Button>
        <PageTransition>
          <Routes>
            <Route index element={<Home landing={landing} />} />
            <Route path="s/:shareId/*" element={<Browser />} />
            <Route path="recent" element={<Shortcuts kind="recent" />} />
            <Route path="favorites" element={<Shortcuts kind="favorites" />} />
            <Route path="links" element={<MyLinks />} />
            <Route path="connections" element={<Connections />} />
            <Route path="activity" element={config?.canAudit ? <Activity /> : <Navigate to="/app/drive" replace />} />
            <Route path="*" element={<Navigate to="/app/drive" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}

/** Drive app: /app/drive, /s/:shareId/<path>, /v/:shareId/<file>, /recent, /favorites, /links, /connections. */
export default function DriveApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <DriveProvider>
        <Shell />
      </DriveProvider>
    </div>
  );
}
