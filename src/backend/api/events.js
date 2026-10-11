import { getUserAccess } from '../services/rbac.js';
import { query } from '../config/database.js';
import { limitsByTable } from './scopes.js';

/*
 * Outgoing events for webhooks.
 *
 *   emitEvent('task.created', {
 *     data: { task: {...} },            the payload sent to subscribers
 *     visible: async (req) => boolean,  may the webhook's run-as person see it?
 *   })
 *
 * `visible` receives a request-like object of the webhook's person (user,
 * access, apiLimits) so modules can reuse their normal access checks. Events
 * without `visible` go to every subscribed webhook. Emitting never throws and
 * never delays the change that caused it for long.
 */

export const EVENT_CATALOG = [
  { type: 'task.created', area: 'tasks' },
  { type: 'task.updated', area: 'tasks' },
  { type: 'task.completed', area: 'tasks' },
  { type: 'task.deleted', area: 'tasks' },
  { type: 'task.comment', area: 'tasks' },
  { type: 'task.result', area: 'tasks' },
  { type: 'task.due_soon', area: 'tasks' },
  { type: 'task.overdue', area: 'tasks' },
  { type: 'chat.message', area: 'chat' },
  { type: 'calendar.event.created', area: 'calendar' },
  { type: 'calendar.event.updated', area: 'calendar' },
  { type: 'calendar.event.deleted', area: 'calendar' },
  { type: 'user.created', area: 'admin.users' },
  { type: 'user.updated', area: 'admin.users' },
  { type: 'user.deleted', area: 'admin.users' },
];
export const EVENT_TYPES = EVENT_CATALOG.map((event) => event.type);

/** `task.*` and `*` select groups of events. */
export function eventMatches(subscribed, type) {
  return subscribed.some((pattern) => pattern === '*' || pattern === type || (pattern.endsWith('.*') && type.startsWith(pattern.slice(0, -1))));
}

export function cleanEvents(list) {
  const out = (Array.isArray(list) ? list : [])
    .map((item) => String(item).trim())
    .filter((item) => item === '*' || EVENT_TYPES.includes(item) || (/^[a-z]+\.\*$/.test(item) && EVENT_TYPES.some((type) => type.startsWith(item.slice(0, -1)))));
  return [...new Set(out)].slice(0, 60);
}

/** A request-like object of a person, for access checks outside a request. */
export async function requestAs(userId, limits = null) {
  const { rows } = await query(`SELECT id, username, is_active, is_blocked FROM users WHERE id = $1`, [userId]);
  const user = rows[0];
  if (!user || user.is_active === false || user.is_blocked === true) return null;
  const access = await getUserAccess(user.id);
  return { user: { id: user.id, username: user.username }, access, apiLimits: limitsByTable(limits), headers: {}, cookies: {} };
}

let enqueue = null;
/** Set by webhooks.js; keeps this file free of delivery code. */
export function setEventSink(fn) {
  enqueue = fn;
}

export async function emitEvent(type, { data = {}, visible = null, actorId = null } = {}) {
  if (!enqueue) return;
  try {
    await enqueue(type, data, { visible, actorId });
  } catch (err) {
    console.warn(`[api] event ${type} not queued:`, err.message);
  }
}
