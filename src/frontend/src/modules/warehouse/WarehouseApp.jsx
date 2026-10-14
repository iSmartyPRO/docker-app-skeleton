import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button, Drawer, Dropdown, Result, Spin } from 'antd';
import { MenuOutlined, PlusOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import SideRail, { useSideRail } from '../shared/SideRail';
import { WhProvider, useWh } from './WhContext';
import { whApi } from './api';
import { useCreateItems } from './components/createMenu';
import '../shared/module.css';
import './warehouse.css';

const StockPage = lazy(() => import('./pages/StockPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const DocForm = lazy(() => import('./pages/DocForm'));
const ItemsPage = lazy(() => import('./pages/ItemsPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const MyToolsPage = lazy(() => import('./pages/MyToolsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const WarehousesPage = lazy(() => import('./pages/WarehousesPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const MobileApp = lazy(() => import('./mobile/MobileApp'));

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { meta, version } = useWh();
  const { collapsed } = useSideRail();
  const [counters, setCounters] = useState(null);
  const [mine, setMine] = useState(0);
  const [inventories, setInventories] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      whApi.inventories({ active: '1' }).then((res) => alive && setInventories(res.data.items.filter((s) => s.status === 'counting' || s.status === 'review').length)).catch(() => {});
      whApi.counters().then((res) => alive && setCounters(res.data.counters)).catch(() => {});
      whApi.myTools().then((res) => alive && setMine(res.data.tools.length + res.data.items.length + res.data.incoming.length)).catch(() => {});
    };
    refresh();
    window.addEventListener('approvals:changed', refresh);
    return () => {
      alive = false;
      window.removeEventListener('approvals:changed', refresh);
    };
  }, [version]);
  const createItems = useCreateItems(onNavigate);
  const rights = meta?.rights || {};
  const count = (n, alert) => (n > 0 ? <span className={`mod-nav__count${alert ? ' is-alert' : ''}`}>{n}</span> : null);
  const link = (to, icon, label, extra, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `mod-nav__link${isActive ? ' active' : ''}`} onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
      {extra}
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/warehouse" className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="box" />
        <span>{t('apps.warehouse.name')}</span>
      </NavLink>
      {createItems.length > 0 && (
        <Dropdown menu={{ items: createItems }} trigger={['click']} placement="bottomLeft">
          {collapsed ? (
            <Button type="primary" className="mod-rail-keep mod-rail-create" aria-label={t('wh.create')} data-tip={t('wh.create')} icon={<PlusOutlined />} />
          ) : (
            <Button type="primary" block icon={<PlusOutlined />} className="wh-side-create">
              {t('wh.create')}
            </Button>
          )}
        </Dropdown>
      )}
      <nav className="mod-nav">
        {link('/app/warehouse/stock', 'archive', t('wh.nav.stock'))}
        {link('/app/warehouse/documents', 'clipboard', t('wh.nav.documents'), count((counters?.awaiting_receipt || 0) + (counters?.requests || 0), true))}
        {link('/app/warehouse/items', 'tag', t('wh.nav.items'))}
        {link('/app/warehouse/tools', 'wrench', t('wh.nav.tools'))}
        {link('/app/warehouse/my-tools', 'user', t('wh.nav.myTools'), count(mine))}
        {(rights.canInventoryAny || inventories > 0) && link('/app/warehouse/inventory', 'checklist', t('whm.nav.inventory'), count(inventories))}
        {link('/app/warehouse/reports', 'chart', t('wh.nav.reports'))}
      </nav>
      <nav className="mod-nav wh-side__bottom">
        {link('/app/warehouse/m', 'phone', t('whm.nav.mobile'))}
        {link('/app/approvals', 'checklist', t('wh.nav.inbox'))}
        {rights.canAdminAny && link('/app/warehouse/warehouses', 'building', t('wh.nav.warehouses'))}
        {rights.canAdminAny && link('/app/warehouse/import', 'upload', t('wh.nav.import'))}
        {rights.isAdmin && link('/app/warehouse/settings', 'general', t('wh.nav.settings'))}
      </nav>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { meta, error } = useWh();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const section = location.pathname.split('/')[3] || 'stock';
  // A card opens over its list: the whole section animates as one page.
  const transitionKey = location.pathname.includes('/new/') || location.pathname.endsWith('/edit') ? location.pathname : section;
  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  const rights = meta.rights;
  if (section === 'm') {
    // The storekeeper's mode: full width, no side rail, one hand.
    return (
      <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
        <Routes>
          <Route path="m/*" element={<MobileApp />} />
        </Routes>
      </Suspense>
    );
  }
  return (
    <div className="mod-shell wh-shell">
      <SideRail moduleKey="warehouse">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('apps.warehouse.name')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={transitionKey}>
            <Routes>
              <Route index element={<Navigate to={`/app/warehouse/stock${location.search}`} replace />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="documents/new/:type" element={<DocForm key={location.key} />} />
              <Route path="documents/:id/edit" element={<DocForm key={location.key} />} />
              <Route path="documents/:id" element={<DocumentsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="items/:id" element={<ItemsPage />} />
              <Route path="tools" element={<ToolsPage />} />
              <Route path="tools/:id" element={<ToolsPage />} />
              <Route path="my-tools" element={<MyToolsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/:id" element={<InventoryPage />} />
              <Route path="warehouses" element={rights.canAdminAny ? <WarehousesPage /> : <Navigate to="/app/warehouse" replace />} />
              <Route path="import" element={rights.canAdminAny ? <ImportPage /> : <Navigate to="/app/warehouse" replace />} />
              <Route path="settings" element={rights.isAdmin ? <SettingsPage /> : <Navigate to="/app/warehouse" replace />} />
              <Route path="*" element={<Navigate to="/app/warehouse" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Warehouse: /app/warehouse/m (storekeeper mode), /inventory[/:id], /stock, /documents[/:id], /documents/new/:type, /items, /tools, /my-tools, /reports, /warehouses, /import, /settings. */
export default function WarehouseApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <WhProvider>
        <Shell />
      </WhProvider>
    </div>
  );
}
