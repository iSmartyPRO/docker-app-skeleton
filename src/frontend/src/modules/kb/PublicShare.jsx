import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Button, Input, Skeleton } from 'antd';
import { AppstoreOutlined, DownloadOutlined, UnorderedListOutlined } from '@ant-design/icons';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import ThemeSwitch from '../../components/ThemeSwitch';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { formatDateTime } from '../../lib/format';
import { publicApi, publicSource } from './api';
import { itemType } from './fileTypes';
import FolderContent from './components/FolderContent';
import { FileIcon, FolderIcon } from './components/Icons';
import DocumentViewer, { ImageViewer } from './viewers/DocumentViewer';
import './kb.css';
import PageTransition from '../../components/ui/PageTransition';

const tokenKey = (slug) => `kb_share_${slug}`;

function readToken(slug) {
  try {
    return sessionStorage.getItem(tokenKey(slug)) || '';
  } catch {
    return '';
  }
}

function Frame({ children }) {
  const { settings } = useSettings();
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
      <main className="share-page__main">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
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

function PasswordGate({ slug, title, onUnlock }) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await publicApi.unlock(slug, password);
      onUnlock(res.data.token);
    } catch (err) {
      const code = err?.response?.data?.code;
      setError(t(`kb.public.err_${code || 'generic'}`));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Notice icon="🔒" title={title || t('kb.public.protected')} text={t('kb.public.passwordLead')}>
      <div className="share-gate">
        <Input.Password size="large" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={submit} placeholder={t('kb.share.password')} status={error ? 'error' : undefined} />
        {error && <div className="signin__error">{error}</div>}
        <Button type="primary" size="large" block loading={busy} disabled={!password} onClick={submit}>
          {t('kb.public.open')}
        </Button>
      </div>
    </Notice>
  );
}

function SharedFolder({ slug, token, onLocked }) {
  const { t, locale } = useLocale();
  const params = useParams();
  const navigate = useNavigate();
  const folderId = params.folderId ? Number(params.folderId) : null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [view, setView] = useState('grid');

  useEffect(() => {
    setData(null);
    publicApi
      .open(slug, { folder: folderId, token })
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err?.response?.data?.code === 'PASSWORD_REQUIRED') onLocked(err.response.data.share);
        else setError(err?.response?.data?.code || 'generic');
      });
  }, [slug, folderId, token, onLocked]);

  const src = useMemo(() => publicSource(slug, token, data?.share.allowDownload), [slug, token, data]);
  const images = useMemo(() => (data?.items || []).filter((item) => itemType(item) === 'image' && item.file?.ext !== 'heic'), [data]);

  if (error) return <ShareError code={error} />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const { root, folder, breadcrumbs, share, config } = data;
  const open = (item) => {
    const index = images.findIndex((image) => image.id === item.id);
    if (index >= 0) setGallery(index);
    else navigate(`/s/${slug}/d/${item.id}`);
  };

  return (
    <div className="kb-page">
      <header className="share-hero" style={{ '--c': root.color || config.defaultColor }}>
        <FolderIcon folder={folder} config={config} size={60} />
        <div>
          <span className="share-hero__eyebrow">{t('kb.public.sharedWithYou')}</span>
          <h1>{folder.id === root.id ? share.title || root.name : folder.name}</h1>
          {folder.description && <p>{folder.description}</p>}
          {share.expiresAt && <span className="kb-pill">⏳ {t('kb.public.until', { date: formatDateTime(share.expiresAt, locale) })}</span>}
        </div>
      </header>
      {folder.id !== root.id && (
        <nav className="kb-crumbs">
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id}>
              <Link to={crumb.id === root.id ? `/s/${slug}` : `/s/${slug}/f/${crumb.id}`}>{crumb.id === root.id ? share.title || crumb.name : crumb.name}</Link>
              <span className="kb-crumbs__sep">/</span>
            </span>
          ))}
          <strong>{folder.name}</strong>
        </nav>
      )}
      <div className="kb-toolbar">
        <button type="button" className="kb-view-toggle" onClick={() => setView(view === 'grid' ? 'list' : 'grid')} aria-label={t(view === 'grid' ? 'kb.viewList' : 'kb.viewGrid')} title={t(view === 'grid' ? 'kb.viewList' : 'kb.viewGrid')}>{view === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />}</button>
      </div>
      <FolderContent
        folders={data.folders}
        items={data.items}
        view={view}
        config={config}
        src={src}
        folderLink={(id) => `/s/${slug}/f/${id}`}
        onOpen={open}
      />
      {gallery !== null && (
        <ImageViewer images={images} index={gallery} onIndex={setGallery} onClose={() => setGallery(null)} src={src} canDownload={share.allowDownload} />
      )}
    </div>
  );
}

