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
 */

export const RESTART_EXIT_CODE = 75;
export const BOOT_ID = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;

let handler = null;
let pending = null;

/** Tests replace the restart with their own function (null restores the default). */
export function setRestartHandler(fn) {
  handler = typeof fn === 'function' ? fn : null;
}

export const restartPending = () => pending;

function defaultRestart() {
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

/** Tests: forget a requested restart. */
export function resetRestart() {
  pending = null;
}
