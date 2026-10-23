import { closeSync, openSync, utimesSync } from 'node:fs';

/*
 * Liveness heartbeat for the start.sh watchdog (docs/module-packages.md «Watchdog»).
 *
 * While the event loop runs, the file named by PORTAL_HEARTBEAT_FILE (start.sh sets it; unset =
 * off, e.g. dev and tests) is touched every few seconds. A synchronous hang — a busy loop,
 * execSync or Atomics.wait in a package's import or register(), anywhere before or after the
 * server listens — stops the touches; start.sh then kills node once the file is older than
 * PORTAL_WATCHDOG_SECONDS and /health does not answer either. A slow but working boot (the
 * database late, a long async migration) keeps the event loop free, so it keeps beating and is
 * never killed. The boot markers of the packages still in flight handle the next start.
 */
export function startHeartbeat({ file = process.env.PORTAL_HEARTBEAT_FILE, everyMs = 5000 } = {}) {
  if (!file) return null;
  const beat = () => {
    try {
      const now = new Date();
      try {
        utimesSync(file, now, now);
      } catch {
        closeSync(openSync(file, 'a'));
      }
    } catch {
      /* /health is the watchdog's second condition: a heartbeat that cannot be written never kills a working server */
    }
  };
  beat();
  const timer = setInterval(beat, everyMs);
  timer.unref?.();
  return { beat, stop: () => clearInterval(timer) };
}
