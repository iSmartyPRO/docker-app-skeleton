import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Checkbox, Modal, Radio, Skeleton, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, DownloadOutlined, ExportOutlined, FolderAddOutlined, HistoryOutlined, LinkOutlined, ReloadOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { NameDialog } from '../../files/components/dialogs';
import TransferPanel from '../../files/components/TransferPanel';
import { useUploadActions } from '../../files/components/UploadButton';
import ModuleHeader, { PathChip, SelectionBar, SortButton, ViewToggle } from '../../shared/ModuleHeader';
import { FolderUploadError, batchLabel, collectDrop, collectPicked, useFolderUploads } from '../../files/folderUpload';
import { EDITABLE, copyText, driveApi, driveError, editUrl, fileUrl, folderUrl, shareSource } from '../api';
import { editorMode, opensInEditor } from '../../office/editable';
import ReadmeCard, { useReadmesHidden } from '../../../components/readme/ReadmeCard';
import { joinRelative, pickReadme } from '../../../lib/readme';

/** A file's extension (the server sends `ext`; the name is the fallback). */
const extOf = (entry) => entry?.ext || (String(entry?.name || '').includes('.') ? String(entry.name).split('.').pop().toLowerCase() : '');
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
      {state.folders && <p className="dv-conflict__note" style={{ color: 'var(--da-muted)', fontSize: 13 }}>{t('drive.conflictFolders')}</p>}
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
  const [readmesHidden, setReadmesHidden] = useReadmesHidden();
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

  // Listings can answer out of order (fast folder switches, reloads): only the latest lands.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    let res;
    try {
      res = await driveApi.list(shareId, path, prefs.hidden);
    } catch (err) {
      if (seq !== loadSeq.current) return null;
      throw err;
    }
    if (seq !== loadSeq.current) return null;
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
  // The folder's README.md, shown above the listing (not over search results).
  const readme = useMemo(() => (data && !results ? pickReadme(data.entries) : null), [data, results]);

  const fail = (err) => message.error(driveError(err, t));

  const open = (entry) => {
    if (entry.dir) {
      navigate(folderUrl(shareId, entry.path));
      return;
    }
    // Office documents open in the online editor when it is on.
    if (opensInEditor(config?.editor, extOf(entry))) {
      navigate(editUrl(shareId, entry.path));
      driveApi.touchRecent({ shareId, path: entry.path, size: entry.size }).catch(() => {});
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

  // ── Folder uploads ──
  // They finish later, maybe after a move to another folder: refresh whatever is on screen then.
  const reloadLatest = useRef(reload);
  reloadLatest.current = reload;
  const folderUploads = useFolderUploads();

  const folderProblem = (err) => {
    if (err instanceof FolderUploadError) message.error(t(err.code === 'TOO_DEEP' ? 'folderUpload.tooDeep' : 'folderUpload.tooMany', err.info));
    else message.error(t('folderUpload.readFailed', { error: err?.message || '' }));
  };

  // Files in a merged folder may clash: `mode` is the conflict choice (rename / replace / skip).
  const runFolder = (scan, mode) => {
    const base = path;
    const max = (config?.maxUploadMb || 2048) * 1024 * 1024;
    folderUploads.start({
      label: batchLabel(scan, t),
      files: scan.files,
      dirs: scan.dirs,
      unreadable: scan.unreadable,
      maxBytes: max,
      tooLarge: t('kb.upload.tooLarge', { mb: config?.maxUploadMb || 2048 }),
      root: base,
      ensure: async (paths, _first, signal) =>
        (await driveApi.folderTree(shareId, base, paths, signal)).data.folders.map((item) => ({ ref: item.path, error: item.error ? driveError({ code: item.error }, t) : null })),
      send: (file, ref, { signal, onProgress }) => driveApi.upload(shareId, ref, file, { conflict: mode === 'skip' ? 'fail' : mode, signal, onProgress }),
      skipped: (err) => mode === 'skip' && err?.response?.data?.code === 'EXISTS',
      describe: (err) => (err ? driveError(err, t) : t('folderUpload.folderFailed')),
      onDone: () => reloadLatest.current(),
    });
  };

  /** A scanned folder (drop or picker). Only a folder that is already here can hold clashing files: ask once. */
  const uploadFolder = (scan) => {
    if (!scan.files.length && !scan.dirs.length) {
      message.info(t('folderUpload.empty'));
      return;
    }
    const existing = new Set((data?.entries || []).map((entry) => entry.name.toLowerCase()));
    const clashes = scan.tops.filter((name) => existing.has(name.toLowerCase()));
    if (!clashes.length) {
      runFolder(scan, 'rename');
      return;
    }
    setConflict({
      names: clashes,
      folders: true,
      resolve: (choice) => {
        setConflict(null);
        if (choice) runFolder(scan, choice);
      },
    });
  };

  const onDropItems = async (dataTransfer) => {
    const drop = collectDrop(dataTransfer);
    // Only files: exactly the single-file upload as before.
    if (drop.hasFolders === false) {
      upload(drop.plain.filter((file) => file.size > 0 || file.type));
      return;
    }
    const key = 'dv-folder-scan';
    message.open({ key, type: 'loading', content: t('folderUpload.scanning'), duration: 0 });
    try {
      const scan = await drop.scan();
      message.destroy(key);
      if (scan.hasFolders) uploadFolder(scan);
      else upload(scan.files.map((item) => item.file));
    } catch (err) {
      message.destroy(key);
      folderProblem(err);
    }
  };

  const onPickFolder = (files) => {
    if (!files.length) {
      message.info(t('folderUpload.empty'));
      return;
    }
    try {
      uploadFolder(collectPicked(files));
    } catch (err) {
      folderProblem(err);
    }
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

  const menu = (entry) => {
    const office = entry.dir ? null : editorMode(config?.editor, extOf(entry), canWrite && !entry.readonly);
    return [
      office && { key: 'editor', label: t(office === 'edit' ? 'office.editOnline' : 'office.openInEditor'), onClick: () => navigate(editUrl(shareId, entry.path)) },
      { key: 'open', label: entry.dir ? t('drive.open') : t('drive.preview'), onClick: () => (entry.dir || config?.openMode === 'modal' ? open(entry) : navigate(fileUrl(shareId, entry.path))) },
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
  };

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

  const uploadActions = useUploadActions({ onPickFiles: () => fileInput.current?.click(), onFolder: onPickFolder, tooltip: t('moduleHeader.dropTip') });
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
        onDropItems(event.dataTransfer);
      }}
    >
      <ModuleHeader
        className="dv-head"
        crumbs={[
          { key: 'drive', label: driveTitle, to: '/app/drive' },
          { key: 'share', label: share?.title || '…', to: path ? folderUrl(shareId) : undefined },
          ...crumbs.map((crumb) => ({ key: crumb.path, label: crumb.name, to: folderUrl(shareId, crumb.path) })),
        ]}
        icon={<span className="dv-head__dot" />}
        title={title || null}
        titleExtra={
          <Tooltip title={favorite ? t('drive.unpin') : t('drive.pin')}>
            <button type="button" className={`dv-star${favorite ? ' is-on' : ''}`} aria-pressed={favorite} aria-label={favorite ? t('drive.unpin') : t('drive.pin')} onClick={() => toggleFavorite({ path, dir: true, name: title }, favorite)}>
              {favorite ? <StarFilled /> : <StarOutlined />}
            </button>
          </Tooltip>
        }
        meta={
          data && (
            <>
              <Tooltip title={canWrite ? null : t('drive.readOnlyHint')}>
                <span className={`dv-chip ${canWrite ? 'is-rw' : 'is-ro'}`}>{canWrite ? t('drive.access.rw') : t('drive.access.ro')}</span>
              </Tooltip>
              <PathChip value={data.unc} onCopy={() => copyPath(null)} />
            </>
          )
        }
        description={!path && share?.description ? share.description : null}
        actions={[
          ...(canWrite ? uploadActions : []),
          canWrite && { key: 'folder', icon: <FolderAddOutlined />, label: t('files.newFolder'), onClick: () => setDialog({ type: 'folder' }) },
        ]}
        more={[
          { key: 'zip', icon: <DownloadOutlined />, label: <a href={src.zip([path])}>{t('drive.downloadFolderZip')}</a> },
          config?.publicLinks && share?.allowLinks && { key: 'link', icon: <LinkOutlined />, label: t('drive.shareFolderLink'), onClick: () => setDialog({ type: 'link', entry: { path, name: title, dir: true } }) },
          { key: 'path', icon: <CopyOutlined />, label: t('drive.copyPath'), onClick: () => copyPath(null) },
          config?.canAudit && { key: 'activity', icon: <HistoryOutlined />, label: t('driveActivity.folderHistory'), onClick: () => navigate(`/app/drive/activity?shares=${shareId}${path ? `&path=${encodeURIComponent(path)}` : ''}&period=30`) },
          { type: 'divider' },
          { key: 'hidden', label: <Checkbox checked={prefs.hidden}>{t('drive.showHidden')}</Checkbox>, onClick: () => setPrefs({ hidden: !prefs.hidden }) },
          { key: 'readme', label: <Checkbox checked={!readmesHidden}>{t('readme.showAll')}</Checkbox>, onClick: () => setReadmesHidden(!readmesHidden) },
          { key: 'refresh', icon: <ReloadOutlined />, label: t('drive.refresh'), onClick: reload },
        ].filter(Boolean)}
        moreLabel={t('drive.actions')}
        search={{
          value: query,
          placeholder: t('drive.searchHere'),
          loading: searching,
          onChange: (value) => {
            setQuery(value);
            if (!value) setResults(null);
          },
          onSearch: runSearch,
        }}
        status={results ? t('drive.searchResults', { n: results.length, q: query }) : data?.entries?.length ? t('files.itemsN', { n: data.entries.length }) : null}
        selection={
          selectedEntries.length > 0 && (
            <SelectionBar
              label={t('files.selectedN', { n: selectedEntries.length })}
              onClear={() => setSelected(new Set())}
              actions={[
                { key: 'zip', icon: <DownloadOutlined />, label: t('drive.downloadZip'), href: src.zip(selectedEntries.map((entry) => entry.path)) },
                canWrite && { key: 'move', icon: <ExportOutlined />, label: t('drive.moveCopy'), onClick: () => setDialog({ type: 'move', paths: selectedEntries.map((entry) => entry.path) }) },
                canDelete && { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => remove(selectedEntries) },
              ]}
            />
          )
        }
        tools={
          <>
            <SortButton
              options={['name', 'mtime', 'size', 'type'].map((key) => ({ key, label: t(`drive.sort.${key}`) }))}
              value={prefs.sort}
              desc={prefs.desc}
              onChange={(key) => setPrefs(key === prefs.sort ? { desc: !prefs.desc } : { sort: key, desc: key === 'mtime' })}
            />
            <ViewToggle value={prefs.view} onChange={(view) => setPrefs({ view })} />
          </>
        }
      />

      {readme && (
        <ReadmeCard
          key={`${shareId}:${path}`}
          file={{ name: readme.name, size: readme.size, modified: readme.mtime }}
          url={src.file(readme)}
          version={readme.mtime || ''}
          folderKey={`drive:${shareId}:${path}`}
          resolveLink={(target) => {
            const to = joinRelative(path, target);
            if (to === null) return null;
            const here = data.entries.find((entry) => entry.path === to);
            if (here) return { href: here.dir ? folderUrl(shareId, to) : fileUrl(shareId, to), open: () => open(here) };
            // Elsewhere in the share: the file page sends folders on to the folder view.
            const href = target.dir ? folderUrl(shareId, to) : fileUrl(shareId, to);
            return to || target.dir ? { href, open: () => navigate(href) } : null;
          }}
          resolveImage={(target) => {
            const to = joinRelative(path, target);
            return to ? src.file({ path: to }) : null;
          }}
          onOpen={() => (config?.openMode === 'modal' ? setViewing(readme) : navigate(fileUrl(shareId, readme.path)))}
          onEdit={canWrite && !readme.readonly && EDITABLE.has(extOf(readme)) ? () => navigate(`${fileUrl(shareId, readme.path)}?edit=1`) : null}
          downloadUrl={src.file(readme, { download: true })}
          linkUrl={`${window.location.origin}${fileUrl(shareId, readme.path)}`}
        />
      )}

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
      <TransferPanel
        uploads={uploads}
        batches={folderUploads.batches}
        onCancel={folderUploads.cancel}
        onClear={() => {
          setUploads([]);
          folderUploads.clear();
        }}
      />
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
