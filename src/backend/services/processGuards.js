import { recordIncident } from './incidents.js';
import { installCrashGuard } from '../platform/packages/crashGuard.js';
import { BOOT_ID } from '../platform/packages/restart.js';

/*
 * A promise rejection nobody handles would, by Node's default, end the whole
 * process: every signed-in person, chat stream and upload with it, for one
 * forgotten `.catch()` in a background task. It is recorded as an incident
 * (Admin → Incidents and the container log) and the server keeps serving.
 * Synchronous uncaught exceptions still end the process (its state is
 * unknown); the container supervisor starts it again. One thrown from a
 * module package's code is attributed to the package first, so a package that
 * keeps crashing the portal is blocked (platform/packages/crashGuard.js).
 */
export function onUnhandledRejection(reason) {
  return recordIncident({
    kind: 'process',
    code: 'UNHANDLED_REJECTION',
    message: reason?.message || String(reason),
    stack: reason?.stack,
  });
}

let installed = false;
export function installProcessGuards() {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', onUnhandledRejection);
  installCrashGuard({ bootId: BOOT_ID });
}
