import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Dropdown, Result, Skeleton, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { AppstoreOutlined, MoreOutlined, PlusOutlined, ShareAltOutlined, TeamOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { kbApi, privateSource } from '../api';
import { atLeast, useKb } from '../KbContext';
import { itemType } from '../fileTypes';
import FolderContent from '../components/FolderContent';
import { FolderIcon } from '../components/Icons';
import FolderDialog from '../components/FolderDialog';
import ItemDialog from '../components/ItemDialog';
import AccessDialog from '../components/AccessDialog';
import ShareDialog from '../components/ShareDialog';
import MoveDialog from '../components/MoveDialog';
import UploadPanel from '../components/UploadPanel';
import { ImageViewer } from '../viewers/DocumentViewer';
import { useItemActions } from './useItemActions';
import { useSettings } from '../../../context/SettingsContext';
import { FilePicker } from '../../files/components/dialogs';

const VIEW_KEY = 'kb_view';

export function useView() {
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'grid';
    } catch {
      return 'grid';
    }
  });
  const change = (next) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  return [view, change];
}

export default function KbFolder() {
  const { id } = useParams();
  const folderId = Number(id);
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { config, refreshTree } = useKb();
  const { settings } = useSettings();
  const filesOn = Boolean(settings?.modules?.files?.enabled);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useView();
  const [dialog, setDialog] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [gallery, setGallery] = useState(null);
  const fileInput = useRef(null);
  const dragDepth = useRef(0);
  const src = useMemo(() => privateSource(), []);

  // Listings can answer out of order (fast folder switches, reloads): only the latest lands.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const res = await kbApi.folder(folderId);
      if (seq !== loadSeq.current) return;
      setData(res.data);
      setError(null);
    } catch (err) {
      if (seq === loadSeq.current) setError(err);
    }
  }, [folderId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const changed = useCallback(() => {
    load();
    refreshTree();
  }, [load, refreshTree]);

  const level = data?.folder.level;
  const canEdit = atLeast(level, 'edit');
  const canManage = atLeast(level, 'manage');

  const upload = async (files) => {
    if (!canEdit || !files.length) return;
    const max = config.maxUploadMb * 1024 * 1024;
    const batch = files.map((file, index) => ({
      key: `${Date.now()}-${index}`,
      name: file.name,
      file,
      progress: 0,
      status: file.size > max ? 'error' : 'uploading',
      error: file.size > max ? t('kb.upload.tooLarge', { mb: config.maxUploadMb }) : null,
    }));
    setUploads((list) => [...list, ...batch]);
    let stored = 0;
    for (const entry of batch.filter((item) => item.status === 'uploading')) {
      try {
        await kbApi.upload(folderId, [entry.file], (progress) =>
          setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, progress } : row)))
        );
        setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, progress: 1, status: 'done' } : row)));
        stored += 1;
      } catch (err) {
        setUploads((list) => list.map((row) => (row.key === entry.key ? { ...row, status: 'error', error: errorMessage(err) } : row)));
      }
    }
    // Uploads live in Files: say where to find them.
    if (stored) message.info(t('kb.storedInFiles'), 5);
    changed();
  };

  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    upload([...(event.dataTransfer?.files || [])]);
  };

  const images = useMemo(() => (data?.items || []).filter((item) => itemType(item) === 'image' && item.file?.ext !== 'heic'), [data]);

  const open = (item) => {
    const index = images.findIndex((image) => image.id === item.id);
    if (index >= 0) setGallery(index);
    else navigate(`/app/kb/d/${item.id}`);
  };

  const itemActions = useItemActions({
    onEdit: async (item) => {
      if (item.kind === 'article') {
        const res = await kbApi.item(item.id);
        setDialog({ type: 'item', item: res.data.item });
      } else setDialog({ type: 'item', item });
    },
    onMove: (item) => setDialog({ type: 'move', target: { type: 'item', id: item.id } }),
    onAccess: (item) => setDialog({ type: 'access', resource: 'item', id: item.id, title: item.title }),
    onChanged: changed,
  });

  const deleteFolder = (folder, after) =>
    modal.confirm({
      title: t('kb.confirmDeleteFolder', { name: folder.name }),
      content: t('kb.confirmDeleteFolderText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await kbApi.deleteFolder(folder.id);
          message.success(t('kb.deleted'));
          after();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  const folderActions = (folder, { current = false } = {}) => {
    const entries = [];
    if (atLeast(folder.level, 'edit')) entries.push({ key: 'edit', label: t('kb.editFolder'), onClick: () => setDialog({ type: 'folder', folder }) });
    if (atLeast(folder.level, 'manage')) {
      entries.push({ key: 'move', label: t('kb.move'), onClick: () => setDialog({ type: 'move', target: { type: 'folder', id: folder.id } }) });
      entries.push({ key: 'access', label: t('kb.access.menu'), onClick: () => setDialog({ type: 'access', resource: 'folder', id: folder.id, title: folder.name }) });
      if (config.publicLinks) entries.push({ key: 'share', label: t('kb.share.menu'), onClick: () => setDialog({ type: 'share', folder }) });
      entries.push({ type: 'divider' });
      const afterDelete = current
        ? () => {
            refreshTree();
            navigate(folder.parentId ? `/app/kb/f/${folder.parentId}` : '/app/kb');
          }
        : changed;
      entries.push({ key: 'delete', danger: true, label: t('common.delete'), onClick: () => deleteFolder(folder, afterDelete) });
    }
    return entries;
  };

  if (error) {
    const status = error?.response?.status;
    return <Result status={status === 404 ? '404' : '403'} title={status === 404 ? t('kb.notFound') : errorMessage(error)} extra={<Link to="/app/kb">{t('kb.backHome')}</Link>} />;
  }
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const { folder, breadcrumbs } = data;
  const createMenu = [
    { key: 'folder', label: t('kb.newFolder'), onClick: () => setDialog({ type: 'folder', parentId: folder.id }) },
    { key: 'upload', label: t('kb.uploadFiles'), onClick: () => fileInput.current?.click() },
    ...(filesOn ? [{ key: 'files', label: t('kb.fromFiles'), onClick: () => setDialog({ type: 'files' }) }] : []),
    { key: 'article', label: t('kb.newArticle'), onClick: () => setDialog({ type: 'item', kind: 'article' }) },
    { key: 'link', label: t('kb.newLink'), onClick: () => setDialog({ type: 'item', kind: 'link' }) },
  ];

  return (
    <div
      className={`kb-page${dragging ? ' is-dragging' : ''}`}
      onDragEnter={(event) => {
        if (!canEdit || !event.dataTransfer?.types?.includes('Files')) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDragOver={(event) => canEdit && event.preventDefault()}
      onDrop={onDrop}
    >
      <nav className="kb-crumbs">
        <Link to="/app/kb">{t('apps.kb.name')}</Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id}>
            <span className="kb-crumbs__sep">/</span>
            <Link to={`/app/kb/f/${crumb.id}`}>{crumb.name}</Link>
          </span>
        ))}
      </nav>

      <header className="kb-head" style={{ '--c': folder.color || config.defaultColor }}>
        <FolderIcon folder={folder} config={config} size={56} />
        <div className="kb-head__text">
          <h1 title={folder.name}>{folder.name}</h1>
          {folder.description && <p>{folder.description}</p>}
          <div className="kb-head__meta">
            {t('kb.counts', { folders: data.folders.length, items: data.items.length })}
            {folder.shareCount > 0 && <span className="kb-pill">🔗 {t('kb.share.count', { count: folder.shareCount })}</span>}
            {!folder.inheritAccess && <span className="kb-pill">🔒 {t('kb.access.private')}</span>}
          </div>
        </div>
        <div className="kb-head__actions">
          {canManage && config.publicLinks && (
            <Button className="mod-act" icon={<ShareAltOutlined />} onClick={() => setDialog({ type: 'share', folder })} aria-label={t('kb.share.button')} title={t('kb.share.button')}>
              <span>{t('kb.share.button')}</span>
            </Button>
          )}
          {canManage && (
            <Button className="mod-act" icon={<TeamOutlined />} onClick={() => setDialog({ type: 'access', resource: 'folder', id: folder.id, title: folder.name })} aria-label={t('kb.access.button')} title={t('kb.access.button')}>
              <span>{t('kb.access.button')}</span>
            </Button>
          )}
          {folderActions(folder, { current: true }).length > 0 && (
            <Dropdown menu={{ items: folderActions(folder, { current: true }).filter((entry) => !['share', 'access'].includes(entry.key)) }} trigger={['click']}>
              <Button icon={<MoreOutlined />} aria-label={t('common.moreActions')} title={t('common.moreActions')} />
            </Dropdown>
          )}
          {canEdit && (
            <Dropdown menu={{ items: createMenu }} trigger={['click']}>
              <Button type="primary" icon={<PlusOutlined />}>{t('kb.add')}</Button>
            </Dropdown>
          )}
        </div>
      </header>

      <div className="kb-toolbar">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', label: <Tooltip title={t('kb.viewGrid')}><AppstoreOutlined aria-label={t('kb.viewGrid')} /></Tooltip> },
            { value: 'list', label: <Tooltip title={t('kb.viewList')}><UnorderedListOutlined aria-label={t('kb.viewList')} /></Tooltip> },
          ]}
        />
        {canEdit && <span className="kb-toolbar__hint">{t('kb.dropHint')}</span>}
      </div>

      <FolderContent
        folders={data.folders}
        items={data.items}
        view={view}
        config={config}
        src={src}
        folderLink={(folderIdValue) => `/app/kb/f/${folderIdValue}`}
        onOpen={open}
        actionsFor={itemActions}
        folderActionsFor={folderActions}
        emptyText={canEdit ? t('kb.emptyEditable') : t('kb.emptyFolder')}
      />

      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }} />
      {dragging && <div className="kb-drop"><div>{t('kb.dropHere', { name: folder.name })}</div></div>}
      <UploadPanel uploads={uploads} onClear={() => setUploads([])} />

      {gallery !== null && (
        <ImageViewer images={images} index={gallery} onIndex={setGallery} onClose={() => setGallery(null)} src={src} canDownload />
      )}

      <FolderDialog
        open={dialog?.type === 'folder'}
        folder={dialog?.folder}
        parentId={dialog?.parentId}
        config={config}
        onClose={() => setDialog(null)}
        onSaved={(savedId) => {
          setDialog(null);
          changed();
          if (!dialog?.folder) navigate(`/app/kb/f/${savedId}`);
        }}
      />
      <ItemDialog
        open={dialog?.type === 'item'}
        kind={dialog?.kind}
        item={dialog?.item}
        folderId={folder.id}
        onClose={() => setDialog(null)}
        onSaved={(savedId) => {
          const created = !dialog?.item;
          setDialog(null);
          changed();
          if (created && dialog?.kind === 'article') navigate(`/app/kb/d/${savedId}`);
        }}
      />
      {dialog?.type === 'access' && (
        <AccessDialog
          open
          type={dialog.resource}
          id={dialog.id}
          title={dialog.title}
          onClose={(saved) => {
            setDialog(null);
            if (saved) changed();
          }}
        />
      )}
      <FilePicker
        open={dialog?.type === 'files'}
        title={t('kb.fromFiles')}
        okText={t('kb.addToFolder')}
        onClose={() => setDialog(null)}
        onPick={async (nodes) => {
          try {
            await kbApi.fromFiles(folder.id, nodes.map((node) => node.id));
            message.success(t('kb.addedFromFiles', { n: nodes.length }));
            setDialog(null);
            load();
            refreshTree();
          } catch (err) {
            message.error(errorMessage(err));
          }
        }}
      />
      {dialog?.type === 'share' && <ShareDialog open folder={dialog.folder} config={config} onClose={() => { setDialog(null); load(); }} />}
      <MoveDialog
        open={dialog?.type === 'move'}
        target={dialog?.target}
        onClose={() => setDialog(null)}
        move={(target) =>
          dialog.target.type === 'folder'
            ? kbApi.updateFolder(dialog.target.id, { parentId: target || null })
            : kbApi.updateItem(dialog.target.id, { folderId: target })
        }
        onMoved={() => {
          setDialog(null);
          changed();
        }}
      />
    </div>
  );
}
