import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/access';
import { adError } from './api';
import { DirectoryProvider, useDirectory } from './DirectoryContext';
import { ModeBadge } from './components/Bits';
import Browser from './pages/Browser';
import Journal from './pages/Journal';
import Setup from './pages/Setup';
import SideRail from '../shared/SideRail';
import '../shared/module.css';
import './directory.css';

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { info } = useDirectory();
  const { search, pathname } = useLocation();
  const flags = new URLSearchParams(search).get('flags');
  const ready = info && info.mode !== 'off' && info.setup?.rootSet;
  const link = (to, icon, label, active) => (
    <NavLink to={to} end className={() => `mod-nav__link${active ? ' active' : ''}`} onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
    </NavLink>
  );
  const atRoot = pathname === '/app/directory';
  return (
    <div className="mod-side" data-tour="directory.nav">
      <NavLink to="/app/directory" end className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="directory" />
        <span>{t('apps.directory.name')}</span>
      </NavLink>
      {ready && (
        <nav className="mod-nav">
          {link('/app/directory', 'layers', t('directory.nav.browse'), atRoot && !flags)}
          {link(`/app/directory?flags=inactive`, 'calendar', t('directory.nav.inactive'), atRoot && flags === 'inactive')}
          {link(`/app/directory?flags=locked`, 'lock', t('directory.nav.locked'), atRoot && flags === 'locked')}
          {link(`/app/directory?flags=disabled`, 'shield', t('directory.nav.disabled'), atRoot && flags === 'disabled')}
          {link('/app/directory/journal', 'bell', t('directory.nav.journal'), pathname === '/app/directory/journal')}
        </nav>
      )}
      <div className="ad-side-status">
        <ModeBadge info={info} />
        {info?.root && (
          <div className="ad-side-status__row">
            <span className="ad-muted">{t('directory.rootLabel')}</span>
            <code title={info.root.dn}>{info.root.name}</code>
          </div>
        )}
        {info?.credential && (
          <div className="ad-side-status__row">
            <span className="ad-muted">{t('directory.credential.short')}</span>
            <span className={info.credential.state === 'ok' ? 'ad-good' : 'ad-bad'}>{t(`directory.credential.state.${info.credential.state}`)}</span>
          </div>
        )}
      </div>
      {can(user, 'settings.modules') && (
        <nav className="mod-nav fs-side__bottom">
          <NavLink to="/admin/settings/directory" className="mod-nav__link" onClick={onNavigate}>
            <MenuIcon name="general" variant="mono" />
            <span className="mod-nav__text">{t('directory.nav.settings')}</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { info, error } = useDirectory();
  const [drawer, setDrawer] = useState(false);
  if (error && !info) return <Result status="warning" title={adError(error, t)} />;
  if (!info) return <div className="boot-screen"><Spin size="large" /></div>;
  const ready = info.mode !== 'off' && info.setup?.rootSet;
  return (
    <div className="mod-shell ad-shell">
      <SideRail moduleKey="directory"><Sidebar /></SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={290} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>{t('apps.directory.name')}</Button>
        <PageTransition>
          <Routes>
            <Route index element={ready ? <Browser /> : <Setup />} />
            <Route path="journal" element={<Journal />} />
            <Route path="*" element={<Navigate to="/app/directory" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}

/** AD directory: /app/directory (browser, ?ou=&open=&flags=), /journal. */
export default function DirectoryApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <DirectoryProvider>
        <Shell />
      </DirectoryProvider>
    </div>
  );
}
