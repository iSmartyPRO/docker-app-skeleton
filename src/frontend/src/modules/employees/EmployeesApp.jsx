import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import SideRail from '../shared/SideRail';
import { EmpProvider, useEmp } from './EmpContext';
import { empError } from './lib';
import '../shared/module.css';
import '../org/org.css';
import './employees.css';

const RegistryPage = lazy(() => import('./pages/RegistryPage'));
const EmployeeCard = lazy(() => import('./pages/EmployeeCard'));
const OrgChartPage = lazy(() => import('./pages/OrgChartPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const PositionsPage = lazy(() => import('./pages/PositionsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { meta, counters } = useEmp();
  const rights = meta?.rights || {};
  const location = useLocation();
  // Links with a query (?chip=…) are active only with that query; plain ones only without a chip.
  const activeFor = (to, isActive) => {
    const [, query] = to.split('?');
    if (query) return isActive && location.search.includes(query);
    return isActive && !(to === '/app/employees' && location.search.includes('chip='));
  };
  const link = (to, icon, label, extra, end = false, tour) => (
    <NavLink to={to} end={end} className={({ isActive }) => `mod-nav__link${activeFor(to, isActive) ? ' active' : ''}`} onClick={onNavigate} data-tour={tour}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {extra}
    </NavLink>
  );
  const count = (n, alert) => (n > 0 ? <span className={`mod-nav__count${alert ? ' is-alert' : ''}`}>{n}</span> : null);
  return (
    <div className="mod-side">
      <NavLink to="/app/employees" className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="people" />
        <span>{t('apps.employees.name')}</span>
      </NavLink>
      <nav className="mod-nav">
        {link('/app/employees', 'people', t('emp.nav.registry'), count(counters?.total), true, 'emp.nav.registry')}
        {link('/app/employees/chart', 'layers', t('emp.nav.chart'), null, false, 'emp.nav.chart')}
        {meta?.myEmployeeId && link(`/app/employees/${meta.myEmployeeId}`, 'user', t('emp.nav.myCard'))}
      </nav>
      {(rights.hr || rights.admin) && (
        <nav className="mod-nav emp-side__bottom">
          {rights.hr && link('/app/employees?chip=expiring', 'alert', t('emp.filters.expiring'), count(counters?.expiring, true))}
          {rights.hr && link('/app/employees/import', 'upload', t('emp.nav.import'), null, false, 'emp.nav.import')}
          {rights.admin && link('/app/employees/positions', 'briefcase', t('emp.nav.positions'), null, false, 'emp.nav.positions')}
          {rights.admin && link('/app/employees/settings', 'general', t('emp.nav.settings'))}
        </nav>
      )}
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { meta, error } = useEmp();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  if (error) return <Result status="warning" title={empError(error, t)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  const rights = meta.rights;
  if (!rights.view && !meta.myEmployeeId) return <Result status="403" title={t('emp.noAccess')} subTitle={t('emp.noAccessHint')} />;
  const section = location.pathname.split('/')[3] || 'registry';
  return (
    <div className="mod-shell emp-shell">
      <SideRail moduleKey="employees">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('apps.employees.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={section}>
            <Routes>
              <Route index element={rights.view ? <RegistryPage /> : <Navigate to={`/app/employees/${meta.myEmployeeId}`} replace />} />
              <Route path="chart" element={<OrgChartPage />} />
              <Route path="import" element={rights.hr ? <ImportPage /> : <Navigate to="/app/employees" replace />} />
              <Route path="positions" element={rights.admin ? <PositionsPage /> : <Navigate to="/app/employees" replace />} />
              <Route path="settings" element={rights.admin ? <SettingsPage /> : <Navigate to="/app/employees" replace />} />
              <Route path=":id" element={<EmployeeCard />} />
              <Route path="*" element={<Navigate to="/app/employees" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Employees: /app/employees (registry), /:id (card), /chart, /import, /positions, /settings. */
export default function EmployeesApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <EmpProvider>
        <Shell />
      </EmpProvider>
    </div>
  );
}
