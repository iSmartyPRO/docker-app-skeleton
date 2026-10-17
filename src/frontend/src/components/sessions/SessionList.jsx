import { useCallback, useEffect, useState } from 'react';
import { App, Button, Popconfirm, Skeleton } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import './SessionList.css';

/*
 * Where a person is signed in: one card per session with the device, browser,
 * app or browser tab, address, sign-in method and last activity. Used in
 * Account → Security (own sessions) and Users → user (administrators).
 */

const ACTIVE_NOW_MS = 3 * 60 * 1000;

function DeviceIcon({ type }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (type === 'mobile') {
    return (
      <svg {...common}>
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
      </svg>
    );
  }
  if (type === 'tablet') {
    return (
      <svg {...common}>
        <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="4" y="4.5" width="16" height="11" rx="1.8" />
      <path d="M2 19.5h20" />
    </svg>
  );
}

function joinVersion(name, version) {
  if (!name) return '';
  return version ? `${name} ${version}` : name;
}

export function sessionTitle(session, t) {
  const { device } = session;
  const browser = joinVersion(device.browser, device.browserVersion);
  const os = joinVersion(device.os, device.osVersion);
  const parts = [browser || (os ? '' : t('sessions.unknownBrowser')), os].filter(Boolean);
  const title = parts.join(' · ') || t('sessions.unknownDevice');
  return session.client === 'pwa' ? `${title} ${t('sessions.appSuffix')}` : title;
}

function methodLabel(method, t) {
  if (!method) return null;
  const key = `sessions.method_${method}`;
  const label = t(key);
  return label === key ? method : label;
}

function ClientBadge({ session, t }) {
  const both = session.clients?.includes('pwa') && session.clients?.includes('browser');
  const pwa = session.client === 'pwa';
  return (
    <span className={`session-badge ${pwa ? 'is-app' : 'is-browser'}`}>
      {both ? t('sessions.appAndBrowser') : pwa ? t('sessions.app') : t('sessions.browserMode')}
    </span>
  );
}

function SessionCard({ session, onRevoke, canRevoke, busy }) {
  const { t, locale } = useLocale();
  const activeNow = session.current || Date.now() - new Date(session.lastSeenAt).getTime() < ACTIVE_NOW_MS;
  const method = methodLabel(session.method, t);
  return (
    <li className={`session-card${session.current ? ' is-current' : ''}${session.impersonatedBy ? ' is-impersonated' : ''}`}>
      <div className={`session-card__icon is-${session.device.type}`} title={t(`sessions.type_${session.device.type}`)}>
        <DeviceIcon type={session.device.type} />
      </div>
      <div className="session-card__body">
        <div className="session-card__head">
          <span className="session-card__title">{sessionTitle(session, t)}</span>
          {session.current && <span className="session-badge is-current">{t('sessions.thisDevice')}</span>}
          <ClientBadge session={session} t={t} />
        </div>
        <div className="session-card__meta">
          <span className={`session-card__activity${activeNow ? ' is-now' : ''}`}>
            {activeNow ? t('sessions.activeNow') : t('sessions.lastActive', { time: formatRelative(session.lastSeenAt, locale) })}
          </span>
          {session.ip && (
            <span title={session.firstIp && session.firstIp !== session.ip ? t('sessions.firstIp', { ip: session.firstIp }) : undefined}>
              {t('sessions.ip')} <span className="session-card__mono">{session.ip}</span>
            </span>
          )}
          {method && <span>{t('sessions.via', { method })}</span>}
        </div>
        <div className="session-card__sub">
          <span>{t('sessions.signedIn', { date: formatDateTime(session.createdAt, locale) })}</span>
          <span>{t('sessions.expires', { date: formatDateTime(session.expiresAt, locale, { dateStyle: 'medium' }) })}</span>
        </div>
        {session.impersonatedBy && (
          <div className="session-card__note">{t('sessions.impersonated', { name: session.impersonatedBy.name })}</div>
        )}
      </div>
      {canRevoke && !session.current && (
        <div className="session-card__action">
          <Popconfirm
            title={t('sessions.endConfirm')}
            okText={t('sessions.end')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
            onConfirm={() => onRevoke(session.id)}
          >
            <Button size="small" danger loading={busy === session.id}>
              {t('sessions.end')}
            </Button>
          </Popconfirm>
        </div>
      )}
    </li>
  );
}

/**
 * load()      → Promise<{ data: { sessions } }>
 * revoke(id)  → Promise (ends one session)
 * revokeAll() → Promise ending the others (revokeAllScope 'others') or all of them ('all'),
 *               with its button label, confirm text and success message
 */
export default function SessionList({ load, revoke, revokeAll, revokeAllLabel, revokeAllConfirm, revokeAllDone, revokeAllScope = 'others', onRevokedAll, canRevoke = true }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [sessions, setSessions] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await load();
      setSessions(res.data.sessions || []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onRevoke = async (id) => {
    setBusy(id);
    try {
      await revoke(id);
      message.success(t('sessions.ended'));
      await refresh();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onRevokeAll = async () => {
    setBusy('all');
    try {
      await revokeAll();
      message.success(revokeAllDone);
      if (onRevokedAll) onRevokedAll();
      await refresh();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (failed && !sessions) return <div className="session-list__empty">{t('sessions.loadFailed')}</div>;
  if (!sessions) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;

  const others = sessions.filter((session) => !session.current).length;
  const nothingToEnd = revokeAllScope === 'others' ? !others : !sessions.length;
  return (
    <div className="session-list">
      {sessions.length ? (
        <ul className="session-list__items">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} onRevoke={onRevoke} canRevoke={canRevoke} busy={busy} />
          ))}
        </ul>
      ) : (
        <div className="session-list__empty">{t('sessions.empty')}</div>
      )}
      {canRevoke && revokeAll && (
        <div className="session-list__footer">
          <span className="session-list__count">{t('sessions.count', { count: sessions.length })}</span>
          <Popconfirm
            title={revokeAllConfirm}
            okText={t('common.confirm')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
            onConfirm={onRevokeAll}
            disabled={nothingToEnd}
          >
            <Button danger loading={busy === 'all'} disabled={nothingToEnd} className="btn-wrap">
              {revokeAllLabel}
            </Button>
          </Popconfirm>
        </div>
      )}
    </div>
  );
}
