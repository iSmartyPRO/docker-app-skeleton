import { recordIncident } from './incidents.js';

/*
 * A promise rejection nobody handles would, by Node's default, end the whole
 * process: every signed-in person, chat stream and upload with it, for one
 * forgotten `.catch()` in a background task. It is recorded as an incident
 * (Admin → Incidents and the container log) and the server keeps serving.
 * Synchronous uncaught exceptions still end the process (its state is
 * unknown); the container supervisor starts it again.
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
}
