import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Skeleton, Spin } from 'antd';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import ThemeSwitch from '../../components/ThemeSwitch';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../lib/format';
import DocumentViewer from '../kb/viewers/DocumentViewer';
import { CAD, asViewerItem, formatBytes, linkSource, publicDriveApi } from './api';
import EntryList, { EntryIcon } from './components/EntryList';
import DriveViewer from './components/DriveViewer';
import '../kb/kb.css';
import '../shared/module.css';
import '../files/files.css';
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

const NOTICES = {
  OWNER_INACTIVE: { icon: '🕊', tone: 'calm' },
  REVOKED: { icon: '⛔', tone: 'calm' },
  EXPIRED: { icon: '⏳', tone: 'calm' },
  OWNER_NO_ACCESS: { icon: '🔒', tone: 'calm' },
  GONE: { icon: '🧭', tone: 'calm' },
  UNAVAILABLE: { icon: '📡', tone: 'warn' },
  LINKS_DISABLED: { icon: '🔕', tone: 'calm' },
  NOT_FOUND: { icon: '🔍', tone: 'calm' },
};

function Notice({ code, info, children }) {
  const { t, locale } = useLocale();
  const meta = NOTICES[code] || NOTICES.NOT_FOUND;
  const key = NOTICES[code] ? code : 'NOT_FOUND';
  return (
    <div className={`dv-notice is-${meta.tone}`}>
      <div className="dv-notice__icon">{meta.icon}</div>
      <span className="dv-notice__eyebrow">{t('drive.public.eyebrow')}</span>
      <h1>{t(`drive.public.${key}.title`)}</h1>
      <p>{t(`drive.public.${key}.text`, { date: info?.expiredAt ? formatDateTime(info.expiredAt, locale) : '' })}</p>
      {t(`drive.public.${key}.hint`) !== `drive.public.${key}.hint` && <p className="dv-notice__hint">{t(`drive.public.${key}.hint`)}</p>}
      {children}
    </div>
  );
}

/** /d/:token — a file or folder from the company's file servers, shared by link. */
export default function PublicDrive() {
  const { token } = useParams();
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [visitor, setVisitor] = useState(() => readVisitor(token));
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [state, setState] = useState({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    setData(null);
    publicDriveApi
      .open(token, { path, visitor })
      .then((res) => {
        setData(res.data);
        setState({ kind: 'ready' });
      })
      .catch((err) => {
        const body = err?.response?.data || {};
        setState({ kind: 'error', code: body.code || 'UNAVAILABLE', info: body.info });
      });
  }, [token, path, visitor]);

  useEffect(() => {
    load();
  }, [load, user]);

  const unlock = async () => {
    setError('');
    try {
      const res = await publicDriveApi.unlock(token, password);
      try {
        sessionStorage.setItem(tokenKey(token), res.data.token || '');
      } catch {
        /* ignore */
      }
      setVisitor(res.data.token || '');
    } catch (err) {
      const code = err?.response?.data?.code;
      setError(t(`kb.public.err_${code || 'generic'}`));
      setPassword('');
    }
  };

  const src = useMemo(() => linkSource(token, visitor, data?.link?.allowDownload), [token, visitor, data]);

  let body;
  if (state.kind === 'loading' || (state.kind === 'ready' && !data)) {
    body = <Skeleton active paragraph={{ rows: 8 }} />;
  } else if (state.kind === 'error' && state.code === 'PASSWORD_REQUIRED') {
    body = (
      <div className="dv-notice">
        <div className="dv-notice__icon">🔐</div>
        <span className="dv-notice__eyebrow">{state.info?.name}</span>
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
        <span className="dv-notice__eyebrow">{state.info?.name}</span>
        <h1>{t('drive.public.SIGN_IN_REQUIRED.title')}</h1>
        <p>{t('drive.public.SIGN_IN_REQUIRED.text', { app: settings?.appName || '' })}</p>
        <Link to={`/login?next=${encodeURIComponent(`/d/${token}`)}`}>
          <Button type="primary" size="large">{t('drive.public.signIn')}</Button>
        </Link>
      </div>
    );
  } else if (state.kind === 'error') {
    body = <Notice code={state.code} info={state.info} />;
  } else {
    const { link, entries = [], crumbs = [] } = data;
    const entry = data.entry;
    const isFile = link.kind === 'file';
    body = (
      <div className="kb-page dv-public">
        <header className="share-hero dv-public__hero">
          <EntryIcon entry={isFile ? entry : { dir: true }} size={56} />
          <div>
            <span className="share-hero__eyebrow">{link.owner ? t('drive.public.sharedBy', { name: link.owner }) : t('kb.public.sharedWithYou')}</span>
            <h1>{isFile ? entry.name : data.name}</h1>
            <p>
              {isFile ? formatBytes(entry.size) : t('files.itemsN', { n: entries.length })}
              {link.expiresAt && ` · ${t('kb.public.until', { date: formatDateTime(link.expiresAt, locale) })}`}
              {link.audience === 'employees' && ` · 🏢 ${t('drive.audience.employees')}`}
            </p>
          </div>
          {link.allowDownload && (
            <Button type="primary" size="large" href={isFile ? src.file(entry, { download: true }) : src.zip(path)}>
              ⤓ {isFile ? t('kb.download') : t('drive.downloadZipShort')}
            </Button>
          )}
        </header>
        {!isFile && (path || crumbs.length > 0) && (
          <nav className="kb-crumbs">
            <button type="button" className="fs-crumb-btn" onClick={() => setPath('')}>{link.name}</button>
            {crumbs.map((crumb, index) => (
              <span key={crumb.path}>
                <span className="kb-crumbs__sep">/</span>
                {index === crumbs.length - 1 ? <strong>{crumb.name}</strong> : <button type="button" className="fs-crumb-btn" onClick={() => setPath(crumb.path)}>{crumb.name}</button>}
              </span>
            ))}
          </nav>
        )}
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
          <EntryList entries={entries} view="grid" src={src} onOpen={(item) => (item.dir ? setPath(item.path) : setViewing(item))} emptyText={t('drive.empty')} />
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
      <footer className="dv-public__foot">🛡 {t('drive.public.footer', { app: settings?.appName || '' })}</footer>
    </div>
  );
}
