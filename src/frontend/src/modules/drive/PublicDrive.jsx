import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { App, Button, Checkbox, Input, Modal, Radio, Skeleton, Spin } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FolderAddOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import ThemeSwitch from '../../components/ThemeSwitch';
import { PermissionChips, permissionSentence } from '../../components/ui/LinkPermissions';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, formatRelative } from '../../lib/format';
import DocumentViewer from '../../components/documents/viewers/DocumentViewer';
import { FolderUploadError, canPickFolders, collectDrop, collectPicked } from '../../components/filekit/folderUpload';
import { CAD, asViewerItem, driveError, formatBytes, linkSource, publicDriveApi } from './api';
import { markViewCounted, viewCounted } from '../../lib/linkVisit';
import EntryList, { EntryIcon } from './components/EntryList';
import ReadmeCard from '../../components/readme/ReadmeCard';
import { joinRelative, pickReadme } from '../../lib/readme';
import DriveViewer from './components/DriveViewer';
import { VisitorUploadList, useVisitorQueue } from './components/VisitorUploads';
import '../../components/documents/documents.css';
import '../shared/module.css';
import '../../components/filekit/filekit.css';
import './drive.css';

const CadViewer = lazy(() => import('./components/CadViewer'));
const tokenKey = (token) => `drive_link_${token}`;

function readVisitor(token) {
  try {
    return sessionStorage.getItem(tokenKey(token)) || '';
  } catch {
    return '';
  }
}

function storeVisitor(token, value) {
  try {
    if (value) sessionStorage.setItem(tokenKey(token), value);
    else sessionStorage.removeItem(tokenKey(token));
  } catch {
    /* private mode: the session lives in memory only */
  }
}

const NOTICES = {
  OWNER_INACTIVE: { icon: '🕊', tone: 'calm' },
  REVOKED: { icon: '⛔', tone: 'calm' },
  EXPIRED: { icon: '⏳', tone: 'calm' },
  OWNER_NO_ACCESS: { icon: '🔒', tone: 'calm' },
  GONE: { icon: '🧭', tone: 'calm' },
  UNAVAILABLE: { icon: '📡', tone: 'warn' },
  LINKS_DISABLED: { icon: '🔕', tone: 'calm' },
  UPLOADS_DISABLED: { icon: '📭', tone: 'calm' },
  NOT_FOUND: { icon: '🔍', tone: 'calm' },
};

function Notice({ code, info, children }) {
  const { t, locale } = useLocale();
  const meta = NOTICES[code] || NOTICES.NOT_FOUND;
  const key = NOTICES[code] ? code : 'NOT_FOUND';
  return (
    <div className={`dv-notice is-${meta.tone}`}>
      <div className="dv-notice__icon">{meta.icon}</div>
      <span className="dv-notice__eyebrow">{info?.name || t('drive.public.eyebrow')}</span>
      <h1>{t(`drive.public.${key}.title`)}</h1>
      <p>{t(`drive.public.${key}.text`, { date: info?.expiredAt ? formatDateTime(info.expiredAt, locale) : '' })}</p>
      {t(`drive.public.${key}.hint`) !== `drive.public.${key}.hint` && <p className="dv-notice__hint">{t(`drive.public.${key}.hint`)}</p>}
      {children}
    </div>
  );
}

