import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Checkbox, Dropdown, Input, Modal, Radio, Segmented, Skeleton, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import UploadPanel from '../../kb/components/UploadPanel';
import { NameDialog } from '../../files/components/dialogs';
import { copyText, driveApi, driveError, fileUrl, folderUrl, shareSource } from '../api';
import { useDrive } from '../DriveContext';
import EntryList from '../components/EntryList';
import DriveViewer from '../components/DriveViewer';
import LinkDialog from '../components/LinkDialog';
import MoveDialog from '../components/MoveDialog';
import ConnectDialog from '../components/ConnectDialog';
import { useDriveTitle } from '../DriveApp';
import { sortEntries, usePrefs } from '../prefs';

/** Shown instead of the listing when the server refuses or the folder is gone. */
function Problem({ code, share, onConnect }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const kind = ['CREDENTIALS_REQUIRED', 'CREDENTIALS_FAILED'].includes(code)
    ? 'auth'
    : code === 'ACCESS_DENIED'
      ? 'denied'
      : ['NOT_FOUND', 'SHARE_NOT_FOUND'].includes(code)
        ? 'missing'
        : 'offline';
  const icons = { auth: '🔑', denied: '🔒', missing: '🧭', offline: '📡' };
  return (
    <div className="dv-problem">
      <div className="dv-problem__icon">{icons[kind]}</div>
      <h2>{t(`drive.problem.${kind}`)}</h2>
      <p>{t(`drive.problem.${kind}Text`)}</p>
      <div className="dv-problem__actions">
        {kind === 'auth' && <Button type="primary" onClick={onConnect}>{t('drive.signIn')}</Button>}
        {share && kind !== 'auth' && <Button onClick={() => navigate(folderUrl(share.id))}>{share.title}</Button>}
        <Button onClick={() => navigate('/app/drive')}>{t('drive.toDrive')}</Button>
      </div>
    </div>
  );
}

function ConflictDialog({ state, onResolve }) {
  const { t } = useLocale();
  const [choice, setChoice] = useState('rename');
  if (!state) return null;
  return (
    <Modal open title={t('drive.conflictTitle', { n: state.names.length })} onCancel={() => onResolve(null)} onOk={() => onResolve(choice)} okText={t('drive.continue')} cancelText={t('common.cancel')} width={520}>
      <p>{t('drive.conflictText')}</p>
      <ul className="dv-conflict__names">
        {state.names.slice(0, 6).map((name) => <li key={name}>{name}</li>)}
        {state.names.length > 6 && <li>… +{state.names.length - 6}</li>}
      </ul>
      <Radio.Group value={choice} onChange={(event) => setChoice(event.target.value)} className="dv-conflict__choices">
        <Radio value="replace"><strong>{t('drive.conflictReplace')}</strong><span>{t('drive.conflictReplaceText')}</span></Radio>
        <Radio value="rename"><strong>{t('drive.conflictKeep')}</strong><span>{t('drive.conflictKeepText')}</span></Radio>
        <Radio value="skip"><strong>{t('drive.conflictSkip')}</strong><span>{t('drive.conflictSkipText')}</span></Radio>
      </Radio.Group>
    </Modal>
  );
}

