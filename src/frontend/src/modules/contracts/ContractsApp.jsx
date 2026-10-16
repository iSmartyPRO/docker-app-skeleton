import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined, PlusOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import SideRail, { useSideRail } from '../shared/SideRail';
import { ContractsProvider, useContracts } from './ContractsContext';
import ContractForm from './components/ContractForm';
import '../shared/module.css';
import './contracts.css';
import './contracts-pay.css';

const RegistryPage = lazy(() => import('./pages/RegistryPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));

function Sidebar({ onNavigate, onCreate }) {
  const { t } = useLocale();
  const { counts, me, settings } = useContracts();
  const location = useLocation();
  const { collapsed } = useSideRail();
  const view = new URLSearchParams(location.search).get('view') || 'all';
  const inRegistry = location.pathname === '/app/contracts' || /^\/app\/contracts\/\d+/.test(location.pathname);
  const viewLink = (key, icon, label, count, alert) => (
    <NavLink
      data-tour={`ctr.nav.${key}`}
      to={key === 'all' ? '/app/contracts' : `/app/contracts?view=${key}`}
      className={() => `mod-nav__link${inRegistry && view === key ? ' active' : ''}`}
      onClick={onNavigate}
      end
    >
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {count > 0 && <span className={`mod-nav__count${alert ? ' is-alert' : ''}`}>{count}</span>}
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/contracts" className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="clipboard" />
        <span>{t('apps.contracts.name')}</span>
      </NavLink>
      {me.canCreate &&
        (collapsed ? (
          <Button type="primary" className="mod-rail-keep mod-rail-create" aria-label={t('contracts.create')} data-tip={t('contracts.create')} icon={<PlusOutlined />} onClick={onCreate} />
        ) : (
          <Button type="primary" block icon={<PlusOutlined />} onClick={() => { onNavigate?.(); onCreate(); }} className="ctr-side-create">
            {t('contracts.create')}
          </Button>
        ))}
      <nav className="mod-nav">
        {viewLink('all', 'clipboard', t('contracts.nav.registry'), counts?.all)}
        {viewLink('mine', 'user', t('contracts.views.mine'), counts?.mine)}
        {viewLink('waiting', 'inbox', t('contracts.views.waiting'), counts?.waiting, true)}
        {viewLink('expiring', 'hourglass', t('contracts.views.expiring', { n: settings.expiringDays || 30 }), counts?.expiring)}
        <NavLink to="/app/contracts/calendar" className="mod-nav__link" onClick={onNavigate} data-tour="ctr.nav.calendar">
          <MenuIcon name="calendar" variant="mono" />
          <span className="mod-nav__text">{t('contracts.nav.calendar')}</span>
        </NavLink>
        {(me.isFinance || me.viewAll) && (
          <NavLink to="/app/contracts/payments" className="mod-nav__link" onClick={onNavigate} data-tour="ctr.nav.payments">
            <MenuIcon name="wallet" variant="mono" />
            <span className="mod-nav__text">{t('contracts.nav.payments')}</span>
            {counts?.pay_overdue > 0 && <span className="mod-nav__count is-alert">{counts.pay_overdue}</span>}
          </NavLink>
        )}
      </nav>
      <nav className="mod-nav ctr-side__bottom">
        {viewLink('archive', 'archive', t('contracts.views.archive'), null)}
        {me.isAdmin && (
          <NavLink to="/app/contracts/settings" className="mod-nav__link" onClick={onNavigate}>
            <MenuIcon name="general" variant="mono" />
            <span className="mod-nav__text">{t('contracts.nav.settings')}</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { meta, error, touch } = useContracts();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  // The card opens over the registry: the registry and its cards animate as one page.
  const transitionKey = /^\/app\/contracts(\/\d+)?$/.test(location.pathname) ? 'registry' : location.pathname;

  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  const create = () => setCreating(true);
  return (
    <div className="mod-shell ctr-shell">
      <SideRail moduleKey="contracts">
        <Sidebar onCreate={create} />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} onCreate={create} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('apps.contracts.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={transitionKey}>
            <Routes>
              <Route index element={<RegistryPage onCreate={create} />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path=":id" element={<RegistryPage onCreate={create} />} />
              <Route path="*" element={<Navigate to="/app/contracts" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
      <ContractForm
        open={creating}
        onClose={(result) => {
          setCreating(false);
          if (result?.contract) {
            touch();
            navigate(`/app/contracts/${result.contract.id}`);
          }
        }}
      />
    </div>
  );
}

/** Contracts: /app/contracts (registry), /app/contracts/:id (card over it), /calendar, /settings. */
export default function ContractsApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <ContractsProvider>
        <Shell />
      </ContractsProvider>
    </div>
  );
}
