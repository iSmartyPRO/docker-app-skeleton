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

import { emit as emitEvent, on as onEvent } from '../platform/events.js';

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
// Kept for existing callers: the same bus as platform/events.js.
export const onModuleEvent = (name, fn) => onEvent(name, fn);
export const emitModuleEvent = (name, payload) => emitEvent(name, payload).then(() => undefined);

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

/*
 * What the Users page shows about a person's stored directory password («доменный
 * пароль сохранён»): the module that keeps it (the File server) answers
 * `(userId) → { username, source, status, updatedAt } | null`. One provider; none
 * (the module not installed) or a failing one answers null.
 */
let credentialInfoProvider = null;
export function provideDirectoryCredentialInfo(fn) {
  credentialInfoProvider = typeof fn === 'function' ? fn : null;
  return () => {
    if (credentialInfoProvider === fn) credentialInfoProvider = null;
  };
}
export async function directoryCredentialInfo(userId) {
  if (!credentialInfoProvider) return null;
  try {
    return (await credentialInfoProvider(userId)) || null;
  } catch {
    return null;
  }
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