function SharedItem({ slug, token, onLocked }) {
  const { t } = useLocale();
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([publicApi.item(slug, itemId, token), publicApi.open(slug, { token })])
      .then(([itemRes, metaRes]) => {
        setItem(itemRes.data.item);
        setMeta(metaRes.data);
      })
      .catch((err) => {
        if (err?.response?.data?.code === 'PASSWORD_REQUIRED') onLocked(err.response.data.share);
        else setError(err?.response?.data?.code || 'generic');
      });
  }, [slug, itemId, token, onLocked]);

  if (error) return <ShareError code={error} />;
  if (!item || !meta) return <Skeleton active paragraph={{ rows: 10 }} />;
  const src = publicSource(slug, token, meta.share.allowDownload);

  return (
    <div className="kb-page kb-item">
      <button type="button" className="signin__back" onClick={() => navigate(item.folderId === meta.root.id ? `/s/${slug}` : `/s/${slug}/f/${item.folderId}`)}>
        ← {t('common.back')}
      </button>
      <header className="kb-item__head">
        <FileIcon item={item} size={44} />
        <div className="kb-item__title">
          <h1>{item.title}</h1>
        </div>
        {item.kind === 'file' && src.canDownload && (
          <div className="kb-head__actions">
            <Button href={src.file(item, { download: true })} icon={<DownloadOutlined />}>{t('kb.download')}</Button>
          </div>
        )}
      </header>
      <div className={`kb-viewer kb-viewer--${item.kind}`}>
        <DocumentViewer item={item} src={src} conversion={meta.config.conversion} />
      </div>
    </div>
  );
}

function ShareError({ code }) {
  const { t } = useLocale();
  if (code === 'EXPIRED') return <Notice icon="⏳" title={t('kb.public.expired')} text={t('kb.public.expiredText')} />;
  if (code === 'OWNER_INACTIVE' || code === 'OWNER_NO_ACCESS') return <Notice icon="🔒" title={t('kb.public.ownerGone')} text={t('kb.public.ownerGoneText')} />;
  return <Notice icon="🔍" title={t('kb.public.notFound')} text={t('kb.public.notFoundText')} />;
}

/** Public link: /s/:slug, /s/:slug/f/:folderId, /s/:slug/d/:itemId. */
export default function PublicShare() {
  const { slug } = useParams();
  const [token, setToken] = useState(() => readToken(slug));
  const [locked, setLocked] = useState(null);

  const onLocked = useCallback((share) => setLocked(share || {}), []);
  const onUnlock = (value) => {
    try {
      if (value) sessionStorage.setItem(tokenKey(slug), value);
    } catch {
      /* ignore */
    }
    setToken(value || '');
    setLocked(null);
  };

  return (
    <Frame>
      {locked ? (
        <PasswordGate slug={slug} title={locked.title} onUnlock={onUnlock} />
      ) : (
        <Routes>
          <Route index element={<SharedFolder slug={slug} token={token} onLocked={onLocked} />} />
          <Route path="f/:folderId" element={<SharedFolder slug={slug} token={token} onLocked={onLocked} />} />
          <Route path="d/:itemId" element={<SharedItem slug={slug} token={token} onLocked={onLocked} />} />
        </Routes>
      )}
    </Frame>
  );
}
