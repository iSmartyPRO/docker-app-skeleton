import { query } from '../config/database.js';
import { regionalFor } from './settings.js';
import { isValidTimeZone, resolveRegional } from './datetime.js';

/*
 * Glue between people and the region settings (see datetime.js):
 *   requestRegional(req)    what applies to the signed-in person (memoised per request)
 *   requestZone(req, tz)    an explicit valid `tz` parameter, else the person's zone
 *   regionalResolver()      one portal read, then a sync resolver for many users rows
 *   regionalOfUser(id)      one person by id (jobs that only have an id)
 * Users rows passed around must carry REGIONAL_COLUMNS for the person's
 * overrides to count; a row without them simply follows the portal.
 */

export const REGIONAL_COLUMNS = 'regional, device_tz, notify_prefs, locale';

/** The portal's own settings (no person): server-wide jobs and fallbacks. */
export const portalRegional = () => regionalFor(null);

/**
 * Resolves many people with one settings read:
 *   const resolve = await regionalResolver(); rows.map((row) => resolve(row))
 */
export async function regionalResolver() {
  const portal = await regionalFor(null);
  return (row) => resolveRegional(portal, row || null);
}

/** Region settings of a person by id (null id or unknown person: the portal's). */
export async function regionalOfUser(userId) {
  if (!userId) return regionalFor(null);
  const { rows } = await query(`SELECT ${REGIONAL_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return regionalFor(rows[0] || null);
}

/** Map of id → region settings for many people (one query). */
export async function regionalsOfUsers(userIds) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const resolve = await regionalResolver();
  const out = new Map();
  if (!ids.length) return out;
  const { rows } = await query(`SELECT id, ${REGIONAL_COLUMNS} FROM users WHERE id = ANY($1)`, [ids]);
  for (const row of rows) out.set(row.id, resolve(row));
  return out;
}

/**
 * The signed-in person's settings (req.userRow, set by the auth middleware),
 * computed once per request. Synthetic requests (requestAs) have no row and
 * get the person's settings by id.
 */
export function requestRegional(req) {
  if (!req) return regionalFor(null);
  if (!req.regionalPromise) {
    req.regionalPromise = req.userRow ? regionalFor(req.userRow) : regionalOfUser(req.user?.id || null);
  }
  return req.regionalPromise;
}

/** A zone sent by the client (`?tz=`) when valid, else the person's own. */
export async function requestZone(req, tz) {
  if (isValidTimeZone(tz)) return tz;
  return (await requestRegional(req)).timeZone;
}
