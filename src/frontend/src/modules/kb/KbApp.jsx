import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Input, Result, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import FolderTree from './components/FolderTree';
import { KbProvider, useKb } from './KbContext';
import './kb.css';
import PageTransition from '../../components/ui/PageTransition';

const KbHome = lazy(() => import('./pages/KbHome'));
const KbFolder = lazy(() => import('./pages/KbFolder'));
const KbItem = lazy(() => import('./pages/KbItem'));
const KbSearch = lazy(() => import('./pages/KbSearch'));

function useActivePath(tree) {
  const location = useLocation();
  return useMemo(() => {
    const match = location.pathname.match(/\/app\/kb\/f\/(\d+)/);
    if (!match) return [];
    const byId = new Map(tree.map((folder) => [folder.id, folder]));
    const path = [];
    let current = byId.get(Number(match[1]));
    while (current && path.length < 64) {
      path.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return path;
  }, [location.pathname, tree]);
}

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { tree, config } = useKb();
  const navigate = useNavigate();
  const activePath = useActivePath(tree);
  const [query, setQuery] = useState('');
  return (
    <div className="kb-side">
      <Link to="/app/kb" className="kb-side__brand" onClick={onNavigate}>
        <MenuIcon name="graduation" />
        <span>{t('apps.kb.name')}</span>
      </Link>
      <div data-tour="kb.search">
        <Input.Search
          placeholder={t('kb.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={(value) => {
            if (value.trim().length >= 2) {
              navigate(`/app/kb/search?q=${encodeURIComponent(value.trim())}`);
              onNavigate?.();
            }
          }}
          allowClear
        />
      </div>
      <div className="kb-side__group" data-tour="kb.tree">
        <div className="kb-side__label">{t('kb.folders')}</div>
        <FolderTree folders={tree} config={config} activePath={activePath} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { config, error } = useKb();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawer(false), [location.pathname]);

  if (error) {
    const status = error?.response?.status;
    return (
      <Result
        status={status === 404 ? '404' : 'warning'}
        title={status === 404 ? t('kb.disabled') : errorMessage(error)}
        extra={<Link to="/apps">{t('apps.title')}</Link>}
      />
    );
  }
  if (!config) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="kb-shell">
      <aside className="kb-shell__side">
        <Sidebar />
      </aside>
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        placement="left"
        width={300}
        styles={{ body: { padding: 12 } }}
      >
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="kb-shell__main">
        <Button className="kb-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>
          {t('kb.folders')}
        </Button>
        <Suspense
          fallback={
            <div className="page-fallback">
              <Spin />
            </div>
          }
        >
          <PageTransition>
            <Routes>
              <Route index element={<KbHome />} />
              <Route path="f/:id" element={<KbFolder />} />
              <Route path="d/:id" element={<KbItem />} />
              <Route path="search" element={<KbSearch />} />
              <Route path="*" element={<Navigate to="/app/kb" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Knowledge base app: /app/kb, /app/kb/f/:id, /app/kb/d/:id, /app/kb/search. */
export default function KbApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <KbProvider>
        <Shell />
      </KbProvider>
    </div>
  );
}