const joinPath = (...parts) => parts.filter(Boolean).join('/');
const extOf = (name) => (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

/** "Who are you?" — name (and e-mail) the author asked for; shown next to every file. */
function IntroduceForm({ link, visitor, onSubmit, compact }) {
  const { t } = useLocale();
  const [name, setName] = useState(visitor?.name || '');
  const [email, setEmail] = useState(visitor?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), email: email.trim() || undefined });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const ready = name.trim().length >= 2 && (!link.requireEmail || email.trim());
  return (
    <form
      className={`dv-intro${compact ? ' is-compact' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) submit();
      }}
    >
      {!compact && (
        <div className="dv-intro__lead">
          <span className="dv-intro__icon" aria-hidden="true"><UserOutlined /></span>
          <div>
            <strong>{t('drive.public.introTitle')}</strong>
            <span>{t('drive.public.introText', { name: link.owner || '' })}</span>
          </div>
        </div>
      )}
      <div className="dv-intro__fields">
        <Input size="large" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={t('drive.public.yourName')} aria-label={t('drive.public.yourName')} autoComplete="name" />
        {(link.requireEmail || compact) && (
          <Input size="large" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} placeholder={link.requireEmail ? t('drive.public.yourEmail') : t('drive.public.yourEmailOptional')} aria-label={t('drive.public.yourEmail')} autoComplete="email" />
        )}
        <Button type="primary" size="large" htmlType="submit" loading={busy} disabled={!ready}>
          {t('drive.public.introGo')}
        </Button>
      </div>
      {error && <div className="signin__error">{error}</div>}
    </form>
  );
}

/** Deleting cannot be undone on a file server: the visitor confirms explicitly. */
function DeleteDialog({ state, onClose, onConfirm }) {
  const { t } = useLocale();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSure(false), [state]);
  if (!state) return null;
  const names = state.entries.map((entry) => entry.name);
  return (
    <Modal
      open
      onCancel={onClose}
      title={t('drive.public.deleteTitle', { count: names.length })}
      okText={t('common.delete')}
      okButtonProps={{ danger: true, disabled: !sure, loading: busy }}
      cancelText={t('common.cancel')}
      onOk={async () => {
        setBusy(true);
        try {
          await onConfirm(state.entries);
        } finally {
          setBusy(false);
        }
      }}
      width={480}
    >
      <ul className="dv-conflict__names">
        {names.slice(0, 8).map((name) => (
          <li key={name}>{name}</li>
        ))}
        {names.length > 8 && <li>… +{names.length - 8}</li>}
      </ul>
      <div className="dv-danger">
        <strong>{t('drive.public.deleteWarnTitle')}</strong>
        <span>{t('drive.public.deleteWarn')}</span>
      </div>
      <Checkbox checked={sure} onChange={(event) => setSure(event.target.checked)} data-testid="delete-sure">
        {t('drive.public.deleteSure')}
      </Checkbox>
    </Modal>
  );
}

function NameDialog({ state, onClose }) {
  const { t } = useLocale();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    if (!state) return;
    setValue(state.value || '');
    // Select the name without its extension, like a file manager.
    setTimeout(() => {
      const el = input.current?.input;
      if (!el) return;
      el.focus();
      const dot = state.isFile ? (state.value || '').lastIndexOf('.') : -1;
      el.setSelectionRange(0, dot > 0 ? dot : (state.value || '').length);
    }, 60);
  }, [state]);
  if (!state) return null;
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await state.onSubmit(value.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onCancel={onClose} title={state.title} okText={state.ok} cancelText={t('common.cancel')} onOk={submit} okButtonProps={{ loading: busy, disabled: !value.trim() }} width={440} destroyOnHidden>
      <Input ref={input} value={value} onChange={(event) => setValue(event.target.value)} onPressEnter={submit} maxLength={255} />
    </Modal>
  );
}

function ConflictDialog({ state, onResolve }) {
  const { t } = useLocale();
  const [choice, setChoice] = useState('rename');
  useEffect(() => setChoice('rename'), [state]);
  if (!state) return null;
  return (
    <Modal open title={t('drive.conflictTitle', { n: state.names.length })} onCancel={() => onResolve(null)} onOk={() => onResolve(choice)} okText={t('drive.continue')} cancelText={t('common.cancel')} width={520}>
      <p>{t('drive.conflictText')}</p>
      <ul className="dv-conflict__names">
        {state.names.slice(0, 8).map((name) => (
          <li key={name}>{name}</li>
        ))}
        {state.names.length > 8 && <li>… +{state.names.length - 8}</li>}
      </ul>
      <Radio.Group value={choice} onChange={(event) => setChoice(event.target.value)} className="dv-conflict__choices">
        {state.canReplace && (
          <Radio value="replace">
            <strong>{t('drive.conflictReplace')}</strong>
            <span>{t('drive.conflictReplaceText')}</span>
          </Radio>
        )}
        <Radio value="rename">
          <strong>{t('drive.conflictKeep')}</strong>
          <span>{t('drive.public.conflictKeepText')}</span>
        </Radio>
        <Radio value="skip">
          <strong>{t('drive.conflictSkip')}</strong>
          <span>{t('drive.conflictSkipText')}</span>
        </Radio>
      </Radio.Group>
    </Modal>
  );
}

/** /d/:token — a file or folder from the company's file servers, shared by link. */
export default function PublicDrive() {
  const { token } = useParams();
  const location = useLocation();
  // "Open as recipient" from the share dialog: the author looking, not a view.
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [visitor, setVisitor] = useState(() => readVisitor(token));
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [state, setState] = useState({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [mine, setMine] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [introduce, setIntroduce] = useState(null);
  const [writeProblem, setWriteProblem] = useState(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const replaceInput = useRef(null);
  const replaceTarget = useRef(null);
  const visitorRef = useRef(visitor);
  visitorRef.current = visitor;

  const load = useCallback(() => {
    publicDriveApi
      .open(token, { path, visitor, preview, repeat: viewCounted('drive', token) })
      .then((res) => {
        if (!path) markViewCounted('drive', token);
        // A session token from before read tokens existed is swapped for a new one (same session and name).
        if (res.data.visitorToken) {
          storeVisitor(token, res.data.visitorToken);
          visitorRef.current = res.data.visitorToken;
          setVisitor(res.data.visitorToken);
        }
        setData(res.data);
        setState({ kind: 'ready' });
      })
      .catch((err) => {
        const body = err?.response?.data || {};
        setState({ kind: 'error', code: body.code || 'UNAVAILABLE', info: body.info });
      });
  }, [token, path, visitor, preview]);

  useEffect(() => {
    load();
  }, [load, user]);

  const link = data?.link;
  const perms = useMemo(() => link?.permissions || [], [link]);
  const can = (perm) => perms.includes(perm);
  const uploadOnly = Boolean(data?.uploadOnly);
  const visitorInfo = data?.visitor || null;

  const refreshMine = useCallback(() => {
    if (!visitorRef.current) return;
    publicDriveApi
      .mine(token, visitorRef.current)
      .then((res) => setMine(res.data.uploads || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (uploadOnly) refreshMine();
  }, [uploadOnly, refreshMine, visitor]);

  const setSession = (value) => {
    storeVisitor(token, value);
    visitorRef.current = value;
    setVisitor(value);
  };

  /** The visitor session a change needs: opened on first use, with the name when the author asked for it. */
  const ensureSession = useCallback(async () => {
    let current = visitorRef.current;
    if (!current) {
      const res = await publicDriveApi.unlock(token, {});
      current = res.data.token;
      storeVisitor(token, current);
      visitorRef.current = current;
    }
    if (link?.requireName && !(visitorInfo?.name)) {
      const named = await new Promise((resolve) => setIntroduce({ resolve }));
      if (!named) throw Object.assign(new Error('cancelled'), { cancelled: true });
      current = named;
    }
    if (current !== visitor) setVisitor(current);
    return current;
  }, [token, link, visitorInfo, visitor]);

  const sayIntroduce = async (body) => {
    try {
      const res = await publicDriveApi.unlock(token, body, visitorRef.current);
      setSession(res.data.token);
      setData((prev) => (prev ? { ...prev, visitor: res.data.visitor } : prev));
      return res.data.token;
    } catch (err) {
      throw new Error(driveError(err, t));
    }
  };

  const describe = useCallback((err) => {
    const code = err?.response?.data?.code || err?.code;
    if (code === 'FILE_TOO_LARGE') return t('drive.errors.LINK_FILE_TOO_LARGE', { mb: err?.response?.data?.info?.maxMb || link?.limits?.maxFileMb || '' });
    if (code === 'EXT_NOT_ALLOWED') return t('drive.errors.EXT_NOT_ALLOWED', { list: (link?.limits?.allowedExts || []).map((ext) => `.${ext}`).join(', ') });
    return driveError(err, t);
  }, [t, link]);

  /** A change failed: some failures mean the page itself must change. */
  const writeFailed = useCallback((err) => {
    const code = err?.response?.data?.code;
    if (code === 'SESSION_REQUIRED') {
      setSession('');
      load();
    } else if (code === 'UNAVAILABLE' || code === 'WRITE_DENIED') {
      setWriteProblem(code);
    } else if (['REVOKED', 'EXPIRED', 'OWNER_INACTIVE', 'LINKS_DISABLED', 'UPLOADS_DISABLED', 'PASSWORD_REQUIRED'].includes(code)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const queue = useVisitorQueue(
    async (item, { signal, onProgress }) => {
      try {
        const res = item.kind === 'replace'
          ? await publicDriveApi.replace(token, visitorRef.current, item.target, item.file, { signal, onProgress })
          : await publicDriveApi.upload(token, visitorRef.current, item.folder, item.file, { conflict: item.conflict, signal, onProgress });
        return res.data;
      } catch (err) {
        if (!signal.aborted) writeFailed(err);
        throw err;
      }
    },
    {
      onSettled: () => {
        if (uploadOnly) refreshMine();
        else load();
      },
    }
  );

  /** Refusals the page can tell before sending (size, file type). */
  const precheck = (file, { anyType = false } = {}) => {
    const limits = link?.limits || {};
    if (limits.maxFileMb && file.size > limits.maxFileMb * 1024 * 1024) return { response: { data: { code: 'FILE_TOO_LARGE', info: { maxMb: limits.maxFileMb } } } };
    if (!anyType && limits.allowedExts?.length && !limits.allowedExts.includes(extOf(file.name))) return { response: { data: { code: 'EXT_NOT_ALLOWED' } } };
    return null;
  };

  const startFiles = async (files, folder = path) => {
    if (!files.length) return;
    try {
      await ensureSession();
    } catch (err) {
      if (!err.cancelled) message.error(describe(err));
      return;
    }
    const send = (mode, list) =>
      queue.add(list.map((file) => ({ file, folder: uploadOnly ? '' : folder, conflict: mode, error: precheck(file) })));
    if (uploadOnly || folder !== path) {
      send('rename', files);
      return;
    }
    const existing = new Set((data?.entries || []).map((entry) => entry.name.toLowerCase()));
    const clashes = files.filter((file) => existing.has(file.name.toLowerCase()));
    if (!clashes.length) {
      send('fail', files);
      return;
    }
    setConflict({
      names: clashes.map((file) => file.name),
      canReplace: can('replace'),
      resolve: (choice) => {
        setConflict(null);
        if (!choice) return;
        if (choice === 'skip') send('fail', files.filter((file) => !existing.has(file.name.toLowerCase())));
        else send(choice, files);
      },
    });
  };

  /** Folder uploads: the folders first (one request per 500), then every file into its place. */
  const startFolder = async (scan) => {
    if (!scan.files.length && !scan.dirs.length) {
      message.info(t('folderUpload.empty'));
      return;
    }
    if (!(can('mkdir') && can('upload'))) {
      const flat = scan.files.filter((item) => !item.dir).map((item) => item.file);
      message.info(t('drive.public.noFolders'));
      startFiles(flat);
      return;
    }
    let session;
    try {
      session = await ensureSession();
    } catch (err) {
      if (!err.cancelled) message.error(describe(err));
      return;
    }
    const made = new Map();
    try {
      for (let index = 0; index < scan.dirs.length; index += 500) {
        const chunk = scan.dirs.slice(index, index + 500);
        const res = await publicDriveApi.folderTree(token, session, path, chunk);
        res.data.folders.forEach((item, i) => made.set(chunk[i], item));
      }
    } catch (err) {
      writeFailed(err);
      message.error(describe(err));
      return;
    }
    const existing = new Set((data?.entries || []).map((entry) => entry.name.toLowerCase()));
    const merged = scan.tops.some((name) => existing.has(name.toLowerCase()));
    queue.add(
      scan.files.map(({ file, dir }) => {
        const folder = dir ? made.get(dir) : { path, error: null };
        const failed = !folder || folder.error;
        return {
          file,
          path: dir ? `${dir}/${file.name}` : file.name,
          folder: folder?.path ?? path,
          conflict: merged || !dir ? 'rename' : 'fail',
          error: failed ? { response: { data: { code: folder?.error || 'NOT_FOUND' } } } : precheck(file),
        };
      })
    );
  };

  const folderProblem = (err) => {
    if (err instanceof FolderUploadError) message.error(t(err.code === 'TOO_DEEP' ? 'folderUpload.tooDeep' : 'folderUpload.tooMany', err.info));
    else message.error(t('folderUpload.readFailed', { error: err?.message || '' }));
  };

  const onDrop = async (dataTransfer) => {
    const drop = collectDrop(dataTransfer);
    if (drop.hasFolders === false) {
      startFiles(drop.plain.filter((file) => file.size > 0 || file.type));
      return;
    }
    try {
      const scan = await drop.scan();
      if (scan.hasFolders) startFolder(scan);
      else startFiles(scan.files.map((item) => item.file));
    } catch (err) {
      folderProblem(err);
    }
  };

  const dropZone = can('upload')
    ? {
        onDragOver: (event) => {
          if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        },
        onDrop: (event) => {
          event.preventDefault();
          setDragging(false);
          onDrop(event.dataTransfer);
        },
      }
    : {};

  // ── Item actions ──
  const runChange = async (action, success) => {
    try {
      const session = await ensureSession();
      await action(session);
      if (success) message.success(success);
      load();
    } catch (err) {
      if (err.cancelled) return;
      writeFailed(err);
      message.error(describe(err));
    }
  };

  const askRename = (entry) =>
    setNameDialog({
      title: t('drive.public.renameTitle'),
      ok: t('drive.rename'),
      value: entry.name,
      isFile: !entry.dir,
      onSubmit: (name) =>
        runChange((session) => publicDriveApi.rename(token, session, entry.path, name)).then(() => setNameDialog(null)),
    });

  const askFolder = () =>
    setNameDialog({
      title: t('files.newFolder'),
      ok: t('common.create'),
      value: t('files.newFolderName'),
      onSubmit: (name) => runChange((session) => publicDriveApi.mkdir(token, session, path, name)).then(() => setNameDialog(null)),
    });

  const askReplace = (entry) => {
    replaceTarget.current = entry;
    replaceInput.current?.click();
  };

  const onReplacePicked = async (file) => {
    const entry = replaceTarget.current;
    if (!file || !entry) return;
    try {
      await ensureSession();
    } catch (err) {
      if (!err.cancelled) message.error(describe(err));
      return;
    }
    queue.add([{ file, kind: 'replace', target: entry.path, path: entry.name, error: precheck(file, { anyType: true }) }]);
  };

  const menu = (entry) => {
    const items = [];
    if (!entry.dir && can('download')) items.push({ key: 'download', icon: <DownloadOutlined />, label: <a href={src.file(entry, { download: true })}>{t('kb.download')}</a> });
    if (!entry.dir && can('replace')) items.push({ key: 'replace', icon: <SwapOutlined />, label: t('drive.public.replace'), onClick: () => askReplace(entry) });
    if (can('rename')) items.push({ key: 'rename', icon: <EditOutlined />, label: t('drive.rename'), onClick: () => askRename(entry) });
    if (can('delete')) {
      if (items.length) items.push({ type: 'divider' });
      items.push({ key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => setDeleting({ entries: [entry] }) });
    }
    return items;
  };

  const unlock = async () => {
    setError('');
    try {
      const res = await publicDriveApi.unlock(token, { password });
      setSession(res.data.token || '');
    } catch (err) {
      const code = err?.response?.data?.code;
      setError(t(`kb.public.err_${code || 'generic'}`));
      setPassword('');
    }
  };

  /** Where a link of the README goes: a folder or file of this link (never above it). */
  const readmeLink = (target, entries) => {
    const to = joinRelative(path, target);
    if (to === null) return null;
    const here = entries.find((item) => item.path === to);
    if (here) return { open: () => (here.dir ? setPath(here.path) : setViewing(here)) };
    if (target.dir) return { open: () => setPath(to) };
    const parent = to.split('/').slice(0, -1).join('/');
    const name = to.split('/').pop();
    return {
      open: () =>
        publicDriveApi
          .open(token, { path: parent, visitor: visitorRef.current, preview, repeat: true })
          .then((res) => {
            const found = (res.data.entries || []).find((item) => item.name === name);
            if (!found) throw new Error('not found');
            if (found.dir) setPath(found.path);
            else setViewing(found);
          })
          .catch(() => message.info(t('readme.notFound'))),
    };
  };

  // File addresses carry the read token only (the session token never goes into a URL).
  const src = useMemo(() => linkSource(token, data?.readToken || '', link?.allowDownload), [token, data, link]);

  const pickers = (
    <>
      <input ref={fileInput} type="file" multiple hidden data-testid="visitor-file-input" onChange={(event) => { const files = [...event.target.files]; event.target.value = ''; startFiles(files); }} />
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
          if (!files.length) return;
          try {
            startFolder(collectPicked(files));
          } catch (err) {
            folderProblem(err);
          }
        }}
      />
      <input ref={replaceInput} type="file" hidden data-testid="visitor-replace-input" onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; onReplacePicked(file); }} />
    </>
  );

  const limitsLine = link?.limits ? (
    <span className="dv-limits">
      {t('drive.public.maxFile', { size: formatBytes(link.limits.maxFileMb * 1024 * 1024) })}
      {link.limits.allowedExts?.length > 0 && ` · ${t('drive.public.onlyTypes', { list: link.limits.allowedExts.map((ext) => `.${ext}`).join(', ') })}`}
      {link.limits.quotaLeft !== null && link.limits.quotaLeft !== undefined && ` · ${t('drive.public.quotaLeft', { size: formatBytes(link.limits.quotaLeft) })}`}
    </span>
  ) : null;

  let body;
  if (state.kind === 'loading' || (state.kind === 'ready' && !data)) {
    body = <Skeleton active paragraph={{ rows: 8 }} />;
  } else if (state.kind === 'error' && state.code === 'PASSWORD_REQUIRED') {
    body = (
      <div className="dv-notice">
        <div className="dv-notice__icon">🔐</div>
        <span className="dv-notice__eyebrow">{t('drive.public.eyebrow')}</span>
        <h1>{t('kb.public.protected')}</h1>
        <p>{t('kb.public.passwordLead')}</p>
        <div className="share-gate">
          <Input.Password size="large" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={unlock} placeholder={t('kb.share.password')} status={error ? 'error' : undefined} />
          {error && <div className="signin__error">{error}</div>}
          <Button type="primary" size="large" block disabled={!password} onClick={unlock}>{t('kb.public.open')}</Button>
        </div>
      </div>
    );
  } else if (state.kind === 'error' && state.code === 'SIGN_IN_REQUIRED') {
    body = (
      <div className="dv-notice">
        <div className="dv-notice__icon">🏢</div>
        <span className="dv-notice__eyebrow">{t('drive.public.eyebrow')}</span>
        <h1>{t('drive.public.SIGN_IN_REQUIRED.title')}</h1>
        <p>{t('drive.public.SIGN_IN_REQUIRED.text', { app: settings?.appName || '' })}</p>
        <Link to={`/login?next=${encodeURIComponent(`/d/${token}`)}`}>
          <Button type="primary" size="large">{t('drive.public.signIn')}</Button>
        </Link>
      </div>
    );
  } else if (state.kind === 'error') {
    body = <Notice code={state.code} info={state.info} />;
  } else if (uploadOnly) {
    // ── A file request: send files, see only one's own ──
    const needsIntro = link.requireName && !visitorInfo?.name;
    const recent = queue.items.filter((item) => item.status !== 'done');
    body = (
      <div className="dv-request" {...dropZone}>
        <header className="dv-request__hero">
          <span className="dv-request__badge" aria-hidden="true"><CloudUploadOutlined /></span>
          <span className="share-hero__eyebrow">{link.owner ? t('drive.public.requestFrom', { name: link.owner }) : t('drive.public.eyebrow')}</span>
          <h1>{link.title || t('drive.public.requestTitle', { name: link.owner || link.name })}</h1>
          {link.note && <p className="dv-request__note">{link.note}</p>}
          <span className="dv-request__privacy">🔒 {t('drive.public.requestPrivacy', { name: link.owner || '' })}</span>
        </header>
        {needsIntro ? (
          <IntroduceForm link={link} visitor={visitorInfo} onSubmit={sayIntroduce} />
        ) : (
          <>
            {visitorInfo?.name && (
              <div className="dv-me">
                <UserOutlined /> {t('drive.public.youAre', { name: visitorInfo.name })}
                {visitorInfo.email && <em>{visitorInfo.email}</em>}
              </div>
            )}
            <button type="button" className={`dv-dropzone${dragging ? ' is-over' : ''}`} onClick={() => fileInput.current?.click()} data-testid="visitor-dropzone">
              <span className="dv-dropzone__icon" aria-hidden="true"><CloudUploadOutlined /></span>
              <strong>{t('drive.public.dropTitle')}</strong>
              <span>{t('drive.public.dropOr')}</span>
              {limitsLine}
            </button>
          </>
        )}
        <VisitorUploadList queue={{ ...queue, items: recent }} describe={describe} />
        <section className="dv-mine" data-testid="visitor-mine">
          <h2>{t('drive.public.mineTitle')}</h2>
          {!mine.length ? (
            <div className="dv-mine__empty">{t('drive.public.mineEmpty')}</div>
          ) : (
            <ul>
              {mine.map((item) => (
                <li key={`${item.path}-${item.at}`}>
                  <EntryIcon entry={{ dir: false, ext: extOf(item.name) }} size={30} />
                  <span className="dv-mine__name" title={item.path}>{item.name}</span>
                  <span className="dv-mine__meta">{formatBytes(item.size)} · {formatRelative(item.at, locale)}</span>
                  <span className="dv-mine__ok" aria-label={t('drive.public.done')}>✓</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dv-mine__hint">{t('drive.public.mineHint')}</p>
        </section>
        {dragging && <div className="kb-drop"><div>{t('drive.public.dropHere')}</div></div>}
      </div>
    );
  } else {
    const { entries = [], crumbs = [] } = data;
    const entry = data.entry;
    const isFile = link.kind === 'file';
    const writes = perms.some((perm) => !['view', 'download'].includes(perm));
    // The folder's README.md, shown above the listing (only to visitors who can see the folder).
    const readme = !isFile && can('view') ? pickReadme(entries) : null;
    body = (
      <div className="kb-page dv-public" {...(isFile ? {} : dropZone)}>
        <header className="share-hero dv-public__hero">
          <EntryIcon entry={isFile ? entry : { dir: true }} size={56} />
          <div className="dv-public__intro">
            <span className="share-hero__eyebrow">{link.owner ? t('drive.public.sharedBy', { name: link.owner }) : t('kb.public.sharedWithYou')}</span>
            <h1>{link.title || (isFile ? entry.name : data.name)}</h1>
            {link.note && <p className="dv-public__note">{link.note}</p>}
            <p>
              {isFile ? formatBytes(entry.size) : t('files.itemsN', { n: entries.length })}
              {link.expiresAt && ` · ${t('kb.public.until', { date: formatDateTime(link.expiresAt, locale) })}`}
              {link.audience === 'employees' && ` · 🏢 ${t('drive.audience.employees')}`}
            </p>
            <div className="dv-public__can" data-testid="visitor-can">
              <span>{t('drive.public.youCan', { what: permissionSentence(perms, t) })}</span>
              <PermissionChips perms={perms} compact />
            </div>
          </div>
          <div className="dv-public__actions">
            {can('upload') && !isFile && (
              <Button type="primary" size="large" icon={<CloudUploadOutlined />} onClick={() => fileInput.current?.click()} data-testid="visitor-upload">
                {t('files.upload')}
              </Button>
            )}
            {can('upload') && can('mkdir') && !isFile && canPickFolders() && (
              <Button size="large" onClick={() => folderInput.current?.click()}>📁 {t('folderUpload.uploadFolder')}</Button>
            )}
            {can('mkdir') && !isFile && (
              <Button size="large" icon={<FolderAddOutlined />} onClick={askFolder}>{t('files.newFolder')}</Button>
            )}
            {isFile && can('replace') && (
              <Button size="large" icon={<SwapOutlined />} onClick={() => askReplace({ ...entry, path: '' })}>{t('drive.public.replace')}</Button>
            )}
            {link.allowDownload && (
              <Button type={can('upload') && !isFile ? 'default' : 'primary'} size="large" icon={<DownloadOutlined />} href={isFile ? src.file(entry, { download: true }) : src.zip(path)}>
                {isFile ? t('kb.download') : t('drive.downloadZipShort')}
              </Button>
            )}
          </div>
        </header>
        {writeProblem && (
          <div className={`dv-writeproblem is-${writeProblem}`} role="alert">
            <strong>{t(`drive.public.problem.${writeProblem}.title`)}</strong>
            <span>{t(`drive.public.problem.${writeProblem}.text`, { name: link.owner || '' })}</span>
            <button type="button" onClick={() => setWriteProblem(null)} aria-label="✕">✕</button>
          </div>
        )}
        {writes && link.requireName && visitorInfo?.name && (
          <div className="dv-me">
            <UserOutlined /> {t('drive.public.youAre', { name: visitorInfo.name })}
          </div>
        )}
        {!isFile && (path || crumbs.length > 0) && (
          <nav className="kb-crumbs">
            <button type="button" className="fs-crumb-btn" onClick={() => setPath('')}>{link.title || link.name}</button>
            {crumbs.map((crumb, index) => (
              <span key={crumb.path}>
                <span className="kb-crumbs__sep">/</span>
                {index === crumbs.length - 1 ? <strong>{crumb.name}</strong> : <button type="button" className="fs-crumb-btn" onClick={() => setPath(crumb.path)}>{crumb.name}</button>}
              </span>
            ))}
          </nav>
        )}
        <VisitorUploadList queue={queue} describe={describe} />
        {isFile ? (
          <div className="kb-viewer kb-viewer--file dv-public__viewer">
            {CAD.has(entry.ext) ? (
              <Suspense fallback={<div className="viewer-loading"><Spin /></div>}>
                <CadViewer url={src.cad(entry)} name={entry.name} downloadUrl={link.allowDownload ? src.file(entry, { download: true }) : null} />
              </Suspense>
            ) : (
              <DocumentViewer item={asViewerItem(entry)} src={src} conversion={data.conversion} />
            )}
          </div>
        ) : (
          <>
            {readme && (
              <ReadmeCard
                key={`${token}:${path}`}
                file={{ name: readme.name, size: readme.size, modified: readme.mtime }}
                url={src.file(readme)}
                version={readme.mtime || ''}
                folderKey={`d:${token}:${path}`}
                resolveLink={(target) => readmeLink(target, entries)}
                resolveImage={(target) => {
                  const to = joinRelative(path, target);
                  return to ? src.file({ path: to }) : null;
                }}
                onOpen={() => setViewing(readme)}
                downloadUrl={link.allowDownload ? src.file(readme, { download: true }) : null}
              />
            )}
            {can('upload') && <p className="dv-public__drophint">⤒ {t('drive.public.dropHint')}{limitsLine && <> · {limitsLine}</>}</p>}
            <EntryList
              entries={entries}
              view="grid"
              src={src}
              menu={writes || can('download') ? menu : undefined}
              onOpen={(item) => (item.dir ? setPath(item.path) : setViewing(item))}
              emptyText={can('upload') ? t('drive.public.emptyUpload') : t('drive.empty')}
              emptyIcon={can('upload') ? 'box' : 'folder'}
            />
          </>
        )}
        {viewing && (
          <DriveViewer
            entry={viewing}
            siblings={entries}
            src={src}
            conversion={data.conversion}
            onNavigate={(next) => next && setViewing(entries.find((item) => item.path === next.path))}
            onClose={() => setViewing(null)}
          />
        )}
        {dragging && <div className="kb-drop"><div>{t('files.dropHere', { name: data.name || link.name })}</div></div>}
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
      <main className="share-page__main">{body}</main>
      {state.kind === 'ready' && pickers}
      <ConflictDialog state={conflict} onResolve={(choice) => conflict?.resolve(choice)} />
      <NameDialog state={nameDialog} onClose={() => setNameDialog(null)} />
      <DeleteDialog
        state={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(entries) =>
          runChange((session) => publicDriveApi.remove(token, session, entries.map((item) => item.path)), t('drive.public.deleted', { n: entries.length })).then(() => setDeleting(null))
        }
      />
      <Modal open={Boolean(introduce)} footer={null} onCancel={() => { introduce?.resolve(null); setIntroduce(null); }} title={t('drive.public.introTitle')} width={460} destroyOnHidden>
        {introduce && link && (
          <>
            <p className="dv-intro__modal-lead">{t('drive.public.introText', { name: link.owner || '' })}</p>
            <IntroduceForm
              compact
              link={link}
              visitor={visitorInfo}
              onSubmit={async (body) => {
                const next = await sayIntroduce(body);
                introduce.resolve(next);
                setIntroduce(null);
              }}
            />
          </>
        )}
      </Modal>
      <footer className="dv-public__foot">🛡 {t('drive.public.footer', { app: settings?.appName || '' })}</footer>
    </div>
  );
}
