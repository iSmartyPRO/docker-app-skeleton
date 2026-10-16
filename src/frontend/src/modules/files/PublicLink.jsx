import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { App, Button, Dropdown, Form, Input, Modal, Progress, Skeleton } from 'antd';
import {
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  FolderAddOutlined,
  InboxOutlined,
  LockOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import ThemeSwitch from '../../components/ThemeSwitch';
import { PermissionChips, permissionSentence } from '../../components/ui/LinkPermissions';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { UserAvatar } from '../shared/People';
import { asViewerItem, formatBytes, linkApi, linkSource } from './api';
import { markViewCounted, viewCounted } from '../../lib/linkVisit';
import { canPickFolders, collectDrop, collectPicked } from './folderUpload';
import NodeList, { NodeIcon } from './components/NodeList';
import ReadmeCard from '../../components/readme/ReadmeCard';
import { pickReadme } from '../../lib/readme';
import { nodeResolver } from './readmeLinks';
import NodeViewer from './components/NodeViewer';
import DocumentViewer from '../kb/viewers/DocumentViewer';
import '../kb/kb.css';
import '../shared/module.css';
import './files.css';
import './publicLink.css';

/*
 * /l/:token — a file or folder shared by public link. What the visitor can do
 * follows the link's permissions (link.permissions from the server, which
 * checks them again on every request): browse and preview, download, upload
 * (files, folders, drag & drop), create folders, rename, replace, delete.
 * A folder link with upload but no view is a drop box: the visitor sees only
 * what they sent in this browser tab.
 */

const tokenKey = (token) => `fs_link_${token}`;
const CONCURRENCY = 3;

function readVisitor(token) {
  try {
    return sessionStorage.getItem(tokenKey(token)) || '';
  } catch {
    return '';
  }
}

function storeVisitor(token, value) {
  try {
    sessionStorage.setItem(tokenKey(token), value || '');
  } catch {
    /* private mode: the session lives in memory only */
  }
}

const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '');
let uid = 0;
const nextId = () => `u${Date.now().toString(36)}${(uid += 1)}`;

function Notice({ icon, title, text, children }) {
  return (
    <div className="share-notice">
      <div className="share-notice__icon">{icon}</div>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/** Asks the visitor's name (and e-mail) before their first change. */
function NameDialog({ ask, link, onDone, onCancel }) {
  const { t } = useLocale();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(ask)}
      title={t('files.public.nameTitle')}
      onCancel={onCancel}
      okText={t('files.public.nameOk')}
      confirmLoading={busy}
      onOk={() => form.submit()}
      destroyOnHidden
      width={420}
    >
      <p className="pl-muted">{t('files.public.nameLead')}</p>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ name: link?.visitor?.name || '', email: link?.visitor?.email || '' }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            await onDone(values);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item name="name" label={t('files.public.yourName')} rules={[{ required: true, whitespace: true, message: t('files.public.nameRequired') }]}>
          <Input autoFocus maxLength={120} prefix={<UserOutlined />} autoComplete="name" />
        </Form.Item>
        <Form.Item
          name="email"
          label={link?.requireEmail ? t('files.public.yourEmail') : t('files.public.yourEmailOptional')}
          rules={[{ required: Boolean(link?.requireEmail), type: 'email', message: t('files.public.emailInvalid') }]}
        >
          <Input maxLength={160} type="email" autoComplete="email" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** A prompt for one text value (rename, new folder). */
function TextPrompt({ prompt, onClose }) {
  const { t } = useLocale();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = useRef(false);
  useEffect(() => {
    setValue(prompt?.initial || '');
    selected.current = false;
  }, [prompt]);
  const ok = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      if ((await prompt.onOk(value.trim())) !== false) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={Boolean(prompt)} title={prompt?.title} onCancel={onClose} onOk={ok} okText={prompt?.okText || t('common.save')} confirmLoading={busy} okButtonProps={{ disabled: !value.trim() }} destroyOnHidden width={420}>
      <Input
        autoFocus
        value={value}
        maxLength={255}
        onChange={(event) => setValue(event.target.value)}
        onPressEnter={ok}
        onFocus={(event) => {
          // Once per prompt: select the name without the extension, like a desktop rename.
          if (selected.current) return;
          selected.current = true;
          const dot = event.target.value.lastIndexOf('.');
          if (dot > 0) event.target.setSelectionRange(0, dot);
        }}
      />
    </Modal>
  );
}

