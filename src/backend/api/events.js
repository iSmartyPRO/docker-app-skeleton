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
  { type: 'task.accepted', area: 'tasks' },
  { type: 'chat.message', area: 'chat' },
  { type: 'deal.created', area: 'crm' },
  { type: 'deal.updated', area: 'crm' },
  { type: 'deal.stage_changed', area: 'crm' },
  { type: 'deal.won', area: 'crm' },
  { type: 'deal.lost', area: 'crm' },
  { type: 'deal.deleted', area: 'crm' },
  { type: 'approval.started', area: 'approvals' },
  { type: 'approval.decision', area: 'approvals' },
  { type: 'approval.approved', area: 'approvals' },
  { type: 'approval.rejected', area: 'approvals' },
  { type: 'approval.returned', area: 'approvals' },
  { type: 'approval.question', area: 'approvals' },
  { type: 'approval.answered', area: 'approvals' },
  { type: 'approval.delegated', area: 'approvals' },
  { type: 'approval.withdrawn', area: 'approvals' },
  { type: 'approval.overdue', area: 'approvals' },
  { type: 'contracts.created', area: 'contracts' },
  { type: 'contracts.updated', area: 'contracts' },
  { type: 'contracts.status_changed', area: 'contracts' },
  { type: 'contracts.prolonged', area: 'contracts' },
  { type: 'contracts.version_added', area: 'contracts' },
  { type: 'contracts.risk_changed', area: 'contracts' },
  { type: 'contracts.reminder', area: 'contracts' },
  { type: 'contracts.deleted', area: 'contracts' },
  { type: 'procurement.created', area: 'procurement' },
  { type: 'procurement.updated', area: 'procurement' },
  { type: 'procurement.submitted', area: 'procurement' },
  { type: 'procurement.status_changed', area: 'procurement' },
  { type: 'procurement.approved', area: 'procurement' },
  { type: 'procurement.rejected', area: 'procurement' },
  { type: 'procurement.payment', area: 'procurement' },
  { type: 'procurement.paid', area: 'procurement' },
  { type: 'procurement.delivered', area: 'procurement' },
  { type: 'procurement.overdue', area: 'procurement' },
  { type: 'procurement.closed', area: 'procurement' },
  { type: 'procurement.cancelled', area: 'procurement' },
  { type: 'procurement.deleted', area: 'procurement' },
  { type: 'warehouse.document.posted', area: 'warehouse' },
  { type: 'warehouse.document.reversed', area: 'warehouse' },
  { type: 'warehouse.document.requested', area: 'warehouse' },
  { type: 'warehouse.document.deleted', area: 'warehouse' },
  { type: 'warehouse.transfer.shipped', area: 'warehouse' },
  { type: 'warehouse.transfer.received', area: 'warehouse' },
  { type: 'warehouse.discrepancy', area: 'warehouse' },
  { type: 'warehouse.stock.low', area: 'warehouse' },
  { type: 'warehouse.tool.handover', area: 'warehouse' },
  { type: 'warehouse.tool.service_due', area: 'warehouse' },
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
