import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { kbApi, privateSource } from '../api';
import { atLeast, useKb } from '../KbContext';
import FolderContent from '../components/FolderContent';
import FolderDialog from '../components/FolderDialog';
import AccessDialog from '../components/AccessDialog';
import { useView } from './KbFolder';

/** Start page: top-level folders and recently updated materials. */
export default function KbHome() {
  const { t } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { config, rootLevel, refreshTree } = useKb();
  const [data, setData] = useState(null);
  const [view, setView] = useView();
  const [dialog, setDialog] = useState(null);
  const src = useMemo(() => privateSource(), []);

  const load = () => kbApi.home().then((res) => setData(res.data));
  useEffect(() => {
    load();
  }, []);

  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <div className="kb-page">
      <header className="kb-hero">
        <div>
          <h1>{t('apps.kb.name')}</h1>
          <p>{t('kb.homeLead', { name: user?.displayName || '' })}</p>
        </div>
        <div className="kb-head__actions">
          {atLeast(rootLevel, 'manage') && (
            <Button onClick={() => setDialog({ type: 'access' })}>{t('kb.access.rootButton')}</Button>
          )}
          {atLeast(rootLevel, 'edit') && (
            <Button type="primary" onClick={() => setDialog({ type: 'folder' })}>
              + {t('kb.newFolder')}
            </Button>
          )}
        </div>
      </header>

      <div className="kb-section">
        <h2>{t('kb.folders')}</h2>
        <button type="button" className="kb-view-toggle" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
          {view === 'grid' ? '☰' : '▦'}
        </button>
      </div>
      <FolderContent
        folders={data.folders}
        items={[]}
        view={view}
        config={config}
        src={src}
        folderLink={(id) => `/app/kb/f/${id}`}
        onOpen={() => {}}
        emptyText={atLeast(rootLevel, 'edit') ? t('kb.emptyHomeEditable') : t('kb.emptyHome')}
      />

      {data.recent.length > 0 && (
        <>
          <div className="kb-section">
            <h2>{t('kb.recent')}</h2>
          </div>
          <FolderContent folders={[]} items={data.recent} view="list" config={config} src={src} folderLink={() => '#'} onOpen={(item) => navigate(`/app/kb/d/${item.id}`)} />
        </>
      )}

      <FolderDialog
        open={dialog?.type === 'folder'}
        config={config}
        onClose={() => setDialog(null)}
        onSaved={(id) => {
          setDialog(null);
          refreshTree();
          navigate(`/app/kb/f/${id}`);
        }}
      />
      {dialog?.type === 'access' && (
        <AccessDialog open type="root" id={0} title={t('apps.kb.name')} onClose={() => { setDialog(null); load(); refreshTree(); }} />
      )}
    </div>
  );
}
