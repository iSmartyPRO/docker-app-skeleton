/*
 * After a new version is deployed, the old JavaScript chunks are gone. A tab
 * that was open before the deploy fails to load the next page lazily
 * ("Failed to fetch dynamically imported module") — without help, the screen
 * stays blank until F5. We reload once to pick up the new version; a guard
 * stops a reload loop if the server itself is broken.
 */

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
 * Vite reports failed preloads of a lazily loaded page here. The error is not
 * cancelled (that would hand React an empty module); the page reloads and the
 * error boundary shows "loading the new version" meanwhile.
 */
export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', () => {
    reloadOnce();
  });
}

export const isReloading = () => Boolean(window.__portalReloading);
