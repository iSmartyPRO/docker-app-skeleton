import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Grid, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import Segmented from '../../../../components/ui/Segmented';
import { FolderOpenOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import ModuleHeader from '../../../shared/ModuleHeader';
import { folderUrl as driveFolderUrl } from '../../api';
import { faApi, faError, folderUrl } from '../api';
import { useAccess } from '../AccessContext';
import { LogonNotice, ReadOnlyBanner, ReviewTag } from '../components/Bits';

const groupsOf = (folder) => folder.pairs.flatMap((pair) => Object.values(pair.groups));
const countOf = (folder, type) => folder.pairs.reduce((sum, pair) => sum + (pair.groups[type]?.memberCount || 0), 0);
const hasType = (folder, type) => folder.pairs.some((pair) => pair.groups[type]);

/**
 * «Доступ» overview: every folder opened by access groups, grouped by project (the OU above the
 * groups' OU), with search and filters (needs review, not on the File server, other groups).
 * Creating a pair happens on the folder itself (its «Доступ» panel in the File server).
 */
export default function Folders() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { info } = useAccess();
  const [folders, setFolders] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const narrow = Grid.useBreakpoint().sm === false;

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

  const shareTitle = useMemo(() => Object.fromEntries((info?.config?.shares || []).map((row) => [row.shareId, row.title])), [info]);

  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (folders || []).filter((folder) => {
      if (filter === 'review' && !folder.needsReview) return false;
      if (filter === 'unmapped' && (folder.kind !== 'sg' || folder.mapped)) return false;
      if (filter === 'other' && folder.kind !== 'other') return false;
      if (!text) return true;
      return [folder.name, folder.path, folder.project, ...groupsOf(folder).flatMap((group) => [group.name, group.description])].some((value) => String(value || '').toLowerCase().includes(text));
    });
  }, [folders, q, filter]);

  // Projects in the order the server sorted them; folders without one ("—") and other groups last.
  const projects = useMemo(() => {
    const map = new Map();
    for (const folder of shown) {
      const name = folder.kind === 'other' ? '~other' : folder.project || '~none';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(folder);
    }
    return [...map.entries()].sort(([a], [b]) => (a.startsWith('~') === b.startsWith('~') ? 0 : a.startsWith('~') ? 1 : -1));
  }, [shown]);

  const reviewCount = (folders || []).filter((folder) => folder.needsReview).length;
  const unmappedCount = (folders || []).filter((folder) => folder.kind === 'sg' && !folder.mapped).length;
  const superadmin = info?.role === 'superadmin';

  const count = (folder, type) => (hasType(folder, type) ? <Tag>{countOf(folder, type)}</Tag> : <span className="fa-muted">—</span>);

  const columns = [
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
          <span className="fa-muted">{groupsOf(folder).map((group) => group.name).join(' · ')}</span>
        </div>
      ),
    },
    { title: t('folderAccess.type.full'), width: 112, responsive: ['sm'], render: (_, folder) => (folder.kind === 'other' ? count(folder, 'other') : count(folder, 'full')) },
    { title: t('folderAccess.type.read'), width: 112, responsive: ['sm'], render: (_, folder) => (folder.kind === 'other' ? null : count(folder, 'read')) },
    {
      title: t('folderAccess.share'),
      width: 220,
      responsive: ['md'],
      render: (_, folder) =>
        folder.kind !== 'sg' ? null : folder.mapped ? (
          <a
            className="fa-share-link"
            href={driveFolderUrl(folder.shareId, folder.relPath || '')}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              navigate(driveFolderUrl(folder.shareId, folder.relPath || ''));
            }}
          >
            <FolderOpenOutlined /> {shareTitle[folder.shareId] || `#${folder.shareId}`}
          </a>
        ) : (
          <span className="fa-muted">{t('folderAccess.folders.notMapped')}</span>
        ),
    },
    {
      title: '',
      width: 170,
      responsive: ['sm'],
      render: (_, folder) => (
        <span className="fa-tags">
          <ReviewTag issues={folder.needsReview ? folder.issues : []} />
          {folder.pairs.length > 1 && <Tag bordered={false}>{t('folderAccess.folders.pairs', { n: folder.pairs.length })}</Tag>}
          {folder.kind === 'other' && <Tag color="purple">{t('folderAccess.folders.otherTag')}</Tag>}
        </span>
      ),
    },
  ];

  const filterOptions = [
    { value: 'all', label: t('folderAccess.folders.all') },
    { value: 'review', label: `${t('folderAccess.folders.filterReview')}${reviewCount ? ` · ${reviewCount}` : ''}` },
    { value: 'unmapped', label: `${t('folderAccess.folders.filterUnmapped')}${unmappedCount ? ` · ${unmappedCount}` : ''}` },
    ...(superadmin ? [{ value: 'other', label: t('folderAccess.folders.filterOther') }] : []),
  ];

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        title={t('folderAccess.folders.title')}
        description={t('folderAccess.folders.lead')}
        actions={[{ key: 'refresh', icon: <ReloadOutlined />, label: t('folderAccess.refresh'), onClick: () => load(true), loading }]}
        search={{ value: q, onChange: setQ, onSearch: setQ, placeholder: t('folderAccess.folders.search') }}
        filters={
          // Four choices do not fit a phone: a select there, a segmented control that may scroll above.
          narrow ? (
            <Select size="small" className="fa-filter-select" value={filter} onChange={setFilter} options={filterOptions} aria-label={t('folderAccess.folders.filterLabel')} popupMatchSelectWidth={false} />
          ) : (
            <div className="fa-filter-scroll">
              <Segmented size="small" value={filter} onChange={setFilter} options={filterOptions} />
            </div>
          )
        }
        status={folders ? t('folderAccess.folders.count', { n: shown.filter((folder) => folder.kind === 'sg').length }) : null}
      />
      <ReadOnlyBanner />
      <LogonNotice />
      {error && <div className="signin__error">{error}</div>}
      {!folders && !error && (
        <section className="panel fa-project">
          <Skeleton active paragraph={{ rows: 6 }} />
        </section>
      )}
      {folders && !projects.length && (
        <section className="panel fa-project">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('folderAccess.folders.empty')} />
        </section>
      )}
      {projects.map(([name, list]) => (
        <section key={name} className="panel fa-project">
          <header className="fa-project__head">
            <span className="fa-project__name">{name === '~other' ? t('folderAccess.folders.other') : name === '~none' ? t('folderAccess.folders.noProject') : name}</span>
            <span className="fa-muted">{t('folderAccess.folders.inProject', { count: list.length })}</span>
            {list.some((folder) => folder.needsReview) && <Tag color="orange" bordered={false}>{t('folderAccess.needsReview')} · {list.filter((folder) => folder.needsReview).length}</Tag>}
          </header>
          <Table
            rowKey="key"
            size="middle"
            dataSource={list}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            onRow={(folder) => ({ onClick: () => navigate(folderUrl(folder.key)), className: 'fa-row' })}
            tableLayout="fixed"
            columns={columns}
          />
        </section>
      ))}
    </div>
  );
}
