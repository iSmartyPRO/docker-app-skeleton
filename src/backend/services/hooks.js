/*
 * In-process hooks that let modules react to core events without the core
 * importing module code.
 *
 *   directory-sign-in  { user, profile, password }  after a successful AD sign-in
 *
 * Listeners never break the event: errors are logged and swallowed.
 *
 * Before-user-delete hooks are different: they run inside the delete
 * transaction and a thrown error aborts the delete (rolls everything back).
 *
 *   onBeforeUserDelete(async (client, userId, { actor }) => { … })
 *
 * `client` is the transaction's pg client (use client.query, never the pool,
 * or the work escapes the transaction); `userId` the account being deleted;
 * `actor` the administrator ({ id, permissions }). Hooks run one after
 * another in registration order. Returns a function that unregisters it.
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

/*
 * Module events: one module announces a change other modules may follow,
 * without importing each other. Listeners never break the event.
 *
 *   crm.deal.stage  { dealId, from, to: { id, name, kind }, actorId }  a deal moved to another stage
 */
export const onModuleEvent = (name, fn) => on(`module:${name}`, fn);
export const emitModuleEvent = (name, payload) => emit(`module:${name}`, payload);

export const onDirectorySignIn = (fn) => on('directory-sign-in', fn);
export const emitDirectorySignIn = (payload) => emit('directory-sign-in', payload);

/*
 * A directory password an administrator set for a person (or `forget: true`
 * to remove it). Unlike sign-in hooks, errors reach the caller: the
 * administrator must know whether it was stored.
 */
const directoryCredential = new Set();
export function onDirectoryCredential(fn) {
  directoryCredential.add(fn);
  return () => directoryCredential.delete(fn);
}
export async function emitDirectoryCredential(payload) {
  for (const fn of directoryCredential) await fn(payload);
  return directoryCredential.size > 0;
}

const beforeUserDelete = new Set();

export function onBeforeUserDelete(fn) {
  beforeUserDelete.add(fn);
  return () => beforeUserDelete.delete(fn);
}

/** Called by deleteUser inside its transaction, right before the DELETE. */
export async function runBeforeUserDelete(client, userId, context = {}) {
  for (const fn of beforeUserDelete) await fn(client, userId, context);
}
