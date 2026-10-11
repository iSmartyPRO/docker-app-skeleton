/*
 * In-process hooks that let modules react to core events without the core
 * importing module code.
 *
 *   directory-sign-in  { user, profile, password }  after a successful AD sign-in
 *
 * Listeners never break the event: errors are logged and swallowed.
 */

const listeners = new Map();

function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

async function emit(event, payload) {
  for (const fn of listeners.get(event) || []) {
    try {
      await fn(payload);
    } catch (err) {
      console.warn(`Hook ${event} failed:`, err.message);
    }
  }
}

export const onDirectorySignIn = (fn) => on('directory-sign-in', fn);
export const emitDirectorySignIn = (payload) => emit('directory-sign-in', payload);
