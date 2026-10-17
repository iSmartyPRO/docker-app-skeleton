import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Avatar, Button, Result, Spin, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { errorMessage } from '../../lib/errors';
import { FileIcon } from '../kb/components/Icons';
import './office.css';
import { localeTag } from '../../i18n/languages';

/*
 * Full-screen online editor (Collabora Online over WOPI) for Files and Drive.
 *
 * `open({ mode, force, lang, dark })` asks the module for an editor session:
 *   { url, accessToken, accessTokenTtl, mode, canWrite, lockedBy, externalLock, file }
 * The frame is loaded by posting a hidden form (access_token, access_token_ttl)
 * into the iframe, as the WOPI spec asks, so the token never appears in an
 * address. Collabora's postMessage events drive the top bar: loading,
 * "Saved · 12:03", who else is in the document, close.
 */

const LOAD_TIMEOUT_MS = 30000;

const time = (date, locale) => date.toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' });

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function OfficeEditor({ open, name, ext, where, backTo, downloadUrl, previewTo, notice }) {
  const { t, locale } = useLocale();
  const { mode: theme } = useThemeMode();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [request, setRequest] = useState({ mode: 'edit', force: false, n: 0 });
  const [phase, setPhase] = useState('loading'); // loading | ready | slow | closed
  const [status, setStatus] = useState({ modified: false, savedAt: null, saving: false, failed: false });
  const [views, setViews] = useState([]);
  const frame = useRef(null);
  const form = useRef(null);
  const pendingClose = useRef(null);
  const frameName = useMemo(() => `office-frame-${Math.random().toString(36).slice(2)}`, []);
  const dark = theme === 'dark';

  // 1. Ask the module for a session (again when the person switches mode).
  useEffect(() => {
    let alive = true;
    setSession(null);
    setError(null);
    setPhase('loading');
    setViews([]);
    setStatus({ modified: false, savedAt: null, saving: false, failed: false });
    open({ mode: request.mode, force: request.force, lang: locale, dark })
      .then((res) => alive && setSession(res.data))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
    // The theme and language are read once per session; changing them mid-edit would reload the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // 2. Post the form into the frame once it is on screen.
  useEffect(() => {
    if (session && form.current) form.current.submit();
  }, [session]);

  // 3. A frame that never reports back: the server is unreachable or does not trust this portal.
  useEffect(() => {
    if (!session || phase !== 'loading') return undefined;
    const timer = setTimeout(() => setPhase((current) => (current === 'loading' ? 'slow' : current)), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session, phase]);

  const post = useCallback(
    (messageId, values = {}) => {
      if (!session || !frame.current?.contentWindow) return;
      frame.current.contentWindow.postMessage(JSON.stringify({ MessageId: messageId, SendTime: Date.now(), Values: values }), session.editorOrigin);
    },
    [session]
  );

  const finishClose = useCallback(() => {
    if (pendingClose.current) {
      const go = pendingClose.current;
      pendingClose.current = null;
      go();
    }
  }, []);

  // 4. Messages from Collabora.
  useEffect(() => {
    if (!session) return undefined;
    const onMessage = (event) => {
      if (event.origin !== session.editorOrigin || event.source !== frame.current?.contentWindow) return;
      let message;
      try {
        message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      const values = message?.Values || {};
      switch (message?.MessageId) {
        case 'App_LoadingStatus':
          if (values.Status === 'Frame_Ready') post('Host_PostmessageReady');
          if (values.Status === 'Document_Loaded') setPhase('ready');
          if (values.Status === 'Failed') setPhase('slow');
          break;
        case 'Doc_ModifiedStatus':
          setStatus((prev) => ({ ...prev, modified: Boolean(values.Modified), ...(values.Modified ? {} : { savedAt: prev.modified ? new Date() : prev.savedAt, saving: false }) }));
          break;
        case 'Action_Save_Resp':
          setStatus((prev) => ({ ...prev, saving: false, failed: values.success === false, ...(values.success !== false ? { savedAt: new Date(), modified: false } : {}) }));
          if (pendingClose.current) finishClose();
          break;
        case 'View_Added':
          setViews((list) => [...list.filter((view) => view.ViewId !== values.ViewId), values]);
          break;
        case 'View_Removed':
          setViews((list) => list.filter((view) => view.ViewId !== values.ViewId));
          break;
        case 'Get_Views_Resp':
          if (Array.isArray(values)) setViews(values);
          break;
        case 'UI_Close':
        case 'close':
          backTo?.go?.();
          break;
        case 'Session_Closed':
          setPhase('closed');
          break;
        default:
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [session, post, backTo, finishClose]);

  // Ask for the people in the document once it is loaded.
  useEffect(() => {
    if (phase === 'ready') post('Get_Views');
  }, [phase, post]);

  const save = () => {
    setStatus((prev) => ({ ...prev, saving: true }));
    post('Action_Save', { DontTerminateEdit: true, DontSaveIfUnmodified: true, Notify: true });
  };

  /** Close: save what is unsaved first (a few seconds at most), then leave. */
  const close = () => {
    if (!backTo?.go) return;
    if (phase === 'ready' && status.modified) {
      pendingClose.current = backTo.go;
      save();
      setTimeout(() => pendingClose.current && finishClose(), 5000);
      return;
    }
    backTo.go();
  };

  const statusLabel = (() => {
    if (!session || phase === 'loading') return t('office.status.loading');
    if (session.mode === 'view') return t('office.status.readOnly');
    if (status.failed) return t('office.status.failed');
    if (status.saving) return t('office.status.saving');
    if (status.modified) return t('office.status.modified');
    if (status.savedAt) return t('office.status.savedAt', { time: time(status.savedAt, locale) });
    return t('office.status.upToDate');
  })();
  const statusTone = status.failed ? 'error' : status.modified || status.saving ? 'busy' : 'ok';
  const others = views.filter((view) => !view.IsCurrentView);

  const fileIcon = <FileIcon item={{ kind: 'file', file: { ext } }} size={28} />;
  const head = (
    <header className="oe-bar">
      <Tooltip title={backTo?.label ? t('office.backTo', { name: backTo.label }) : t('common.back')}>
        <button type="button" className="oe-back" onClick={close} aria-label={t('common.back')}>
          <ArrowLeftOutlined aria-hidden />
        </button>
      </Tooltip>
      {fileIcon}
      <div className="oe-title">
        <strong title={name}>{name || '…'}</strong>
        <span className="oe-sub">
          {where && <span className="oe-where">{where}</span>}
          <span className={`oe-status is-${statusTone}`} role="status" aria-live="polite">
            <i aria-hidden />
            {statusLabel}
          </span>
        </span>
      </div>
      {session && (
        <Tag className="oe-mode" bordered={false} color={session.mode === 'edit' ? 'blue' : 'default'}>
          {session.mode === 'edit' ? t('office.modeEdit') : t('office.modeView')}
        </Tag>
      )}
      {others.length > 0 && (
        <Avatar.Group max={{ count: 3 }} size={28} className="oe-people">
          {others.map((view) => (
            <Tooltip key={view.ViewId} title={view.UserName}>
              <Avatar size={28} style={{ background: view.Color ? `#${Number(view.Color).toString(16).padStart(6, '0')}` : undefined }}>
                {initials(view.UserName)}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      )}
      <div className="oe-actions">
        {session?.mode === 'view' && session?.canWrite && (
          <Button type="primary" icon={<EditOutlined />} onClick={() => setRequest({ mode: 'edit', force: true, n: request.n + 1 })}>
            <span className="oe-label">{t('office.editInstead')}</span>
          </Button>
        )}
        {session?.mode === 'edit' && phase === 'ready' && (
          <Tooltip title={t('office.saveNow')}>
            <Button icon={<CheckOutlined />} onClick={save} loading={status.saving} disabled={!status.modified && !status.failed}>
              <span className="oe-label">{t('office.save')}</span>
            </Button>
          </Tooltip>
        )}
        {downloadUrl && (
          <Tooltip title={t('office.downloadHint')}>
            <Button href={downloadUrl} icon={<DownloadOutlined />} aria-label={t('kb.download')}>
              <span className="oe-label">{t('kb.download')}</span>
            </Button>
          </Tooltip>
        )}
        <Button type="text" className="oe-close" icon={<CloseOutlined />} onClick={close} aria-label={t('common.close')}>
          <span className="oe-label">{t('common.close')}</span>
        </Button>
      </div>
    </header>
  );

  if (error) {
    const code = error?.response?.data?.code;
    const known = ['EDITOR_DISABLED', 'EDITOR_UNREACHABLE', 'EDITOR_TYPE'].includes(code);
    return (
      <div className="oe-shell">
        {head}
        <div className="oe-message">
          <Result
            status={code === 'EDITOR_UNREACHABLE' ? 'warning' : error?.response?.status === 404 ? '404' : 'info'}
            title={known ? t(`office.errors.${code}`) : t('office.errors.generic')}
            subTitle={known ? t(`office.errors.${code}Text`) : errorMessage(error)}
            extra={[
              previewTo && (
                <Link key="preview" to={previewTo}>
                  <Button type="primary">{t('office.openPreview')}</Button>
                </Link>
              ),
              <Button key="retry" onClick={() => setRequest({ ...request, n: request.n + 1 })}>
                {t('office.retry')}
              </Button>,
            ].filter(Boolean)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`oe-shell${phase === 'ready' ? ' is-ready' : ''}`}>
      {head}
      {(session?.externalLock || session?.lockedBy || notice) && (
        <div className="oe-notices">
          {session?.externalLock && (
            <Alert
              type="warning"
              showIcon
              banner
              message={
                session.externalLock.by
                  ? t(session.externalLock.app === 'libreoffice' ? 'office.desktopLockLibreBy' : 'office.desktopLockBy', { name: session.externalLock.by })
                  : t(session.externalLock.app === 'libreoffice' ? 'office.desktopLockLibre' : 'office.desktopLock')
              }
              description={session.mode === 'view' ? t('office.desktopLockText') : t('office.desktopLockForced')}
              action={
                session.mode === 'view' && session.canWrite ? (
                  <Button size="small" danger onClick={() => setRequest({ mode: 'edit', force: true, n: request.n + 1 })}>
                    {t('office.editAnyway')}
                  </Button>
                ) : null
              }
            />
          )}
          {session?.lockedBy && session.mode === 'edit' && <Alert type="info" showIcon banner message={t('office.coEditing', { name: session.lockedBy.name })} />}
          {notice && session?.mode === 'edit' && <Alert type="info" showIcon banner closable message={notice} />}
        </div>
      )}
      <div className="oe-stage">
        {session && (
          <>
            <form ref={form} action={session.url} method="post" target={frameName} className="oe-form">
              <input type="hidden" name="access_token" value={session.accessToken} />
              <input type="hidden" name="access_token_ttl" value={String(session.accessTokenTtl)} />
            </form>
            <iframe
              ref={frame}
              key={session.accessToken}
              name={frameName}
              title={name || t('office.editor')}
              className="oe-frame"
              allow="clipboard-read *; clipboard-write *; fullscreen"
              allowFullScreen
            />
          </>
        )}
        {(phase === 'loading' || phase === 'slow') && (
          <div className="oe-loading">
            {phase === 'slow' ? (
              <Result
                status="warning"
                title={t('office.slowTitle')}
                subTitle={t('office.slowText')}
                extra={[
                  <Button key="retry" type="primary" onClick={() => setRequest({ ...request, n: request.n + 1 })}>
                    {t('office.retry')}
                  </Button>,
                  <Button key="wait" onClick={() => setPhase('waiting')}>
                    {t('office.keepWaiting')}
                  </Button>,
                  previewTo && (
                    <Link key="preview" to={previewTo}>
                      <Button>{t('office.openPreview')}</Button>
                    </Link>
                  ),
                ].filter(Boolean)}
              />
            ) : (
              <div className="oe-loading__card">
                {fileIcon}
                <Spin />
                <span>{t('office.opening', { name: name || '' })}</span>
              </div>
            )}
          </div>
        )}
        {phase === 'closed' && (
          <div className="oe-loading">
            <Result status="info" title={t('office.closedTitle')} extra={<Button type="primary" onClick={() => backTo?.go?.()}>{t('common.close')}</Button>} />
          </div>
        )}
      </div>
    </div>
  );
}
