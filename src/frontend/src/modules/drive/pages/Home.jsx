import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Skeleton, Tooltip } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { useAuth } from '../../../context/AuthContext';
import { formatRelative } from '../../../lib/format';
import { copyText, driveApi, fileUrl, folderUrl, formatBytes } from '../api';
import { useDrive } from '../DriveContext';
import { EntryIcon } from '../components/EntryList';
import ConnectDialog from '../components/ConnectDialog';
import { DriveGlyph, useDriveTitle } from '../DriveApp';

function AccessChip({ share }) {
  const { t } = useLocale();
  if (share.state !== 'ok') return <span className={`dv-chip is-${share.state}`}>{t(`drive.state.${share.state}`)}</span>;
  const write = share.access?.write;
  return <span className={`dv-chip ${write ? 'is-rw' : 'is-ro'}`}>{write ? t('drive.access.rw') : t('drive.access.ro')}</span>;
}

function Volume({ volume }) {
  const { t } = useLocale();
  if (!volume?.total) return null;
  const used = Math.max(0, volume.total - volume.free);
  const percent = Math.min(100, Math.round((used / volume.total) * 100));
  return (
    <div className="dv-volume" title={t('drive.freeOf', { free: formatBytes(volume.free), total: formatBytes(volume.total) })}>
      <div className="dv-volume__bar">
        <span style={{ width: `${percent}%` }} className={percent > 90 ? 'is-full' : ''} />
      </div>
      <span>{t('drive.free', { free: formatBytes(volume.free) })}</span>
    </div>
  );
}

