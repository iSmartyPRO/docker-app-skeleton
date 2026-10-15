import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Result, Segmented, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import SideRail from '../shared/SideRail';
import { faError } from './api';
import { FolderAccessProvider, useFolderAccess } from './FolderAccessContext';
import Folders from './pages/Folders';
import FolderPage from './pages/FolderPage';
import People from './pages/People';
import PersonPage from './pages/PersonPage';
import Journal from './pages/Journal';
import Ntfs from './pages/Ntfs';
import NtfsReport from './pages/NtfsReport';
import '../shared/module.css';
import './folderaccess.css';

const ROOT = '/app/folderaccess';

function ModeSwitch({ onNavigate }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mode = pathname.startsWith(`${ROOT}/ntfs`) ? 'ntfs' : 'groups';
  return (
    <Segmented
      block
      size="small"
      className="fa-mode"
      value={mode}
      onChange={(next) => {
        navigate(next === 'ntfs' ? `${ROOT}/ntfs` : ROOT);
        onNavigate?.();
      }}
      options={[
        { value: 'groups', label: t('folderAccess.mode.groups') },
        { value: 'ntfs', label: t('folderAccess.mode.ntfs') },
      ]}
    />
  );
}

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { info } = useFolderAccess();
  const { pathname } = useLocation();
  const ntfsMode = info?.role === 'superadmin' && pathname.startsWith(`${ROOT}/ntfs`);
  const link = (to, icon, label, end) => (
    <NavLink to={to} end={end} className="mod-nav__link" onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to={ROOT} end className="mod-side__brand" onClick={onNavigate}>
        <span className="fa-brand"><MenuIcon name="lock" /></span>
        <span>{t('apps.folderaccess.name')}</span>
      </NavLink>
      {info?.role === 'superadmin' && <ModeSwitch onNavigate={onNavigate} />}
      {ntfsMode ? (
        <nav className="mod-nav">
          {link(`${ROOT}/ntfs`, 'lock', t('folderAccess.nav.permissions'), true)}
          {link(`${ROOT}/ntfs/report`, 'layers', t('folderAccess.nav.report'))}
          {link(`${ROOT}/journal`, 'chart', t('folderAccess.nav.journal'))}
        </nav>
      ) : (
        <nav className="mod-nav">
          {link(ROOT, 'layers', t('folderAccess.nav.folders'), true)}
          {link(`${ROOT}/people`, 'people', t('folderAccess.nav.people'))}
          {link(`${ROOT}/journal`, 'chart', t('folderAccess.nav.journal'))}
        </nav>
      )}
      {info?.role === 'superadmin' && (
        <nav className="mod-nav fs-side__bottom">
          <NavLink to="/admin/settings/folderaccess" className="mod-nav__link" onClick={onNavigate}>
            <MenuIcon name="general" variant="mono" />
            <span className="mod-nav__text">{t('folderAccess.nav.settings')}</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

/** Active Directory is not connected: what to do, by role. */
function AdOff({ role }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const superadmin = role === 'superadmin';
  const extra = [
    superadmin && (
      <Button key="ad" type="primary" onClick={() => navigate('/admin/settings/ad')}>
        {t('folderAccess.adOff.integrations')}
      </Button>
    ),
    superadmin && (
      <Button key="settings" onClick={() => navigate('/admin/settings/folderaccess')}>
        {t('folderAccess.adOff.settings')}
      </Button>
    ),
    <Button key="journal" onClick={() => navigate(`${ROOT}/journal`)}>
      {t('folderAccess.adOff.journal')}
    </Button>,
  ].filter(Boolean);
  return <Result status="warning" title={t('folderAccess.adOff.title')} subTitle={t(superadmin ? 'folderAccess.adOff.super' : 'folderAccess.adOff.sysadmin')} extra={extra} />;
}

function Shell() {
  const { t } = useLocale();
  const { info, error } = useFolderAccess();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  if (error) return <Result status="warning" title={faError(error, t)} />;
  if (!info) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  if (!info.role) return <Result status="403" title={t('folderAccess.noAccess')} subTitle={t('folderAccess.noAccessText')} />;
  // Without AD only the journal (kept in the portal's database) can be shown.
  if (!info.adConfigured && !pathname.startsWith(`${ROOT}/journal`)) return <AdOff role={info.role} />;
  return (
    <div className="mod-shell">
      <SideRail moduleKey="folderaccess">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>}>
          {t('apps.folderaccess.name')}
        </Button>
        <PageTransition>
          <Routes>
            <Route index element={<Folders />} />
            <Route path="f/:key" element={<FolderPage />} />
            <Route path="people" element={<People />} />
            <Route path="person" element={<PersonPage />} />
            <Route path="journal" element={<Journal />} />
            <Route path="ntfs" element={info.role === 'superadmin' ? <Ntfs /> : <Navigate to={ROOT} replace />} />
            <Route path="ntfs/report" element={info.role === 'superadmin' ? <NtfsReport /> : <Navigate to={ROOT} replace />} />
            <Route path="*" element={<Navigate to={ROOT} replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}

/** «Доступ к папкам»: AD security groups that open folders on the file server. */
export default function FolderAccessApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <FolderAccessProvider>
        <Shell />
      </FolderAccessProvider>
    </div>
  );
}
