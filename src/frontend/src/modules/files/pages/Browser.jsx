import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Checkbox, Modal, Progress, Skeleton } from 'antd';
import { DeleteOutlined, EditOutlined, ExportOutlined, FolderAddOutlined, TeamOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import AccessDialog from '../../shared/AccessDialog';
import { filesApi, formatBytes, nodeSource } from '../api';
import { useFiles } from '../FilesContext';
import { editorMode, opensInEditor } from '../../office/editable';
import NodeList, { nodeLabel } from '../components/NodeList';
import NodeViewer from '../components/NodeViewer';
import ShareDialog from '../components/ShareDialog';
import { MoveDialog, NameDialog } from '../components/dialogs';
import SpaceDialog from '../components/SpaceDialog';
import TransferPanel from '../components/TransferPanel';
import { useUploadActions } from '../components/UploadButton';
import ModuleHeader, { SelectionBar, ViewToggle } from '../../shared/ModuleHeader';
import { FolderUploadError, batchLabel, collectDrop, collectPicked, useFolderUploads } from '../folderUpload';
import ReadmeCard, { useReadmesHidden } from '../../../components/readme/ReadmeCard';
import { pickReadme } from '../../../lib/readme';
import { nodeResolver } from '../readmeLinks';

const VIEW_KEY = 'files_view';
const RANK = { none: 0, view: 1, edit: 2, manage: 3 };
const atLeast = (level, needed) => (RANK[level] || 0) >= RANK[needed];

function useView() {
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'grid';
    } catch {
      return 'grid';
    }
  });
  return [
    view,
    (next) => {
      setView(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* ignore */
      }
    },
  ];
}

async function loadPlace(place) {
  switch (place.type) {
    case 'folder':
      return (await filesApi.folder(place.id)).data;
    case 'space':
      return (await filesApi.space(place.id)).data;
    case 'shared':
      return { items: (await filesApi.shared()).data.items, level: 'view' };
    case 'recent':
      return { items: (await filesApi.recent()).data.items, level: 'view' };
    case 'search':
      return { items: (await filesApi.search(place.q)).data.items, level: 'view' };
    case 'trash':
      return { items: (await filesApi.trash()).data.items, level: 'manage' };
    default:
      return (await filesApi.my()).data;
  }
}

/** Where uploads and new folders go for the place on screen. */
function targetOf(place) {
  if (place.type === 'folder') return { parentId: place.id };
  if (place.type === 'space') return { spaceId: place.id };
  if (place.type === 'my') return {};
  return null;
}

