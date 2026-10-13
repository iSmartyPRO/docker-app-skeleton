import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import SideRail, { useSideRail } from '../shared/SideRail';
import { ProcProvider, useProc } from './ProcContext';
import { procApi } from './api';
import '../shared/module.css';
import './procurement.css';

const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const RequestForm = lazy(() => import('./pages/RequestForm'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const SummaryPage = lazy(() => import('./pages/SummaryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { meta, version } = useProc();
  const { collapsed } = useSideRail();
  const [counters, setCounters] = useState(null);
  useEffect(() => {
    let alive = true;
    procApi
      .counters()
      .then((res) => alive && setCounters(res.data.counters))
      .catch(() => {});
    const refresh = () => procApi.counters().then((res) => alive && setCounters(res.data.counters)).catch(() => {});
    window.addEventListener('approvals:changed', refresh);
    return () => {
      alive = false;
      window.removeEventListener('approvals:changed', refresh);
    };
  }, [version]);
  const rights = meta?.rights || {};
  const count = (n, alert) => (n > 0 ? <span className={`mod-nav__count${alert ? ' is-alert' : ''}`}>{n}</span> : null);
  const location = useLocation();
  const waitingView = new URLSearchParams(location.search).get('chip') === 'waiting';
  // «Заявки» and «Ждут меня» share a path: the chip decides which one is current.
  const activeFor = (to) => {
    const [path, query] = to.split('?');
    if (!location.pathname.startsWith(path)) return false;
    if (path === '/app/procurement/requests') return query ? waitingView : !waitingView;
    return true;
  };
  const link = (to, icon, label, extra) => (
    <NavLink to={to} className={() => `mod-nav__link${activeFor(to) ? ' active' : ''}`} onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {extra}
    </NavLink>
  );
  const create = () => {
    onNavigate?.();
    navigate('/app/procurement/new');
  };
  return (
    <div className="mod-side">
      <NavLink to="/app/procurement" className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="cart" />
        <span>{t('apps.procurement.name')}</span>
      </NavLink>
      {rights.canCreate &&
        (collapsed ? (
          <Button type="primary" className="mod-rail-keep mod-rail-create" aria-label={t('procurement.create')} data-tip={t('procurement.create')} icon={<PlusOutlined />} onClick={create} />
        ) : (
          <Button type="primary" block icon={<PlusOutlined />} onClick={create} className="prc-side-create">
            {t('procurement.create')}
          </Button>
        ))}
      <nav className="mod-nav">
        {link('/app/procurement/requests', 'clipboard', t('procurement.nav.requests'), count(counters?.active))}
        {link('/app/procurement/requests?chip=waiting', 'inbox', t('procurement.chips.waiting'), count(counters?.waiting, true))}
        {rights.canPay && link('/app/procurement/payments', 'wallet', t('procurement.nav.payments'), count(counters?.to_pay, counters?.overdue > 0))}
        {link('/app/procurement/summary', 'pie', t('procurement.nav.summary'))}
      </nav>
      <nav className="mod-nav prc-side__bottom">
        {link('/app/approvals', 'checklist', t('procurement.nav.inbox'))}
        {rights.canAdmin && link('/app/procurement/settings', 'general', t('procurement.nav.settings'))}
      </nav>
    </div>
  );
}

/** A fresh form for every visit (the address of a new draft changes without a remount). */
function FormRoute() {
  const location = useLocation();
  return <RequestForm key={location.key} />;
}

function Shell() {
  const { t } = useLocale();
  const { meta, error } = useProc();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  // The card opens over the list: the whole /requests section animates as one page.
  const transitionKey = location.pathname.startsWith('/app/procurement/requests') && !location.pathname.endsWith('/edit') ? 'requests' : location.pathname;
  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  return (
    <div className="mod-shell prc-shell">
      <SideRail moduleKey="procurement">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>}>
          {t('apps.procurement.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={transitionKey}>
            <Routes>
              <Route index element={<Navigate to={`/app/procurement/requests${location.search}`} replace />} />
              <Route path="requests" element={<RequestsPage />} />
              <Route path="requests/:id" element={<RequestsPage />} />
              <Route path="requests/:id/edit" element={<FormRoute />} />
              <Route path="new" element={<FormRoute />} />
              <Route path="payments" element={meta.rights.canPay ? <PaymentsPage /> : <Navigate to="/app/procurement" replace />} />
              <Route path="summary" element={<SummaryPage />} />
              <Route path="settings" element={meta.rights.canAdmin ? <SettingsPage /> : <Navigate to="/app/procurement" replace />} />
              <Route path="*" element={<Navigate to="/app/procurement" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Procurement: /app/procurement/requests[/:id], /new, /requests/:id/edit, /payments, /summary, /settings. */
export default function ProcurementApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <ProcProvider>
        <Shell />
      </ProcProvider>
    </div>
  );
}
