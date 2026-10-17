/*
 * After a new version is deployed, the old JavaScript chunks are gone. A tab
 * that was open before the deploy fails to load the next page lazily
 * ("Failed to fetch dynamically imported module") — without help, the screen
 * stays blank until F5. A page that fails to load reloads once to pick up the
 * new version (a guard stops a reload loop if the server itself is broken);
 * other failed imports only announce the new version (installChunkRecovery).
 */

import { markUpdateAvailable } from '../pwa/update';

const KEY = 'portal_chunk_reload_at';
const GUARD_MS = 20_000;

export function isChunkError(error) {
  const text = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk [\w-]+ failed|ChunkLoadError|Expected a JavaScript module script/i.test(text);
}

/** Reloads the page unless we already did so in the last few seconds. Returns true if it reloads. */
export function reloadOnce() {
  if (window.__portalReloading) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still try once */
  }
  window.__portalReloading = true;
  window.location.reload();
  return true;
}

/**
 * Only a page (route) that cannot load reloads: React.lazy hands the error to
 * the error boundary (components/AppErrorBoundary.jsx → reloadOnce), which
 * shows "loading the new version" meanwhile. Everything else — a failed
 * preload, an on-demand import() outside React.lazy (help texts, icon sets,
 * viewers) — must never reload under someone typing: it shows the update
 * banner (pwa/UpdateBanner.jsx), applied on the next page change or by its
 * button. The error is not cancelled (that would hand React an empty module).
 */
export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', () => {
    markUpdateAvailable();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkError(event.reason)) markUpdateAvailable();
  });
}

export const isReloading = () => Boolean(window.__portalReloading);