function ShareTile({ share, onConnect, canManageAccess }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const ok = share.state === 'ok';
  const open = () => {
    if (ok) navigate(folderUrl(share.id));
    else if (share.state === 'auth') onConnect(share.serverId);
  };
  return (
    <div
      className={`dv-tile is-${share.state}`}
      style={{ '--c': share.color }}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => event.key === 'Enter' && open()}
    >
      <div className="dv-tile__top">
        <span className="dv-tile__icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.1c.7 0 1.3.3 1.8.8l1.2 1.2c.2.2.4.3.7.3h5.2A2.5 2.5 0 0 1 21 8.8v8.7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
          </svg>
        </span>
        <AccessChip share={share} />
      </div>
      <strong className="dv-tile__title">{share.title}</strong>
      {share.description && <p className="dv-tile__desc">{share.description}</p>}
      <div className="dv-tile__foot">
        {ok ? (
          <Volume volume={share.volume} />
        ) : share.state === 'auth' ? (
          <Button size="small" type="primary" onClick={(event) => { event.stopPropagation(); onConnect(share.serverId); }}>{t('drive.signIn')}</Button>
        ) : canManageAccess && (share.state === 'denied' || share.state === 'missing') ? (
          <Button size="small" icon={<SafetyOutlined />} onClick={(event) => { event.stopPropagation(); navigate(`${folderUrl(share.id)}?access=groups`); }}>{t('folderAccess.panel.action')}</Button>
        ) : (
          <span className="dv-tile__problem">{t(`drive.stateText.${share.state}`)}</span>
        )}
        <Tooltip title={`${t('drive.copyPath')}: ${share.unc}`}>
          <button
            type="button"
            className="dv-tile__unc"
            onClick={(event) => {
              event.stopPropagation();
              copyText(share.unc).then(() => message.success(t('drive.pathCopied')));
            }}
          >
            {share.serverName}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * The one folder to open instead of the overview, or null. Only when the person has exactly one
 * reachable ("ok") folder and nothing to act on here: a server waiting for their sign-in keeps the list,
 * since its banner and tile live on this page. Offline / denied / missing folders don't count.
 */
export function loneShare(shares, connections) {
  if (!shares) return null;
  if ((connections || []).some((item) => item.status !== 'ok' && item.auth === 'user')) return null;
  if (shares.some((share) => share.state === 'auth')) return null;
  const online = shares.filter((share) => share.state === 'ok');
  return online.length === 1 ? online[0] : null;
}

/**
 * /app/drive — the network drive: every folder the person can reach.
 * Entered with a single reachable folder, it opens that folder right away (`replace`, so Back leaves
 * the drive instead of bouncing here). `landing` (from the shell) is true only for the page the drive was
 * entered on; `?list=1` forces the list too.
 */
export default function Home({ landing }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { can } = useAuth();
  // Drive administrators get the way to add folders right where they are missing.
  const canManage = can('drive.admin') || can('settings.modules');
  const { shares, connections, refresh, config } = useDrive();
  const title = useDriveTitle();
  const [recent, setRecent] = useState(null);
  const [favorites, setFavorites] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [params] = useSearchParams();
  const lone = landing?.current && !params.has('list') ? loneShare(shares, connections) : null;
  const { drive } = useDrive();

  useEffect(() => {
    if (lone) navigate(folderUrl(lone.id), { replace: true });
    else if (shares && landing) landing.current = false; // the list was shown: later visits keep showing it
  }, [shares, lone, landing, navigate]);

  useEffect(() => {
    if (lone) return;
    driveApi.recent().then((res) => setRecent(res.data.items)).catch(() => setRecent([]));
    driveApi.favorites().then((res) => setFavorites(res.data.items)).catch(() => setFavorites([]));
  }, [lone]);

  const needsSignIn = (connections || []).filter((item) => item.status !== 'ok' && item.auth === 'user');
  const openShortcut = (item) => {
    if (item.dir) navigate(folderUrl(item.shareId, item.path));
    else {
      const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
      if (config?.openMode !== 'modal') navigate(fileUrl(item.shareId, item.path));
      else navigate(`${folderUrl(item.shareId, parent)}?open=${encodeURIComponent(item.name)}`);
    }
  };

  if (lone) return null; // about to open the folder: don't flash the overview

  return (
    <div className="dv-home">
      <header className="dv-hero">
        <div className="dv-hero__glyph"><DriveGlyph /></div>
        <div className="dv-hero__text">
          <h1>{title}</h1>
          <p>{drive?.tagline || t('drive.tagline')}</p>
        </div>
        {shares && (
          <div className="dv-hero__stats">
            <span><strong>{shares.filter((share) => share.state === 'ok').length}</strong>{t('drive.statFolders')}</span>
            <span><strong>{new Set(shares.map((share) => share.serverId)).size}</strong>{t('drive.statServers')}</span>
          </div>
        )}
      </header>

      {needsSignIn.map((connection) => (
        <div key={connection.serverId} className="dv-banner">
          <span className="dv-banner__icon" aria-hidden="true">🔑</span>
          <div>
            <strong>{t(connection.status === 'missing' ? 'drive.bannerSignIn' : 'drive.bannerFailed', { name: connection.serverName })}</strong>
            <span>{t(connection.status === 'missing' ? 'drive.bannerSignInText' : 'drive.bannerFailedText')}</span>
          </div>
          <Button type="primary" onClick={() => setConnecting(connection)}>{t('drive.signIn')}</Button>
        </div>
      ))}

      {!shares ? (
        <div className="dv-tiles">
          {[0, 1, 2, 3].map((key) => <div key={key} className="dv-tile is-loading"><Skeleton active paragraph={{ rows: 2 }} /></div>)}
        </div>
      ) : shares.length ? (
        <div className="dv-tiles">
          {shares.map((share) => (
            <ShareTile key={share.id} share={share} canManageAccess={Boolean(config?.access)} onConnect={(serverId) => setConnecting(connections.find((item) => item.serverId === serverId))} />
          ))}
        </div>
      ) : (
        <div className="fs-empty dv-empty-drive">
          <span className="fs-empty__icon"><DriveGlyph /></span>
          <strong>{t('drive.noShares')}</strong>
          <span>{canManage ? t('drive.noSharesAdmin') : t('drive.noSharesText')}</span>
          {canManage && (
            <Button type="primary" onClick={() => navigate('/admin/settings/drive')}>
              + {t('drive.addShares')}
            </Button>
          )}
        </div>
      )}

      {favorites?.length > 0 && (
        <section className="dv-section">
          <h2>★ {t('drive.favorites')}</h2>
          <div className="dv-pins">
            {favorites.map((item) => (
              <button key={`${item.shareId}:${item.path}`} type="button" className="dv-pin" style={{ '--c': item.color }} onClick={() => openShortcut(item)}>
                <EntryIcon entry={item} size={28} />
                <span>
                  <strong>{item.name}</strong>
                  <em>{item.shareTitle}</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent?.length > 0 && (
        <section className="dv-section">
          <h2>{t('drive.recent')}</h2>
          <div className="dv-recent">
            {recent.slice(0, 12).map((item) => (
              <button key={`${item.shareId}:${item.path}`} type="button" className="dv-recent__row" onClick={() => openShortcut(item)}>
                <EntryIcon entry={item} size={30} />
                <span className="dv-recent__name">
                  <strong>{item.name}</strong>
                  <em><span className="mod-dot" style={{ '--c': item.color }} /> {item.shareTitle}{item.path.includes('/') ? ` / ${item.path.slice(0, item.path.lastIndexOf('/'))}` : ''}</em>
                </span>
                <span className="dv-recent__when">{formatRelative(item.at, locale)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <ConnectDialog
        open={Boolean(connecting)}
        connection={connecting}
        onClose={(changed) => {
          setConnecting(null);
          if (changed) refresh();
        }}
      />
    </div>
  );
}
