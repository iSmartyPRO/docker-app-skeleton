import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useMatch, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Drawer, Input, Progress, Result, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { filesApi, formatBytes } from './api';
import { FilesProvider, useFiles } from './FilesContext';
import Browser from './pages/Browser';
import FilePage from './pages/FilePage';
import EditPage from './pages/EditPage';
import SpaceDialog from './components/SpaceDialog';
import '../shared/module.css';
import './files.css';
import SideRail from '../shared/SideRail';

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { spaces, usage, config, refresh } = useFiles();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const link = (to, icon, label, end) => (
    <NavLink to={to} end={end} className="mod-nav__link" onClick={onNavigate}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/files" end className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="folder" />
        <span>{t('apps.files.name')}</span>
      </NavLink>
      <Input.Search
        data-tour="files.search"
        placeholder={t('files.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onSearch={(value) => {
          if (value.trim().length >= 2) {
            navigate(`/app/files/search?q=${encodeURIComponent(value.trim())}`);
            onNavigate?.();
          }
        }}
        allowClear
      />
      <nav className="mod-nav" data-tour="files.places">
        {link('/app/files', 'user', t('files.myFiles'), true)}
        {link('/app/files/shared', 'people', t('files.sharedWithMe'))}
        {link('/app/files/recent', 'spark', t('files.recent'))}
      </nav>
      <div className="mod-side__label" data-tour="files.spaces">
        <span>{t('files.spaces')}</span>
        {config?.canCreateSpaces && (
          <button type="button" onClick={() => setCreating(true)} aria-label={t('files.newSpace')}>+</button>
        )}
      </div>
      <nav className="mod-nav">
        {spaces.map((space) => (
          <NavLink key={space.id} to={`/app/files/space/${space.id}`} className="mod-nav__link" onClick={onNavigate}>
            <span className="mod-dot" style={{ '--c': space.color }} />
            <span className="mod-nav__text">{space.name}</span>
          </NavLink>
        ))}
        {!spaces.length && <div className="mod-side__empty">{t('files.noSpaces')}</div>}
      </nav>
      <nav className="mod-nav fs-side__bottom" data-tour="files.trash">
        {link('/app/files/trash', 'box', t('files.trash'))}
      </nav>
      {usage && (
        <div className="fs-side__usage">
          {usage.quota ? (
            <>
              <Progress percent={Math.min(100, Math.round((usage.used / usage.quota) * 100))} size="small" showInfo={false} />
              <span>{t('files.usageOf', { used: formatBytes(usage.used), total: formatBytes(usage.quota) })}</span>
            </>
          ) : (
            <span>{t('files.usage', { used: formatBytes(usage.used) })}</span>
          )}
        </div>
      )}
      <SpaceDialog
        open={creating}
        onClose={async (space) => {
          setCreating(false);
          if (space) {
            await refresh();
            onNavigate?.();
            navigate(`/app/files/space/${space.id}`);
          }
        }}
      />
    </div>
  );
}

function FolderRoute() {
  const { id } = useParams();
  return <Browser place={{ type: 'folder', id: Number(id) }} />;
}

function SpaceRoute() {
  const { id } = useParams();
  return <Browser place={{ type: 'space', id: Number(id) }} />;
}

function SearchRoute() {
  const [params] = useSearchParams();
  return <Browser place={{ type: 'search', q: params.get('q') || '' }} />;
}

/** /app/files/n/:id (notifications): a folder opens, a file opens in its folder. */
function NodeRoute() {
  const { id } = useParams();
  const { t } = useLocale();
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { config } = useFiles();
  const modal = config?.openMode === 'modal';
  useEffect(() => {
    filesApi
      .node(id)
      .then(({ data }) => {
        const { node, crumbs } = data;
        if (node.kind === 'folder') return navigate(`/app/files/f/${node.id}`, { replace: true });
        if (!modal) return navigate(`/app/files/v/${node.id}`, { replace: true });
        const parent = crumbs.length ? `/app/files/f/${crumbs[crumbs.length - 1].id}` : node.spaceId ? `/app/files/space/${node.spaceId}` : node.level === 'manage' ? '/app/files' : '/app/files/shared';
        return navigate(`${parent}?open=${node.id}`, { replace: true });
      })
      .catch(setError);
  }, [id, navigate, modal]);
  if (error) return <Result status="404" title={t('files.notFound')} subTitle={errorMessage(error)} />;
  return <div className="page-fallback"><Spin /></div>;
}

function Shell() {
  const { t } = useLocale();
  const { config, error } = useFiles();
  const [drawer, setDrawer] = useState(false);
  const fileRoute = useMatch('/app/files/v/:id');
  const editRoute = useMatch('/app/files/e/:id');
  if (error) return <Result status="warning" title={errorMessage(error)} />;
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
        <Route path="v/:id" element={<FilePage />} />
        <Route path="e/:id" element={<EditPage />} />
      </Routes>
    );
  }
  return (
    <div className="mod-shell">
      <SideRail moduleKey="files">
        <Sidebar />
      </SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>}>
          {t('apps.files.name')}
        </Button>
        <PageTransition>
          <Routes>
            <Route index element={<Browser place={{ type: 'my' }} />} />
            <Route path="f/:id" element={<FolderRoute />} />
            <Route path="space/:id" element={<SpaceRoute />} />
            <Route path="shared" element={<Browser place={{ type: 'shared' }} />} />
            <Route path="recent" element={<Browser place={{ type: 'recent' }} />} />
            <Route path="trash" element={<Browser place={{ type: 'trash' }} />} />
            <Route path="search" element={<SearchRoute />} />
            <Route path="n/:id" element={<NodeRoute />} />
            <Route path="*" element={<Navigate to="/app/files" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}

/** Files app: /app/files, /f/:id, /space/:id, /shared, /recent, /trash, /search, /n/:id. */
export default function FilesApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <FilesProvider>
        <Shell />
      </FilesProvider>
    </div>
  );
}
