import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Skeleton } from 'antd';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import ThemeSwitch from '../../components/ThemeSwitch';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { formatDateTime } from '../../lib/format';
import { asViewerItem, formatBytes, linkApi, linkSource } from './api';
import NodeList, { NodeIcon } from './components/NodeList';
import NodeViewer from './components/NodeViewer';
import DocumentViewer from '../kb/viewers/DocumentViewer';
import '../kb/kb.css';
import '../shared/module.css';
import './files.css';

const tokenKey = (token) => `fs_link_${token}`;

function readVisitor(token) {
  try {
    return sessionStorage.getItem(tokenKey(token)) || '';
  } catch {
    return '';
  }
}

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

/** /l/:token — a file or folder shared by public link. */
export default function PublicLink() {
  const { token } = useParams();
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const [visitor, setVisitor] = useState(() => readVisitor(token));
  const [folderId, setFolderId] = useState(null);
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    setData(null);
    linkApi
      .open(token, { folder: folderId, visitor })
      .then((res) => {
        setData(res.data);
        setState('ready');
      })
      .catch((err) => {
        const code = err?.response?.data?.code;
        setState(code === 'PASSWORD_REQUIRED' ? 'locked' : code === 'EXPIRED' ? 'expired' : 'missing');
      });
  }, [token, folderId, visitor]);

  useEffect(() => {
    load();
  }, [load]);

  const unlock = async () => {
    setError('');
    try {
      const res = await linkApi.unlock(token, password);
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

  const src = useMemo(() => linkSource(token, visitor, data?.link.allowDownload), [token, visitor, data]);

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
  else if (state === 'missing') body = <Notice icon="🔍" title={t('kb.public.notFound')} text={t('kb.public.notFoundText')} />;
  else {
    const { node, items, crumbs, link } = data;
    body = (
      <div className="kb-page">
        <header className="share-hero">
          <NodeIcon node={node} size={56} />
          <div>
            <span className="share-hero__eyebrow">{t('kb.public.sharedWithYou')}</span>
            <h1>{node.name}</h1>
            <p>
              {node.kind === 'file' ? formatBytes(node.file?.size) : t('files.itemsN', { n: items.length })}
              {link.expiresAt && ` · ${t('kb.public.until', { date: formatDateTime(link.expiresAt, locale) })}`}
            </p>
          </div>
          {node.kind === 'file' && link.allowDownload && (
            <Button type="primary" href={src.file(node, { download: true })}>⤓ {t('kb.download')}</Button>
          )}
        </header>
        {node.kind === 'folder' && crumbs.length > 0 && (
          <nav className="kb-crumbs">
            {crumbs.map((crumb) => (
              <span key={crumb.id}>
                <button type="button" className="fs-crumb-btn" onClick={() => setFolderId(crumb.id === link.rootId ? null : crumb.id)}>{crumb.name}</button>
                <span className="kb-crumbs__sep">/</span>
              </span>
            ))}
            <strong>{node.name}</strong>
          </nav>
        )}
        {node.kind === 'folder' ? (
          <NodeList nodes={items} view="grid" src={src} onOpen={(item) => (item.kind === 'folder' ? setFolderId(item.id) : setViewing(item))} emptyText={t('files.empty')} />
        ) : (
          <div className="kb-viewer kb-viewer--file">
            <DocumentViewer item={asViewerItem(node)} src={src} conversion={data.conversion} />
          </div>
        )}
        {viewing && <NodeViewer node={viewing} siblings={items} src={src} conversion={data.conversion} onNavigate={(next) => next && setViewing(items.find((item) => item.id === next.id))} onClose={() => setViewing(null)} />}
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
    </div>
  );
}