function UploadRow({ item, onCancel }) {
  const { t } = useLocale();
  const status = item.status === 'error' ? 'exception' : item.status === 'done' ? 'success' : 'active';
  return (
    <li className={`pl-upload is-${item.status}`}>
      <NodeIcon node={{ kind: 'file', file: { ext: extOf(item.name) } }} size={30} />
      <div className="pl-upload__body">
        <div className="pl-upload__name" title={item.name}>
          {item.name}
        </div>
        {item.status === 'uploading' || item.status === 'queued' ? (
          <Progress percent={Math.round(item.progress * 100)} size="small" status={status} showInfo={false} />
        ) : null}
        <div className="pl-upload__meta">
          {formatBytes(item.size)}
          {item.status === 'queued' && ` · ${t('files.public.queued')}`}
          {item.status === 'uploading' && ` · ${Math.round(item.progress * 100)}%`}
          {item.status === 'done' && ` · ${t('files.public.sent')}`}
          {item.status === 'cancelled' && ` · ${t('files.public.cancelled')}`}
          {item.status === 'error' && <span className="pl-upload__error"> · {item.error}</span>}
        </div>
      </div>
      {(item.status === 'uploading' || item.status === 'queued') && (
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => onCancel(item.id)} aria-label={t('files.public.cancel')} />
      )}
      {item.status === 'done' && <span className="pl-upload__ok">✓</span>}
    </li>
  );
}

