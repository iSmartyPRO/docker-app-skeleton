/*
 * Placeholders of the shell while module packages load (docs/module-packages.md «Shell»):
 *   - PackagePublicPlaceholder: drawn at a package's public prefix (/d/*, manifest web.publicPaths) until its web
 *     entry registers the real page (/d/:token ranks above /d/*, so the page takes over by itself). A spinner;
 *     after SLOW_MS a «taking too long» card with Reload (it keeps waiting behind it); the card at once when the entry
 *     failed. When the entry loaded and no page of it matches the address, it goes home like any unknown address.
 *   - CatchAll: «unknown address → /», except while the package list of the page the visitor opened is still being
 *     fetched (that page may be a package's public page whose route is not drawn yet).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { catchAllHolds, isListPending, msSinceOpened, packageReady, subscribeList } from './readiness';

export const SLOW_MS = 20000;
const MAX_HOLD_MS = 60000;
// Entry loaded, but none of its pages matches the address: give its routes a moment to join, then go home.
const NO_PAGE_GRACE_MS = 1500;

const Spinner = () => (
  <div className="boot-screen" data-package-wait="">
    <Spin size="large" />
  </div>
);

function SlowCard({ failed }) {
  const { t } = useLocale();
  return (
    <div className="app-error" role="alert" data-package-wait={failed ? 'failed' : 'slow'}>
      <div className="app-error__card">
        <div className="app-error__icon" aria-hidden="true">⏳</div>
        <h1>{t('appError.slowTitle')}</h1>
        <p>{t('appError.slowText')}</p>
        <div className="app-error__actions">
          <Button type="primary" size="large" onClick={() => window.location.reload()}>{t('appError.reload')}</Button>
        </div>
      </div>
    </div>
  );
}

export function PackagePublicPlaceholder({ id }) {
  const [state, setState] = useState('loading');
  useEffect(() => {
    let alive = true;
    const slow = setTimeout(() => alive && setState((now) => (now === 'loading' ? 'slow' : now)), SLOW_MS);
    packageReady(id).then((ok) => alive && setState(ok ? 'ready' : 'failed'));
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [id]);
  const [noPage, setNoPage] = useState(false);
  useEffect(() => {
    if (state !== 'ready') return undefined;
    const timer = setTimeout(() => setNoPage(true), NO_PAGE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [state]);
  if (noPage) return <Navigate to="/" replace />;
  if (state === 'failed' || state === 'slow') return <SlowCard failed={state === 'failed'} />;
  return <Spinner />;
}

/** A component per package id (contribute() needs one per route; React keeps it stable between renders). */
const placeholders = new Map();
export function placeholderFor(id) {
  if (!placeholders.has(id)) {
    const Placeholder = () => <PackagePublicPlaceholder id={id} />;
    Placeholder.displayName = `PackagePublicPlaceholder(${id})`;
    placeholders.set(id, Placeholder);
  }
  return placeholders.get(id);
}

export function CatchAll() {
  const location = useLocation();
  useSyncExternalStore(subscribeList, isListPending, isListPending);
  const holding = catchAllHolds(location.pathname);
  const [, setExpired] = useState(false);
  useEffect(() => {
    if (!holding) return undefined;
    const timer = setTimeout(() => setExpired(true), Math.max(0, MAX_HOLD_MS - msSinceOpened()) + 50);
    return () => clearTimeout(timer);
  }, [holding]);
  if (holding) return <Spinner />;
  return <Navigate to="/" replace />;
}