/** /app/drive/s/:shareId/<path> — a folder on a file server. */
export default function Browser() {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const { shares, connections, config, refresh: refreshHome } = useDrive();
  const driveTitle = useDriveTitle();
  const shareId = Number(params.shareId);
  const path = (params['*'] || '').split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }).join('/');
  const [prefs, setPrefs] = usePrefs();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [viewing, setViewing] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const fileInput = useRef(null);
  const src = useMemo(() => shareSource(shareId), [shareId]);
  const share = shares?.find((item) => item.id === shareId) || data?.share;
  const connection = connections?.find((item) => item.serverId === share?.serverId);

  const load = useCallback(async () => {
    const res = await driveApi.list(shareId, path, prefs.hidden);
    setData(res.data);
    setError(null);
    return res.data;
  }, [shareId, path, prefs.hidden]);

  useEffect(() => {
    setData(null);
    setError(null);
    setSelected(new Set());
    setResults(null);
    setQuery('');
    load().catch((err) => setError(err));
  }, [load]);

  useEffect(() => {
    driveApi
      .favorites()
      .then((res) => setFavorite(res.data.items.some((item) => item.shareId === shareId && item.path === path)))
      .catch(() => {});
  }, [shareId, path]);

  // ?open=<name> (recent files, notifications) opens a file once the folder is listed.
  useEffect(() => {
    const name = search.get('open');
    if (!name || !data) return;
    const entry = data.entries.find((item) => item.name === name);
    if (entry && !entry.dir && config?.openMode !== 'modal') {
      navigate(fileUrl(shareId, entry.path), { replace: true });
      return;
    }
    if (entry && !entry.dir) setViewing(entry);
    search.delete('open');
    setSearch(search, { replace: true });
  }, [data, search, setSearch, config, navigate, shareId]);

  const canWrite = data?.access?.write !== false;
  const canDelete = data?.access?.delete !== false;
  const entries = useMemo(() => sortEntries(results || data?.entries || [], prefs), [results, data, prefs]);
  const selectedEntries = entries.filter((entry) => selected.has(entry.path));
  const uncOf = (entry) => `${(share?.unc || data?.share?.unc || '').replace(/\\+$/, '')}\\${entry.path.replace(/\//g, '\\')}`;
  const reload = () => load().catch((err) => setError(err));

  const fail = (err) => message.error(driveError(err, t));

  const open = (entry) => {
    if (entry.dir) {
      navigate(folderUrl(shareId, entry.path));
      return;
    }
    // Default: the file's own page (it records the visit itself); optionally a modal over the folder.
    if (config?.openMode !== 'modal') {
      navigate(fileUrl(shareId, entry.path));
      return;
    }
    setViewing(entry);
    driveApi.touchRecent({ shareId, path: entry.path, size: entry.size }).catch(() => {});
  };

  // ── Uploads ──
  const runUploads = async (files, mode) => {
    const max = (config?.maxUploadMb || 2048) * 1024 * 1024;
    const batch = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      file,
      progress: 0,
      status: file.size > max ? 'error' : 'uploading',
      error: file.size > max ? t('kb.upload.tooLarge', { mb: config.maxUploadMb }) : null,
    }));
    setUploads((list) => [...list, ...batch]);
    for (const item of batch.filter((row) => row.status === 'uploading')) {
      try {
        await driveApi.upload(shareId, path, item.file, {
          conflict: mode,
          onProgress: (progress) => setUploads((list) => list.map((row) => (row.key === item.key ? { ...row, progress } : row))),
        });
        setUploads((list) => list.map((row) => (row.key === item.key ? { ...row, progress: 1, status: 'done' } : row)));
      } catch (err) {
        setUploads((list) => list.map((row) => (row.key === item.key ? { ...row, status: 'error', error: driveError(err, t) } : row)));
      }
    }
    reload();
  };

  const upload = (files) => {
    if (!files.length) return;
    const existing = new Set((data?.entries || []).map((entry) => entry.name.toLowerCase()));
    const clashes = files.filter((file) => existing.has(file.name.toLowerCase()));
    if (!clashes.length) {
      runUploads(files, 'rename');
      return;
    }
    setConflict({
      names: clashes.map((file) => file.name),
      resolve: (choice) => {
        setConflict(null);
        if (!choice) return;
        if (choice === 'skip') runUploads(files.filter((file) => !existing.has(file.name.toLowerCase())), 'rename');
        else runUploads(files, choice);
      },
    });
  };

  // ── Actions ──
  const remove = (list) =>
    modal.confirm({
      title: list.length === 1 ? t('drive.deleteOne', { name: list[0].name }) : t('drive.deleteMany', { n: list.length }),
      content: t('drive.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await driveApi.remove(shareId, list.map((entry) => entry.path));
          message.success(t('drive.deleted', { n: list.length }));
          setSelected(new Set());
          reload();
        } catch (err) {
          fail(err);
        }
      },
    });

  const toggleFavorite = async (entry, isFavorite) => {
    try {
      if (isFavorite) await driveApi.removeFavorite(shareId, entry.path);
      else await driveApi.addFavorite({ shareId, path: entry.path, dir: entry.dir, size: entry.size });
      message.success(isFavorite ? t('drive.unpinned') : t('drive.pinned'));
      if (entry.path === path) setFavorite(!isFavorite);
    } catch (err) {
      fail(err);
    }
  };

  const copyPath = (entry) => copyText(entry ? uncOf(entry) : data?.unc).then(() => message.success(t('drive.pathCopied')));

  const menu = (entry) =>
    [
      { key: 'open', label: entry.dir ? t('drive.open') : t('drive.preview'), onClick: () => open(entry) },
      !entry.dir && { key: 'download', label: <a href={src.file(entry, { download: true })}>{t('kb.download')}</a> },
      entry.dir && { key: 'zip', label: <a href={src.zip([entry.path])}>{t('drive.downloadZip')}</a> },
      { type: 'divider' },
      config?.publicLinks && share?.allowLinks && { key: 'link', label: t('drive.shareLink'), onClick: () => setDialog({ type: 'link', entry }) },
      { key: 'path', label: t('drive.copyPath'), onClick: () => copyPath(entry) },
      { key: 'pin', label: t('drive.pin'), onClick: () => toggleFavorite(entry, false) },
      config?.canAudit && { key: 'activity', label: t('driveActivity.history'), onClick: () => navigate(`/app/drive/activity?shares=${shareId}&path=${encodeURIComponent(entry.path)}&period=90`) },
      canWrite && { type: 'divider' },
      canWrite && { key: 'rename', label: t('drive.rename'), onClick: () => setDialog({ type: 'rename', entry }) },
      canWrite && { key: 'move', label: t('drive.moveCopy'), onClick: () => setDialog({ type: 'move', paths: [entry.path] }) },
      canDelete && { type: 'divider' },
      canDelete && { key: 'delete', danger: true, label: t('common.delete'), onClick: () => remove([entry]) },
    ].filter(Boolean);

  const toggle = (entry) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });

  const runSearch = async (value) => {
    const text = value.trim();
    if (text.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await driveApi.search(shareId, path, text);
      setResults(res.data.entries);
      if (res.data.truncated) message.info(t('drive.searchTruncated'));
    } catch (err) {
      fail(err);
    } finally {
      setSearching(false);
    }
  };

  const crumbs = data?.crumbs || [];
  const title = path ? path.split('/').pop() : share?.title;
  const errorCode = error?.response?.data?.code;

  if (error) {
    return (
      <>
        <Problem code={errorCode} share={path ? share : null} onConnect={() => setDialog({ type: 'connect' })} />
        <ConnectDialog
          open={dialog?.type === 'connect'}
          connection={connection || (error?.response?.data?.info && { serverId: error.response.data.info.serverId, serverName: error.response.data.info.serverName, status: errorCode === 'CREDENTIALS_FAILED' ? error.response.data.info.reason : 'missing' })}
          onClose={(changed) => {
            setDialog(null);
            if (changed) {
              refreshHome();
              reload();
            }
          }}
        />
      </>
    );
  }

  return (
    <div
      className={`fs-page dv-page${dragging ? ' is-dragging' : ''}`}
      style={{ '--c': share?.color }}
      onDragOver={(event) => {
        if (!canWrite || !event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!canWrite) return;
        event.preventDefault();
        setDragging(false);
        upload([...(event.dataTransfer?.files || [])].filter((file) => file.size > 0 || file.type));
      }}
    >
      <nav className="kb-crumbs fs-crumbs dv-crumbs">
        <Link to="/app/drive">{driveTitle}</Link>
        <span className="kb-crumbs__sep">/</span>
        {path ? <Link to={folderUrl(shareId)}>{share?.title}</Link> : <strong>{share?.title}</strong>}
        {crumbs.map((crumb, index) => (
          <span key={crumb.path}>
            <span className="kb-crumbs__sep">/</span>
            {index === crumbs.length - 1 ? <strong>{crumb.name}</strong> : <Link to={folderUrl(shareId, crumb.path)}>{crumb.name}</Link>}
          </span>
        ))}
      </nav>

      <header className="fs-head dv-head">
        <div className="fs-head__text">
          <h1>
            <span className="dv-head__dot" />
            {title || <Skeleton.Input active size="small" />}
            <Tooltip title={favorite ? t('drive.unpin') : t('drive.pin')}>
              <button type="button" className={`dv-star${favorite ? ' is-on' : ''}`} onClick={() => toggleFavorite({ path, dir: true, name: title }, favorite)}>
                {favorite ? '★' : '☆'}
              </button>
            </Tooltip>
          </h1>
          <div className="dv-head__meta">
            {data && (
              <span className={`dv-chip ${canWrite ? 'is-rw' : 'is-ro'}`}>{canWrite ? t('drive.access.rw') : t('drive.access.ro')}</span>
            )}
            {data?.unc && (
              <Tooltip title={t('drive.copyPath')}>
                <button type="button" className="dv-unc" onClick={() => copyPath(null)}>
                  <code>{data.unc}</code>
                  <span>⧉</span>
                </button>
              </Tooltip>
            )}
          </div>
          {!path && share?.description && <p>{share.description}</p>}
        </div>
        <div className="fs-head__actions">
          <Input.Search
            className="dv-search"
            placeholder={t('drive.searchHere')}
            allowClear
            value={query}
            loading={searching}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value) setResults(null);
            }}
            onSearch={runSearch}
          />
          {canWrite && <Button onClick={() => setDialog({ type: 'folder' })}>+ {t('files.newFolder')}</Button>}
          {canWrite && (
            <Button type="primary" onClick={() => fileInput.current?.click()}>
              ⤒ {t('files.upload')}
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'zip', label: <a href={src.zip([path])}>{t('drive.downloadFolderZip')}</a> },
                config?.publicLinks && share?.allowLinks && { key: 'link', label: t('drive.shareFolderLink'), onClick: () => setDialog({ type: 'link', entry: { path, name: title, dir: true } }) },
                { key: 'path', label: t('drive.copyPath'), onClick: () => copyPath(null) },
                config?.canAudit && { key: 'activity', label: t('driveActivity.folderHistory'), onClick: () => navigate(`/app/drive/activity?shares=${shareId}${path ? `&path=${encodeURIComponent(path)}` : ''}&period=30`) },
                { type: 'divider' },
                { key: 'hidden', label: <Checkbox checked={prefs.hidden}>{t('drive.showHidden')}</Checkbox>, onClick: () => setPrefs({ hidden: !prefs.hidden }) },
                { key: 'refresh', label: t('drive.refresh'), onClick: reload },
              ].filter(Boolean),
            }}
          >
            <Button aria-label={t('drive.actions')}>⋯</Button>
          </Dropdown>
        </div>
      </header>

      <div className="mod-toolbar">
        {selectedEntries.length > 0 ? (
          <div className="fs-selection">
            <strong>{t('files.selectedN', { n: selectedEntries.length })}</strong>
            <Button size="small" href={src.zip(selectedEntries.map((entry) => entry.path))}>⤓ ZIP</Button>
            {canWrite && <Button size="small" onClick={() => setDialog({ type: 'move', paths: selectedEntries.map((entry) => entry.path) })}>{t('drive.moveCopy')}</Button>}
            {canDelete && <Button size="small" danger onClick={() => remove(selectedEntries)}>{t('common.delete')}</Button>}
            <Button size="small" type="text" onClick={() => setSelected(new Set())}>{t('common.cancel')}</Button>
          </div>
        ) : results ? (
          <span className="kb-toolbar__hint">{t('drive.searchResults', { n: results.length, q: query })}</span>
        ) : (
          <span className="kb-toolbar__hint">{canWrite ? t('files.dropHint') : t('drive.readOnlyHint')}</span>
        )}
        <span className="mod-toolbar__grow" />
        <Dropdown
          trigger={['click']}
          menu={{
            selectable: true,
            selectedKeys: [prefs.sort],
            items: ['name', 'mtime', 'size', 'type'].map((key) => ({ key, label: t(`drive.sort.${key}`) })),
            onClick: ({ key }) => setPrefs(key === prefs.sort ? { desc: !prefs.desc } : { sort: key, desc: key === 'mtime' }),
          }}
        >
          <Button size="small" type="text">{t(`drive.sort.${prefs.sort}`)} {prefs.desc ? '↓' : '↑'}</Button>
        </Dropdown>
        <Segmented
          value={prefs.view}
          onChange={(view) => setPrefs({ view })}
          options={[
            { value: 'grid', label: '▦' },
            { value: 'list', label: '☰' },
          ]}
        />
      </div>

      {!data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <EntryList
          entries={entries}
          view={prefs.view}
          selected={selected}
          onToggle={toggle}
          onOpen={open}
          menu={menu}
          src={src}
          showPath={Boolean(results)}
          emptyText={results ? t('drive.nothingFound') : canWrite ? t('files.emptyDrop') : t('drive.empty')}
          emptyIcon={results ? 'spark' : 'folder'}
        />
      )}

      {dragging && (
        <div className="kb-drop">
          <div>{t('files.dropHere', { name: title || '' })}</div>
        </div>
      )}
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }} />
      <UploadPanel uploads={uploads} onClear={() => setUploads([])} />
      <ConflictDialog state={conflict} onResolve={(choice) => conflict?.resolve(choice)} />

      {viewing && (
        <DriveViewer
          entry={viewing}
          siblings={entries}
          src={src}
          shareId={shareId}
          unc={uncOf(viewing)}
          conversion={config?.conversion}
          canEdit={canWrite}
          onNavigate={(next) => next && setViewing(entries.find((item) => item.path === next.path))}
          onChanged={reload}
          onShare={config?.publicLinks && share?.allowLinks ? (entry) => setDialog({ type: 'link', entry }) : null}
          onClose={() => setViewing(null)}
        />
      )}
      <NameDialog
        open={dialog?.type === 'folder'}
        title={t('files.newFolder')}
        initial={t('files.newFolderName')}
        onSubmit={(name) => driveApi.mkdir(shareId, path, name).catch((err) => { throw new Error(driveError(err, t)); })}
        onClose={(saved) => {
          setDialog(null);
          if (saved) reload();
        }}
      />
      <NameDialog
        open={dialog?.type === 'rename'}
        title={t('drive.rename')}
        initial={dialog?.entry?.name || ''}
        onSubmit={(name) => driveApi.rename(shareId, dialog.entry.path, name).catch((err) => { throw new Error(driveError(err, t)); })}
        onClose={(saved) => {
          setDialog(null);
          if (saved) reload();
        }}
      />
      <MoveDialog
        open={dialog?.type === 'move'}
        share={share}
        paths={dialog?.paths || []}
        onClose={(moved) => {
          setDialog(null);
          if (moved) {
            setSelected(new Set());
            reload();
          }
        }}
      />
      <LinkDialog open={dialog?.type === 'link'} shareId={shareId} entry={dialog?.entry} config={config || {}} onClose={() => setDialog(null)} />
    </div>
  );
}