/** /l/:token — a file or folder shared by public link. */
export default function PublicLink() {
  const { token } = useParams();
  const location = useLocation();
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const { message, modal } = App.useApp();
  const visitorRef = useRef(readVisitor(token));
  const [folderId, setFolderId] = useState(null);
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [ask, setAsk] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const controllers = useRef(new Map());
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const replaceInput = useRef(null);
  const replaceTarget = useRef(null);
  const folders = useMemo(() => canPickFolders(), []);

  const setVisitor = (value) => {
    visitorRef.current = value || '';
    storeVisitor(token, value);
  };

  const load = useCallback(() => {
    linkApi
      .open(token, { folder: folderId, visitor: visitorRef.current, preview, repeat: viewCounted('files', token) })
      .then((res) => {
        if (!folderId) markViewCounted('files', token);
        // A session token from before read tokens existed is swapped for a new one (same session and name).
        if (res.data.visitorToken) setVisitor(res.data.visitorToken);
        setData(res.data);
        setState('ready');
      })
      .catch((err) => {
        const code = err?.response?.data?.code;
        setState(code === 'PASSWORD_REQUIRED' ? 'locked' : code === 'EXPIRED' ? 'expired' : code === 'LINK_DISABLED' ? 'disabled' : 'missing');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, folderId, preview]);

  useEffect(() => {
    load();
  }, [load]);

  const linkError = (err) => {
    const code = err?.response?.data?.code;
    if (code) {
      const key = `files.public.err.${code}`;
      const text = t(key);
      if (text !== key) return text;
    }
    return errorMessage(err);
  };

  const unlock = async () => {
    setError('');
    try {
      const res = await linkApi.unlock(token, password);
      setVisitor(res.data.token || '');
      load();
    } catch (err) {
      const code = err?.response?.data?.code;
      setError(t(`kb.public.err_${code || 'generic'}`));
      setPassword('');
    }
  };

  // File addresses carry the read token only (the session token never goes into a URL).
  const src = useMemo(() => linkSource(token, data?.readToken || '', data?.link.allowDownload), [token, data]);
  const link = data?.link;
  const can = (key) => Boolean(link?.permissions?.includes(key));
  const uploadOnly = Boolean(link) && can('upload') && !can('view');
  const maxBytes = link?.maxFileMb ? link.maxFileMb * 1024 * 1024 : 0;

  // The folder's README.md, shown above the listing when the link lets the visitor see the folder.
  const readme = data && can('view') && data.node?.kind === 'folder' ? pickReadme(data.items, { isDir: (node) => node.kind !== 'file' }) : null;
  const readmeResolver = useMemo(() => {
    if (!data || data.node?.kind !== 'folder') return null;
    const chain = [...(data.crumbs || []), data.node].map((node) => ({ key: `folder:${node.id}`, type: 'folder', id: node.id }));
    const list = async (at) => (await linkApi.open(token, { folder: at.id === data.link.rootId ? null : at.id, visitor: visitorRef.current, preview, repeat: true })).data.items || [];
    return nodeResolver({ chain, items: data.items || [], list });
  }, [data, token, preview]);
  const goToNode = (found) => {
    if (!found) message.info(t('readme.notFound'));
    else if (found.kind === 'file') setViewing(found);
    else setFolderId(found.id === link?.rootId ? null : found.id);
  };

  /** A visitor session for changes; asks the name first when the link wants it. */
  const ensureSession = async () => {
    const current = data?.link.visitor;
    const needName = link.requireName && !current?.name;
    if (visitorRef.current && current?.session && !needName) return visitorRef.current;
    let info = {};
    if (needName) {
      info = await new Promise((resolve, reject) => setAsk({ resolve, reject }));
    }
    const res = await linkApi.session(token, visitorRef.current, info);
    setVisitor(res.data.token);
    setData((prev) => (prev ? { ...prev, link: { ...prev.link, visitor: { ...res.data.visitor, session: true } } } : prev));
    return res.data.token;
  };

  const patchUpload = (id, patch) => setUploads((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  /** Uploads files (each { file, folder }) a few at a time, with progress and cancel per file. */
  const sendFiles = async (entries) => {
    if (!entries.length) return;
    let session;
    try {
      session = await ensureSession();
    } catch (err) {
      if (err) message.error(linkError(err));
      return;
    }
    const exts = link.extensions || [];
    const items = entries.map(({ file, folder }) => {
      let problem = null;
      if (maxBytes && file.size > maxBytes) problem = t('files.public.tooLarge', { n: link.maxFileMb });
      else if (exts.length && !exts.includes(extOf(file.name))) problem = t('files.public.wrongType', { list: exts.map((ext) => `.${ext}`).join(', ') });
      return { id: nextId(), file, folder, name: file.name, size: file.size, progress: 0, status: problem ? 'error' : 'queued', error: problem };
    });
    setUploads((list) => [...items.map(({ file, folder, ...rest }) => rest), ...list]);
    const queue = items.filter((item) => item.status === 'queued');
    let sent = 0;
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        patchUpload(item.id, { status: 'uploading' });
        try {
          await linkApi.upload(token, session, item.folder, [item.file], (progress) => patchUpload(item.id, { progress }), controller.signal);
          patchUpload(item.id, { status: 'done', progress: 1 });
          sent += 1;
        } catch (err) {
          if (controller.signal.aborted) patchUpload(item.id, { status: 'cancelled' });
          else patchUpload(item.id, { status: 'error', error: linkError(err) });
        } finally {
          controllers.current.delete(item.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (sent) load();
  };

  const cancelUpload = (id) => {
    const controller = controllers.current.get(id);
    if (controller) controller.abort();
    else patchUpload(id, { status: 'cancelled' });
  };

  const here = () => (uploadOnly ? null : data?.node.kind === 'folder' ? data.node.id : null);

  /** Files with their folders ({ files: [{ file, dir }], dirs }): folders are recreated when allowed, else flattened. */
  const sendTree = async (scan) => {
    const target = here();
    if (!scan.dirs.length || !(can('mkdir') && can('view'))) {
      if (scan.dirs.length) message.info(t('files.public.flattened'));
      await sendFiles(scan.files.map(({ file }) => ({ file, folder: target })));
      return;
    }
    let session;
    try {
      session = await ensureSession();
    } catch (err) {
      if (err) message.error(linkError(err));
      return;
    }
    try {
      const ids = new Map();
      const bytes = scan.files.reduce((sum, item) => sum + (item.file.size || 0), 0);
      for (let index = 0; index < scan.dirs.length; index += 500) {
        const chunk = scan.dirs.slice(index, index + 500);
        const res = await linkApi.folderTree(token, session, target || link.rootId, chunk, index === 0 ? bytes : 0);
        chunk.forEach((dir, at) => ids.set(dir, res.data.folders[at]));
      }
      await sendFiles(scan.files.map(({ file, dir }) => ({ file, folder: dir ? ids.get(dir) : target })));
    } catch (err) {
      message.error(linkError(err));
    }
  };

  const onDrop = async (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!can('upload')) return;
    const drop = collectDrop(event.dataTransfer);
    try {
      const scan = await drop.scan();
      await sendTree(scan);
    } catch {
      await sendFiles(drop.plain.filter((file) => file.size || file.type).map((file) => ({ file, folder: here() })));
    }
  };

  const dropHandlers = can('upload')
    ? {
        onDragEnter: (event) => {
          if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (event) => event.preventDefault(),
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        },
        onDrop,
      }
    : {};

  const write = async (action, success) => {
    try {
      const session = await ensureSession();
      await action(session);
      if (success) message.success(success);
      load();
      return true;
    } catch (err) {
      if (err) message.error(linkError(err));
      return false;
    }
  };

  const rename = (node) =>
    setPrompt({
      title: t('files.public.renameTitle'),
      initial: node.name,
      onOk: (name) => write((session) => linkApi.rename(token, session, node.id, name), t('files.public.renamed')),
    });

  const newFolder = () =>
    setPrompt({
      title: t('files.public.newFolder'),
      okText: t('common.create'),
      initial: '',
      onOk: (name) => write((session) => linkApi.mkdir(token, session, data.node.id, name), t('files.public.folderCreated')),
    });

  const remove = (node) =>
    modal.confirm({
      title: t('files.public.deleteTitle', { name: node.name }),
      content: t('files.public.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      onOk: () => write((session) => linkApi.remove(token, session, node.id), t('files.public.deleted')),
    });

  const startReplace = (node) => {
    replaceTarget.current = node;
    if (replaceInput.current) {
      replaceInput.current.accept = node.file?.ext ? `.${node.file.ext}` : '';
      replaceInput.current.click();
    }
  };

  const doReplace = async (file) => {
    const node = replaceTarget.current;
    if (!node || !file) return;
    if (node.file?.ext && extOf(file.name) !== node.file.ext) {
      message.error(t('files.public.err.EXT_MISMATCH'));
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      message.error(t('files.public.tooLarge', { n: link.maxFileMb }));
      return;
    }
    const hide = message.loading(t('files.public.replacing', { name: node.name }), 0);
    await write((session) => linkApi.replace(token, session, node.id, file), t('files.public.replaced'));
    hide();
  };

  const menu = (node) => {
    const items = [];
    if (node.kind === 'file' && can('download')) items.push({ key: 'dl', icon: <DownloadOutlined />, label: <a href={src.file(node, { download: true })}>{t('kb.download')}</a> });
    if (can('rename')) items.push({ key: 'rename', icon: <EditOutlined />, label: t('files.public.rename'), onClick: () => rename(node) });
    if (node.kind === 'file' && can('replace')) items.push({ key: 'replace', icon: <SwapOutlined />, label: t('files.public.replace'), onClick: () => startReplace(node) });
    if (can('delete')) {
      if (items.length) items.push({ type: 'divider' });
      items.push({ key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => remove(node) });
    }
    return items;
  };

  const pickers = (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={link?.extensions?.length ? link.extensions.map((ext) => `.${ext}`).join(',') : undefined}
        data-testid="pl-file-input"
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = '';
          sendFiles(files.map((file) => ({ file, folder: here() })));
        }}
      />
      <input
        ref={(node) => {
          folderInput.current = node;
          if (node) {
            node.setAttribute('webkitdirectory', '');
            node.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = '';
          try {
            sendTree(collectPicked(files));
          } catch (err) {
            message.error(err.message);
          }
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        hidden
        data-testid="pl-replace-input"
        onChange={(event) => {
          const file = event.target.files[0];
          event.target.value = '';
          doReplace(file);
        }}
      />
    </>
  );

  const uploadButton = (primary = true) =>
    folders && can('mkdir') ? (
      <Dropdown.Button
        type={primary ? 'primary' : 'default'}
        onClick={() => fileInput.current?.click()}
        icon={<DownOutlined />}
        menu={{
          items: [
            { key: 'files', label: t('folderUpload.uploadFiles'), onClick: () => fileInput.current?.click() },
            { key: 'folder', label: `📁 ${t('folderUpload.uploadFolder')}`, onClick: () => folderInput.current?.click() },
          ],
        }}
      >
        <CloudUploadOutlined /> {t('files.public.upload')}
      </Dropdown.Button>
    ) : (
      <Button type={primary ? 'primary' : 'default'} icon={<CloudUploadOutlined />} onClick={() => fileInput.current?.click()}>
        {t('files.public.upload')}
      </Button>
    );

  const rules = link
    ? [
        link.maxFileMb && t('files.public.ruleSize', { n: link.maxFileMb }),
        link.extensions?.length && t('files.public.ruleTypes', { list: link.extensions.map((ext) => `.${ext}`).join(', ') }),
        link.quotaMb && t('files.public.ruleQuota', { n: link.quotaMb }),
      ].filter(Boolean)
    : [];

  const who = link?.visitor?.name ? (
    <button type="button" className="pl-who" onClick={() => setAsk({ resolve: async (info) => {
      const res = await linkApi.session(token, visitorRef.current, info);
      setVisitor(res.data.token);
      setData((prev) => (prev ? { ...prev, link: { ...prev.link, visitor: { ...res.data.visitor, session: true } } } : prev));
    }, reject: () => {} })}>
      <UserOutlined /> {t('files.public.youAre', { name: link.visitor.name })} <span className="pl-who__change">{t('files.public.change')}</span>
    </button>
  ) : null;

  const uploadList = uploads.length > 0 && (
    <section className="pl-uploads" aria-live="polite">
      <header>
        <span>{t('files.public.uploadsTitle')}</span>
        {uploads.every((item) => item.status !== 'uploading' && item.status !== 'queued') && (
          <Button type="link" size="small" onClick={() => setUploads([])}>
            {t('files.public.clear')}
          </Button>
        )}
      </header>
      <ul>
        {uploads.map((item) => (
          <UploadRow key={item.id} item={item} onCancel={cancelUpload} />
        ))}
      </ul>
    </section>
  );

  let body;
  if (state === 'loading' || (state === 'ready' && !data)) body = <Skeleton active paragraph={{ rows: 8 }} />;
  else if (state === 'locked') {
    body = (
      <Notice icon="🔒" title={t('kb.public.protected')} text={t('kb.public.passwordLead')}>
        <div className="share-gate">
          <Input.Password size="large" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={unlock} placeholder={t('kb.share.password')} status={error ? 'error' : undefined} />
          {error && <div className="signin__error">{error}</div>}
          <Button type="primary" size="large" block disabled={!password} onClick={unlock}>{t('kb.public.open')}</Button>
        </div>
      </Notice>
    );
  } else if (state === 'expired') body = <Notice icon="⏳" title={t('kb.public.expired')} text={t('kb.public.expiredText')} />;
  else if (state === 'disabled') body = <Notice icon="⛔" title={t('files.public.disabledTitle')} text={t('files.public.disabledText')} />;
  else if (state === 'missing') body = <Notice icon="🔍" title={t('kb.public.notFound')} text={t('kb.public.notFoundText')} />;
  else if (uploadOnly) {
    // Drop box: send files, see only your own.
    const mine = data.mine || [];
    const doneNames = new Set(uploads.filter((item) => item.status === 'done').map((item) => item.name));
    const earlier = mine.filter((item) => !doneNames.has(item.name));
    body = (
      <div className="pl-dropbox" {...dropHandlers}>
        <div className="pl-dropbox__card">
          <div className="pl-owner">
            <UserAvatar user={link.owner} size={44} tip={false} />
            <span className="pl-owner__text">
              <span className="pl-eyebrow">{t('files.public.requestFrom')}</span>
              <strong>{link.owner?.name}</strong>
            </span>
          </div>
          <h1 className="pl-dropbox__title">{t('files.public.sendTitle', { name: link.owner?.name || '' })}</h1>
          <p className="pl-dropbox__subtitle">
            <InboxOutlined /> {link.title || data.node.name}
            {link.expiresAt && <span className="pl-muted"> · {t('kb.public.until', { date: formatDateTime(link.expiresAt, locale) })}</span>}
          </p>
          {who}
          <button type="button" className={`pl-zone${dragging ? ' is-over' : ''}`} onClick={() => fileInput.current?.click()} data-testid="pl-zone">
            <span className="pl-zone__icon">
              <CloudUploadOutlined />
            </span>
            <span className="pl-zone__title">{dragging ? t('files.public.dropNow') : t('files.public.dropTitle')}</span>
            <span className="pl-zone__hint">{t('files.public.dropHint')}</span>
          </button>
          {rules.length > 0 && <div className="pl-rules">{rules.join(' · ')}</div>}
          <p className="pl-privacy">
            <LockOutlined /> {t('files.public.privacy')}
          </p>
          {uploadList}
          {earlier.length > 0 && (
            <section className="pl-uploads">
              <header>
                <span>{t('files.public.mineTitle')}</span>
              </header>
              <ul>
                {earlier.map((item) => (
                  <li key={item.id} className="pl-upload is-done">
                    <NodeIcon node={{ kind: 'file', file: { ext: item.ext } }} size={30} />
                    <div className="pl-upload__body">
                      <div className="pl-upload__name">{item.name}</div>
                      <div className="pl-upload__meta">
                        {formatBytes(item.size)} · {formatRelative(item.at, locale)}
                      </div>
                    </div>
                    <span className="pl-upload__ok">✓</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {pickers}
      </div>
    );
  } else {
    const { node, items, crumbs } = data;
    const isFolder = node.kind === 'folder';
    body = (
      <div className={`kb-page pl-page${dragging ? ' is-dragging' : ''}`} {...dropHandlers}>
        <header className="pl-hero">
          <div className="pl-hero__main">
            <NodeIcon node={node} size={56} />
            <div className="pl-hero__text">
              <span className="pl-owner is-inline">
                <UserAvatar user={link.owner} size={22} tip={false} />
                <span className="pl-eyebrow">{t('files.public.sharedBy', { name: link.owner?.name || '' })}</span>
              </span>
              <h1>{link.title || node.name}</h1>
              <p>
                {node.kind === 'file' ? formatBytes(node.file?.size) : t('files.itemsN', { n: items.length })}
                {link.expiresAt && ` · ${t('kb.public.until', { date: formatDateTime(link.expiresAt, locale) })}`}
              </p>
              <div className="pl-can">
                <span>{t('files.public.youCan', { list: permissionSentence(link.permissions, t) })}</span>
                <PermissionChips perms={link.permissions} compact />
              </div>
            </div>
          </div>
          <div className="pl-hero__actions">
            {who}
            {!isFolder && can('download') && (
              <Button type="primary" icon={<DownloadOutlined />} href={src.file(node, { download: true })}>
                {t('kb.download')}
              </Button>
            )}
            {!isFolder && can('replace') && (
              <Button icon={<SwapOutlined />} onClick={() => startReplace(node)}>
                {t('files.public.replace')}
              </Button>
            )}
            {isFolder && can('mkdir') && (
              <Button icon={<FolderAddOutlined />} onClick={newFolder}>
                {t('files.public.newFolder')}
              </Button>
            )}
            {isFolder && can('upload') && uploadButton(true)}
          </div>
        </header>
        {isFolder && crumbs.length > 0 && (
          <nav className="kb-crumbs">
            {crumbs.map((crumb) => (
              <span key={crumb.id}>
                <button type="button" className="fs-crumb-btn" onClick={() => setFolderId(crumb.id === link.rootId ? null : crumb.id)}>
                  {crumb.name}
                </button>
                <span className="kb-crumbs__sep">/</span>
              </span>
            ))}
            <strong>{node.name}</strong>
          </nav>
        )}
        {isFolder && can('upload') && rules.length > 0 && <div className="pl-rules is-left">{rules.join(' · ')}</div>}
        {uploadList}
        {readme && readmeResolver && (
          <ReadmeCard
            key={`${token}:${node.id}:${readme.id}`}
            file={{ name: readme.name, size: readme.file?.size, modified: readme.updatedAt }}
            url={src.file(readme)}
            version={readme.updatedAt || ''}
            folderKey={`l:${token}:${node.id}`}
            resolveLink={(target) => {
              const here = readmeResolver.local(target);
              return { open: () => (here ? goToNode(here) : readmeResolver.resolve(target).then(goToNode)) };
            }}
            resolveImage={(target) => {
              const here = readmeResolver.local(target);
              if (here) return here.kind === 'file' ? src.file(here) : null;
              return readmeResolver.resolve(target).then((found) => (found?.kind === 'file' ? src.file(found) : null));
            }}
            onOpen={() => setViewing(readme)}
            downloadUrl={can('download') ? src.file(readme, { download: true }) : null}
          />
        )}
        {isFolder ? (
          <div className="pl-browser">
            {can('upload') && (
              <div className={`pl-dropveil${dragging ? ' is-on' : ''}`} aria-hidden={!dragging}>
                <CloudUploadOutlined />
                <span>{t('files.public.dropInto', { name: node.name })}</span>
              </div>
            )}
            {items.length || !can('upload') ? (
              <NodeList
                nodes={items}
                view="grid"
                src={src}
                menu={menu}
                onOpen={(item) => (item.kind === 'folder' ? setFolderId(item.id) : setViewing(item))}
                emptyText={t('files.empty')}
              />
            ) : (
              <button type="button" className="pl-zone is-empty" onClick={() => fileInput.current?.click()}>
                <span className="pl-zone__icon">
                  <CloudUploadOutlined />
                </span>
                <span className="pl-zone__title">{t('files.public.emptyUpload')}</span>
                <span className="pl-zone__hint">{t('files.public.dropHint')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="kb-viewer kb-viewer--file">
            <DocumentViewer item={asViewerItem(node)} src={src} conversion={data.conversion} />
          </div>
        )}
        {viewing && <NodeViewer node={viewing} siblings={items} src={src} conversion={data.conversion} onNavigate={(next) => next && setViewing(items.find((item) => item.id === next.id))} onClose={() => setViewing(null)} />}
        {pickers}
      </div>
    );
  }

  return (
    <div className="share-page">
      <header className="share-page__bar">
        <span className="share-page__brand">
          <BrandMark />
          <span>{settings?.appName}</span>
        </span>
        <span className="share-page__tools">
          <LanguageSwitch />
          <ThemeSwitch />
        </span>
      </header>
      {preview && <div className="pl-preview-bar">{t('files.public.previewBar')}</div>}
      <main className="share-page__main">{body}</main>
      <NameDialog
        ask={ask}
        link={link}
        onCancel={() => {
          ask?.reject?.(null);
          setAsk(null);
        }}
        onDone={async (values) => {
          try {
            await ask.resolve({ name: values.name.trim(), email: (values.email || '').trim() || undefined });
          } catch (err) {
            message.error(linkError(err));
            return;
          }
          setAsk(null);
        }}
      />
      <TextPrompt prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}
