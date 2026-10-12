import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

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

export function applyUpdate() {
  set({ applying: true });
  window.location.reload();
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
      if (available && away >= AWAY_LONG) applyUpdate();
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
    if (state.available && !state.applying) applyUpdate();
  }, [pathname]);
}
