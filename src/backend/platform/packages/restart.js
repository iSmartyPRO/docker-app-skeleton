import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { modulesDir } from './paths.js';

/*
 * Restarting the app after a module is installed, updated or removed (spec §3.4).
 *
 * The answer goes out first; then the process stops gracefully (SIGTERM →
 * server.js shutdown) and exits with code 75. start.sh runs node in a loop and
 * starts it again at once on 75 while nginx keeps answering (the «технические
 * работы» JSON for API calls), so the restart takes a few seconds. Outside the
 * container (dev, tests) the process just ends; nodemon / you start it again.
 *
 * BOOT_ID changes with every start: the restart screen polls
 * GET /api/modules/installed until it sees a new one.
 *
 * A restart asked for while the app is still starting (a rollback during the
 * module boot) waits until server.js has installed its SIGTERM handler
 * (restartReady()): before that, SIGTERM would kill node with 143 and start.sh
 * would end the container instead of restarting the app. If the app never
 * gets there (the HTTP server is not started yet after STARTUP_WAIT_MS), it
 * exits with 75 directly: nothing is being served, so there is nothing to drain.
 */

export const RESTART_EXIT_CODE = 75;
export const BOOT_ID = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;

let handler = null;
let pending = null;
let ready = false;
let deferred = false;
const STARTUP_WAIT_MS = 30_000;

/** Tests replace the restart with their own function (null restores the default). */
export function setRestartHandler(fn) {
  handler = typeof fn === 'function' ? fn : null;
}

export const restartPending = () => pending;

/** server.js: the SIGTERM handler is installed — a restart asked for before now runs. */
export function restartReady() {
  ready = true;
  if (deferred) {
    deferred = false;
    defaultRestart();
  }
}

const beforeExitHooks = [];
/** loader.js: what must happen before exitForRestart() ends the process (the boot markers of packages still loading go). */
export function onRestartExit(fn) {
  if (typeof fn === 'function') beforeExitHooks.push(fn);
}

/** Exported for tests. A deliberate restart is not a crash: the hooks clear the in-flight boot markers first. */
export function exitForRestart({ exit = (code) => process.exit(code) } = {}) {
  console.log('Restarting before the HTTP server started: exit 75');
  for (const fn of beforeExitHooks) {
    try {
      fn();
    } catch (err) {
      console.warn(`Restart: a before-exit hook failed: ${err.message}`);
    }
  }
  exit(RESTART_EXIT_CODE);
}

function defaultRestart() {
  if (!ready) {
    if (deferred) return;
    deferred = true;
    setTimeout(() => {
      if (deferred && !ready) exitForRestart();
    }, STARTUP_WAIT_MS).unref?.();
    return;
  }
  try {
    mkdirSync(modulesDir(), { recursive: true });
    writeFileSync(join(modulesDir(), '.restart-requested'), `${new Date().toISOString()} ${pending?.reason || ''}\n`);
  } catch {
    /* the exit code alone is enough for start.sh */
  }
  process.on('exit', () => {
    process.exitCode = RESTART_EXIT_CODE;
  });
  process.kill(process.pid, 'SIGTERM');
}

/** Asks for a restart `delayMs` from now (after the current answer is sent). */
export function requestRestart(reason = 'modules changed', { delayMs = 600 } = {}) {
  // Tests: the handler sees every request at once (nothing is pending).
  if (handler) {
    handler({ reason, at: new Date().toISOString() });
    return { reason };
  }
  if (pending) return pending;
  pending = { reason, at: new Date().toISOString() };
  console.log(`Restart requested: ${reason}`);
  const run = defaultRestart;
  setTimeout(() => {
    try {
      run(pending);
    } catch (err) {
      console.error('Restart failed:', err.message);
    }
  }, delayMs).unref?.();
  return pending;
}

/** Tests: { pending, ready, deferred }. */
export const restartState = () => ({ pending, ready, deferred });

/** Tests: forget a requested restart. */
export function resetRestart() {
  pending = null;
  deferred = false;
}
