import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { isBusy } from '../lib/busy';

/*
 * Noticing a deploy in a long-running tab or installed app (PWA).
 *
 * Phones keep an installed app asleep in memory for days: reopening it does
 * not reload the page, so new features never show up. The running build
 * (__BUILD_ID__) is compared with /version.json (no-cache) when the app comes
 * back to the screen, on focus, when the network returns and every 5 minutes.
 * A new build is then applied:
 *   - at once, when the app was away long enough that nothing is being typed;
 *   - on the next move to another page (a normal page load, invisible);
 *   - or by the "Update" button of the banner.
 * The automatic ways wait while an upload or another reload-sensitive job runs
 * (lib/busy): the update is applied on a later page move instead.
 */

const CURRENT = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const EVERY = 5 * 60 * 1000;
const AWAY_LONG = 10 * 60 * 1000;

let state = { available: false };
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};

let checking = null;
export function checkForUpdate() {
  if (CURRENT === 'dev' || !navigator.onLine) return Promise.resolve(state.available);
  if (checking) return checking;
  checking = fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.build && data.build !== CURRENT) {
        set({ available: true });
        // The service worker also refreshes, so the reload gets the new shell.
        navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.update()).catch(() => {});
      }
      return state.available;
    })
    .catch(() => state.available)
    .finally(() => {
      checking = null;
    });
  return checking;
}

/**
 * A chunk of the running build is gone from the server (lib/chunkReload: a background import
 * failed): a new version is out even if /version.json was not checked yet. Shows the banner.
 */
export function markUpdateAvailable() {
  if (!state.available) set({ available: true });
}

export function applyUpdate() {
  // While busy the browser asks "leave the page?"; if the person stays, the
  // banner button must keep working, so it is not switched to "updating".
  if (!isBusy()) set({ applying: true });
  window.location.reload();
}

/** Automatic apply: never in the middle of an upload. */
function applyIfIdle() {
  if (state.applying || isBusy()) return;
  applyUpdate();
}

export function initUpdates() {
  if (CURRENT === 'dev') return;
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    checkForUpdate().then((available) => {
      if (available && away >= AWAY_LONG) applyIfIdle();
    });
  });
  window.addEventListener('focus', () => checkForUpdate());
  window.addEventListener('online', () => checkForUpdate());
  setInterval(() => {
    if (document.visibilityState === 'visible') checkForUpdate();
  }, EVERY);
  setTimeout(checkForUpdate, 30_000);
}

export function useUpdate() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

/** Applies a waiting update on the next page change: a normal load, nothing lost. */
export function useApplyUpdateOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (state.available) applyIfIdle();
  }, [pathname]);
}