/** One screen for every place: my files, a folder, a space, shared, recent, search, trash. */
export default function Browser({ place }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { config, refresh: refreshHome } = useFiles();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useView();
  const [readmesHidden, setReadmesHidden] = useReadmesHidden();
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const placeKey = `${place.type}:${place.id || ''}:${place.q || ''}`;

  // Listings can answer out of order (fast folder switches, reloads): only the latest lands.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    let next;
    try {
      next = await loadPlace(place);
    } catch (err) {
      if (seq !== loadSeq.current) return null;
      throw err;
    }
    if (seq !== loadSeq.current) return null;
    setData(next);
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey]);

  useEffect(() => {
    setData(null);
    setError(null);
    setSelected(new Set());
    load().catch(setError);
  }, [load]);

  // ?open=<id> (from notifications and search) opens a file once it is listed.
  useEffect(() => {
    const open = Number(params.get('open'));
    if (!open || !data) return;
    const node = data.items.find((item) => item.id === open);
    if (node && node.kind === 'file' && config?.openMode !== 'modal') {
      navigate(`/app/files/v/${node.id}`, { replace: true });
      return;
    }
    if (node && node.kind === 'file') setViewing(node);
    params.delete('open');
    setParams(params, { replace: true });
  }, [data, params, setParams, config, navigate]);

  const target = targetOf(place);
  const canEdit = Boolean(target) && atLeast(data?.level, 'edit');
  const trash = place.type === 'trash';
  const items = data?.items || [];
  const src = useMemo(() => nodeSource(), []);

  // ── The folder's README.md (my files, a space, a folder), shown above the listing ──
  // The places from the top down to this folder: README links like "../Docs/plan.pdf" walk them.
  const chain = useMemo(() => {
    if (!data || !['folder', 'space', 'my'].includes(place.type)) return null;
    const root = data.root?.type === 'space' ? { key: `space:${data.root.space.id}`, type: 'space', id: data.root.space.id } : data.root?.type === 'my' ? { key: 'my', type: 'my' } : null;
    if (place.type !== 'folder') return root ? [root] : null;
    return [...(root ? [root] : []), ...(data.crumbs || []).map((crumb) => ({ key: `folder:${crumb.id}`, type: 'folder', id: crumb.id })), { key: `folder:${place.id}`, type: 'folder', id: place.id }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, placeKey]);
  const readme = useMemo(() => (chain ? pickReadme(items, { isDir: (node) => node.kind !== 'file' }) : null), [chain, items]);
  const resolver = useMemo(() => (chain ? nodeResolver({ chain, items, list: async (at) => (await loadPlace(at)).items }) : null), [chain, items]);
  const placeUrl = (at) => (at.type === 'folder' ? `/app/files/f/${at.id}` : at.type === 'space' ? `/app/files/space/${at.id}` : '/app/files');

  const reload = () => {
    load().catch(setError);
    refreshHome();
  };
  // Folder uploads finish later, maybe after a move to another folder: refresh whatever is on screen then.
  const reloadLatest = useRef(reload);
  reloadLatest.current = reload;
  const folderUploads = useFolderUploads();

  const folderProblem = (err) => {
    if (err instanceof FolderUploadError) message.error(t(err.code === 'TOO_DEEP' ? 'folderUpload.tooDeep' : 'folderUpload.tooMany', err.info));
    else message.error(t('folderUpload.readFailed', { error: err?.message || '' }));
  };

  /** A scanned folder (drop or picker) → the folder tree first, then the files, a few at a time. */
  const uploadFolder = (scan) => {
    if (!target) return;
    if (!scan.files.length && !scan.dirs.length) {
      message.info(t('folderUpload.empty'));
      return;
    }
    const place = target;
    const bytes = scan.files.reduce((sum, item) => sum + (item.file.size || 0), 0);
    folderUploads.start({
      label: batchLabel(scan, t),
      files: scan.files,
      dirs: scan.dirs,
      unreadable: scan.unreadable,
      maxBytes: (config?.maxUploadMb || 200) * 1024 * 1024,
      tooLarge: t('kb.upload.tooLarge', { mb: config?.maxUploadMb || 200 }),
      root: place,
      ensure: async (paths, first, signal) => (await filesApi.folderTree(place, paths, first ? bytes : 0, signal)).data.folders.map((id) => ({ ref: { parentId: id } })),
      send: (file, ref, { signal, onProgress }) => filesApi.upload(ref, [file], onProgress, signal),
      describe: (err) => (err ? errorMessage(err) : t('folderUpload.folderFailed')),
      onDone: () => reloadLatest.current(),
    });
  };

  const onDropItems = async (dataTransfer) => {
    const drop = collectDrop(dataTransfer);
    // Only files: exactly the single-file upload as before.
    if (drop.hasFolders === false) {
      upload(drop.plain);
      return;
    }
    const key = 'fs-folder-scan';
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

  const upload = async (files) => {
    if (!files.length || !target) return;
    const max = (config?.maxUploadMb || 200) * 1024 * 1024;
    const batch = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      file,
      progress: 0,
      status: file.size > max ? 'error' : 'uploading',
      error: file.size > max ? t('kb.upload.tooLarge', { mb: config.maxUploadMb }) : null,
    }));
    setUploads((list) => [...list, ...batch]);
    for (const entry of batch.filter((item) => item.status === 'uploading')) {
      try {
        await filesApi.upload(target, [entry.file], (progress) => setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, progress } : row))));
        setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, progress: 1, status: 'done' } : row)));
      } catch (err) {
        setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, status: 'error', error: errorMessage(err) } : row)));
      }
    }
    reload();
  };

  const showUsage = (err, node) => {
    const usage = err?.response?.data?.info?.usage || [];
    modal.warning({
      title: t('files.inUseTitle', { name: node.name }),
      content: (
        <div className="fs-usage">
          <p>{t('files.inUseText')}</p>
          <ul>
            {usage.map((item) => (
              <li key={item.id}>
                <Link to={`/app/kb/d/${item.id}`} onClick={() => Modal.destroyAll()}>📄 {item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  };

  const remove = async (nodes) => {
    let moved = 0;
    for (const node of nodes) {
      try {
        await filesApi.trashNode(node.id);
        moved += 1;
      } catch (err) {
        if (err?.response?.data?.code === 'FILE_IN_USE') showUsage(err, node);
        else message.error(errorMessage(err));
        break;
      }
    }
    setSelected(new Set());
    if (moved) message.success(t('files.trashedN', { n: moved }));
    reload();
  };

  const open = (node) => {
    if (trash) return;
    if (node.kind === 'folder') navigate(`/app/files/f/${node.id}`);
    // Default: the file's own page; optionally a modal over the folder.
    else if (opensInEditor(config?.editor, node.file?.ext)) navigate(`/app/files/e/${node.id}`);
    else if (config?.openMode !== 'modal') navigate(`/app/files/v/${node.id}`);
    else setViewing(node);
  };

  const menu = (node) => {
    if (trash) {
      return [
        { key: 'restore', label: t('files.restore'), onClick: () => filesApi.restore(node.id).then(reload).catch((err) => message.error(errorMessage(err))) },
        {
          key: 'purge',
          danger: true,
          label: t('files.deleteForever'),
          onClick: () =>
            modal.confirm({
              title: t('files.deleteForeverConfirm', { name: node.name }),
              okText: t('common.delete'),
              okButtonProps: { danger: true },
              cancelText: t('common.cancel'),
              onOk: () => filesApi.purge(node.id).then(reload).catch((err) => message.error(errorMessage(err))),
            }),
        },
      ];
    }
    const edit = atLeast(node.level, 'edit');
    const system = Boolean(node.systemTag);
    const office = node.kind === 'file' ? editorMode(config?.editor, node.file?.ext, edit) : null;
    return [
      office && { key: 'editor', label: t(office === 'edit' ? 'office.editOnline' : 'office.openInEditor'), onClick: () => navigate(`/app/files/e/${node.id}`) },
      { key: 'open', label: node.kind === 'folder' ? t('files.open') : t('files.preview'), onClick: () => (node.kind === 'folder' ? open(node) : config?.openMode !== 'modal' ? navigate(`/app/files/v/${node.id}`) : setViewing(node)) },
      node.kind === 'file' && { key: 'download', label: <a href={src.file(node, { download: true })}>{t('kb.download')}</a> },
      { type: 'divider' },
      !system && { key: 'share', label: t('files.share'), onClick: () => setDialog({ type: 'share', node }) },
      edit && !system && { key: 'rename', label: t('files.rename'), onClick: () => setDialog({ type: 'rename', node }) },
      edit && !system && { key: 'move', label: t('files.move'), onClick: () => setDialog({ type: 'move', nodes: [node] }) },
      edit && !system && { type: 'divider' },
      edit && !system && { key: 'delete', danger: true, label: t('files.toTrash'), onClick: () => remove([node]) },
    ].filter(Boolean);
  };

  const toggle = (node) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });

  const selectedNodes = items.filter((node) => selected.has(node.id));
  const space = place.type === 'space' ? data?.root?.space : null;
  const titles = {
    my: t('files.myFiles'),
    shared: t('files.sharedWithMe'),
    recent: t('files.recent'),
    trash: t('files.trash'),
    search: t('files.searchFor', { q: place.q || '' }),
  };
  const title = place.type === 'folder' ? nodeLabel(data?.folder, t) : place.type === 'space' ? space?.name : titles[place.type];
  const rootCrumb =
    place.type === 'folder' && data
      ? data.root.type === 'space'
        ? { key: 'root', label: data.root.space.name, to: `/app/files/space/${data.root.space.id}` }
        : data.root.type === 'shared'
          ? { key: 'root', label: t('files.sharedWithMe'), to: '/app/files/shared' }
          : { key: 'root', label: t('files.myFiles'), to: '/app/files' }
      : null;

  const usage = data?.usage;
  const uploadActions = useUploadActions({ onPickFiles: () => fileInput.current?.click(), onFolder: onPickFolder, tooltip: t('moduleHeader.dropTip') });

  if (error) {
    return (
      <div className="fs-empty">
        <span>{errorMessage(error)}</span>
        <Button onClick={() => navigate('/app/files')}>{t('files.myFiles')}</Button>
      </div>
    );
  }

  return (
    <div
      className={`fs-page${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        if (!canEdit || !event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(false);
        onDropItems(event.dataTransfer);
      }}
    >
      <ModuleHeader
        crumbs={rootCrumb ? [rootCrumb, ...(data.crumbs || []).map((crumb) => ({ key: crumb.id, label: nodeLabel(crumb, t), to: `/app/files/f/${crumb.id}` })), { key: 'current', label: title }] : null}
        style={space ? { '--c': space.color } : undefined}
        icon={space ? <span className="mod-dot fs-head__dot" /> : null}
        title={title || null}
        meta={
          place.type === 'my' && usage ? (
            <div className="fs-usage-bar">
              {usage.quota ? (
                <>
                  <Progress percent={Math.min(100, Math.round((usage.used / usage.quota) * 100))} size="small" showInfo={false} strokeColor={usage.used / usage.quota > 0.9 ? '#EF4444' : undefined} />
                  <span>{t('files.usageOf', { used: formatBytes(usage.used), total: formatBytes(usage.quota) })}</span>
                </>
              ) : (
                <span>{t('files.usage', { used: formatBytes(usage.used) })}</span>
              )}
            </div>
          ) : null
        }
        description={place.type === 'trash' ? t('files.trashLead', { days: config?.trashDays || 30 }) : place.type === 'shared' ? t('files.sharedLead') : space?.description || null}
        actions={[
          ...(canEdit ? uploadActions.map((action) => (action.key === 'upload' ? { ...action, tour: 'files.upload' } : action)) : []),
          canEdit && { key: 'folder', icon: <FolderAddOutlined />, label: t('files.newFolder'), onClick: () => setDialog({ type: 'folder' }) },
          trash && items.length > 0 && {
            key: 'empty-trash',
            danger: true,
            icon: <DeleteOutlined />,
            label: t('files.emptyTrash'),
            onClick: () =>
              modal.confirm({
                title: t('files.emptyTrashConfirm'),
                okText: t('files.emptyTrash'),
                okButtonProps: { danger: true },
                cancelText: t('common.cancel'),
                onOk: async () => {
                  await filesApi.emptyTrash();
                  reload();
                },
              }),
          },
        ]}
        more={[
          ...(space && space.level === 'manage'
            ? [
                { key: 'edit', icon: <EditOutlined />, label: t('files.editSpace'), onClick: () => setDialog({ type: 'space', space }) },
                { key: 'access', icon: <TeamOutlined />, label: t('kb.accessMenu'), onClick: () => setDialog({ type: 'access', space }) },
                { type: 'divider' },
                {
                  key: 'delete',
                  danger: true,
                  icon: <DeleteOutlined />,
                  label: t('files.deleteSpace'),
                  onClick: () =>
                    modal.confirm({
                      title: t('files.deleteSpaceConfirm', { name: space.name }),
                      content: t('files.deleteSpaceText'),
                      okText: t('common.delete'),
                      okButtonProps: { danger: true },
                      cancelText: t('common.cancel'),
                      onOk: async () => {
                        try {
                          await filesApi.deleteSpace(space.id);
                          await refreshHome();
                          navigate('/app/files');
                        } catch (err) {
                          message.error(errorMessage(err));
                        }
                      },
                    }),
                },
              ]
            : []),
          // View option: folder READMEs on or off (everywhere, on this device).
          chain && space?.level === 'manage' && { type: 'divider' },
          chain && { key: 'readme', label: <Checkbox checked={!readmesHidden}>{t('readme.showAll')}</Checkbox>, onClick: () => setReadmesHidden(!readmesHidden) },
        ].filter(Boolean)}
        selection={
          selectedNodes.length > 0 && (
            <SelectionBar
              label={t('files.selectedN', { n: selectedNodes.length })}
              onClear={() => setSelected(new Set())}
              actions={
                selectedNodes.every((node) => atLeast(node.level, 'edit') && !node.systemTag) && !trash
                  ? [
                      { key: 'move', icon: <ExportOutlined />, label: t('files.move'), onClick: () => setDialog({ type: 'move', nodes: selectedNodes }) },
                      { key: 'trash', icon: <DeleteOutlined />, danger: true, label: t('files.toTrash'), onClick: () => remove(selectedNodes) },
                    ]
                  : []
              }
            />
          )
        }
        status={data && items.length > 0 && !selectedNodes.length ? t('files.itemsN', { n: items.length }) : null}
        tools={<ViewToggle value={view} onChange={setView} />}
      />

      {readme && resolver && (
        <ReadmeCard
          key={`${placeKey}:${readme.id}`}
          file={{ name: readme.name, size: readme.file?.size, modified: readme.updatedAt }}
          url={src.file(readme)}
          version={readme.updatedAt || ''}
          folderKey={`files:${placeKey}`}
          resolveLink={(target) => {
            const here = resolver.local(target);
            if (here) return { href: here.kind === 'folder' ? `/app/files/f/${here.id}` : `/app/files/v/${here.id}`, open: () => open(here) };
            return {
              open: () =>
                resolver.resolve(target).then((found) => {
                  if (!found) message.info(t('readme.notFound'));
                  else if (found.kind === 'file') open(found);
                  else navigate(found.kind === 'folder' ? `/app/files/f/${found.id}` : placeUrl(found));
                }),
            };
          }}
          resolveImage={(target) => {
            const here = resolver.local(target);
            if (here) return here.kind === 'file' ? src.file(here) : null;
            return resolver.resolve(target).then((found) => (found?.kind === 'file' ? src.file(found) : null));
          }}
          onOpen={() => (config?.openMode === 'modal' ? setViewing(readme) : navigate(`/app/files/v/${readme.id}`))}
          downloadUrl={src.file(readme, { download: true })}
          linkUrl={`${window.location.origin}/app/files/v/${readme.id}`}
        />
      )}

      {!data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <NodeList
          nodes={items}
          view={view}
          selected={selected}
          onToggle={trash || place.type === 'recent' || place.type === 'search' ? null : toggle}
          onOpen={open}
          menu={menu}
          showOwner={place.type === 'shared'}
          showPath={place.type === 'search'}
          emptyText={trash ? t('files.trashEmpty') : place.type === 'shared' ? t('files.sharedEmpty') : canEdit ? t('files.emptyDrop') : t('files.empty')}
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

      {viewing && (
        <NodeViewer node={viewing} siblings={items} src={src} conversion={config?.conversion} onNavigate={(next) => next && setViewing(items.find((item) => item.id === next.id))} onClose={() => setViewing(null)} />
      )}
      <NameDialog
        open={dialog?.type === 'folder'}
        title={t('files.newFolder')}
        initial={t('files.newFolderName')}
        onSubmit={(name) => filesApi.createFolder({ ...target, name })}
        onClose={(saved) => {
          setDialog(null);
          if (saved) reload();
        }}
      />
      <NameDialog
        open={dialog?.type === 'rename'}
        title={t('files.rename')}
        initial={dialog?.node?.name || ''}
        onSubmit={(name) => filesApi.rename(dialog.node.id, name)}
        onClose={(saved) => {
          setDialog(null);
          if (saved) reload();
        }}
      />
      <MoveDialog
        open={dialog?.type === 'move'}
        nodes={dialog?.nodes || []}
        onClose={(moved) => {
          setDialog(null);
          if (moved) {
            setSelected(new Set());
            reload();
          }
        }}
      />
      <ShareDialog
        open={dialog?.type === 'share'}
        node={dialog?.node}
        config={config || {}}
        onClose={(changed) => {
          setDialog(null);
          if (changed) reload();
        }}
      />
      <SpaceDialog
        open={dialog?.type === 'space'}
        space={dialog?.space}
        onClose={async (saved) => {
          setDialog(null);
          if (saved) {
            await refreshHome();
            reload();
          }
        }}
      />
      <AccessDialog
        open={dialog?.type === 'access'}
        title={dialog?.space?.name}
        levelKey="files.spaceLevel"
        load={() => filesApi.spaceAccess(dialog.space.id)}
        loadSubjects={filesApi.subjects}
        save={(entries) => filesApi.saveSpaceAccess(dialog.space.id, entries)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
