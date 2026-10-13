import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';

/*
 * Rules of «Поручения» (orders) and of task acceptance that do not depend on
 * the rest of the module: the module settings, the people of the
 * "leadership" groups and the acceptance deadline.
 *
 *   A task is an order when it is flagged as one (tasks.is_order), or when its
 *   originator belongs to one of the groups chosen in the settings
 *   (ordersGroupIds) and someone else is the assignee.
 *
 *   A task given to someone other than its originator waits for acceptance:
 *   the assignee has acceptHours (acceptHoursImportant for important tasks)
 *   to accept it; a project may set its own hours.
 */

export const ACCEPT_DEFAULTS = { hours: 24, importantHours: 4 };
const LEADERS_TTL_MS = 30 * 1000;

export async function tasksSettings() {
  return parseSettings(await getSettings()).modules.tasks?.settings || {};
}

const groupIdsOf = (settings) =>
  [...new Set((Array.isArray(settings.ordersGroupIds) ? settings.ordersGroupIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

let leaders = { at: 0, key: null, ids: new Set() };

/** Ids of the people in the leadership groups (cached for a short while). */
export async function leadershipIds() {
  const groups = groupIdsOf(await tasksSettings());
  const key = groups.join(',');
  if (leaders.key === key && Date.now() - leaders.at < LEADERS_TTL_MS) return leaders.ids;
  const ids = groups.length
    ? new Set((await query(`SELECT DISTINCT user_id FROM user_group_members WHERE group_id = ANY($1)`, [groups])).rows.map((row) => row.user_id))
    : new Set();
  leaders = { at: Date.now(), key, ids };
  return ids;
}

/** The last known leadership (for synchronous shaping; refreshed by leadershipIds()). */
export function cachedLeadership() {
  return leaders.ids;
}

/** Drops the cache (settings or group membership changed; tests). */
export function resetLeadershipCache() {
  leaders = { at: 0, key: null, ids: new Set() };
}

/** Is this task row an order? `leaderIds` defaults to the cached leadership. */
export function isOrderRow(row, leaderIds = leaders.ids) {
  if (row.is_order) return true;
  const originator = row.originator_id || row.created_by;
  return Boolean(originator && row.assignee_id && row.assignee_id !== originator && leaderIds.has(originator));
}

const clampHours = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 720) : null;
};

/** Hours to accept a task of this project: the project's own, else the module's. */
export function acceptHoursFor(settings, project, important) {
  if (important) return clampHours(project?.accept_hours_important) || clampHours(settings.acceptHoursImportant) || ACCEPT_DEFAULTS.importantHours;
  return clampHours(project?.accept_hours) || clampHours(settings.acceptHours) || ACCEPT_DEFAULTS.hours;
}

/** The acceptance deadline of a task assigned at `from` (ISO string). */
export async function acceptDueAt(project, important, from = new Date()) {
  const hours = acceptHoursFor(await tasksSettings(), project, important);
  return new Date(new Date(from).getTime() + hours * 3600 * 1000).toISOString();
}

/** The project's acceptance hours from a request body: a number, or null for "as in the settings". */
export function parseProjectHours(value) {
  if (value === null || value === '' || value === undefined) return null;
  return clampHours(value);
}
