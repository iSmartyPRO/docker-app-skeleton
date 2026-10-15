import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented, Table, Tag, Tooltip } from 'antd';
import { LockOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { faApi, faError, folderUrl } from '../api';
import { useFolderAccess } from '../FolderAccessContext';
import { LogonNotice, ReadOnlyBanner, ReviewTag } from '../components/Bits';
import { CreatePairDialog } from '../components/GroupDialogs';

/** Every folder group pair (and, for superadministrators, other groups) with search and a review filter. */
export default function Folders() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { info } = useFolderAccess();
  const [folders, setFolders] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const { data } = await faApi.folders(refresh ? { refresh: 1 } : {});
      setFolders(data.folders);
      setError(null);
    } catch (err) {
      setError(faError(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const shareTitle = useMemo(() => Object.fromEntries((info?.config?.driveMap || []).map((row) => [row.shareId, row.title])), [info]);

  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (folders || []).filter((folder) => {
      if (filter === 'review' && !folder.needsReview) return false;
      if (filter === 'other' && folder.kind !== 'other') return false;
      if (!text) return true;
      return [folder.name, folder.path, ...Object.values(folder.groups).flatMap((group) => [group.name, group.description])].some((value) => String(value || '').toLowerCase().includes(text));
    });
  }, [folders, q, filter]);

  const reviewCount = (folders || []).filter((folder) => folder.needsReview).length;
  const superadmin = info?.role === 'superadmin';

  const count = (group) => (group ? <Tag>{group.memberCount}</Tag> : <span className="fa-muted">—</span>);

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        title={t('folderAccess.folders.title')}
        description={t('folderAccess.folders.lead')}
        actions={[
          superadmin && info?.canWrite && { key: 'new', primary: true, icon: <PlusOutlined />, label: t('folderAccess.create.button'), onClick: () => setCreating(true), disabled: !info?.config?.canCreate, tooltip: info?.config?.canCreate ? undefined : t('folderAccess.create.noOu') },
          { key: 'refresh', icon: <ReloadOutlined />, label: t('folderAccess.refresh'), onClick: () => load(true), loading },
        ]}
        search={{ value: q, onChange: setQ, onSearch: setQ, placeholder: t('folderAccess.folders.search') }}
        filters={
          <Segmented
            size="small"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('folderAccess.folders.all') },
              { value: 'review', label: `${t('folderAccess.needsReview')}${reviewCount ? ` · ${reviewCount}` : ''}` },
              ...(superadmin ? [{ value: 'other', label: t('folderAccess.folders.other') }] : []),
            ]}
          />
        }
        status={folders ? t('folderAccess.folders.count', { n: shown.length }) : null}
      />
      <ReadOnlyBanner />
      <LogonNotice />
      {error && <div className="signin__error">{error}</div>}
      <section className="panel">
        <Table
          rowKey="key"
          size="middle"
          loading={!folders && !error}
          dataSource={shown}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(folder) => ({ onClick: () => navigate(folderUrl(folder.key)), className: 'fa-row' })}
          columns={[
            {
              title: t('folderAccess.folder'),
              render: (_, folder) => (
                <div className="fa-folder-cell">
                  <strong>
                    {folder.root || folder.protected ? (
                      <Tooltip title={t('folderAccess.protected')}>
                        <LockOutlined className="fa-lock" />{' '}
                      </Tooltip>
                    ) : null}
                    {folder.path || folder.name}
                  </strong>
                  <span className="fa-muted">{Object.values(folder.groups).map((group) => group.name).join(' · ')}</span>
                </div>
              ),
            },
            { title: t('folderAccess.type.full'), width: 110, render: (_, folder) => (folder.kind === 'other' ? count(folder.groups.other) : count(folder.groups.full)) },
            { title: t('folderAccess.type.read'), width: 110, render: (_, folder) => (folder.kind === 'other' ? null : count(folder.groups.read)) },
            {
              title: t('folderAccess.share'),
              width: 160,
              responsive: ['md'],
              render: (_, folder) => (folder.shareId ? shareTitle[folder.shareId] || `#${folder.shareId}` : <span className="fa-muted">—</span>),
            },
            {
              title: '',
              width: 170,
              render: (_, folder) => (
                <span className="fa-tags">
                  <ReviewTag issues={folder.needsReview ? folder.issues : []} />
                  {folder.legacyOrg && <Tag>{folder.org}</Tag>}
                  {folder.kind === 'other' && <Tag color="purple">{t('folderAccess.folders.otherTag')}</Tag>}
                </span>
              ),
            },
          ]}
        />
      </section>
      <CreatePairDialog open={creating} onClose={(done) => { setCreating(false); if (done) load(true); }} />
    </div>
  );
}
