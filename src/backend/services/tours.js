import { query, withTransaction } from '../config/database.js';
import { sanitizeStoredUi, sanitizeUserUi } from './themeCatalog.js';

/*
 * Guided tours: which tours a person has been through (or skipped) and the
 * «Не показывать туры» switch. Tour content lives in the frontend
 * (src/frontend/src/tour/content); the server only remembers progress, so a
 * person sees a tour once on any device. An administrator may reset tours for
 * everyone (e.g. after a big update): progress rows are deleted, personal
 * «Не показывать туры» stays as the person set it.
 */

export const TOUR_ID_RE = /^[a-z][a-z0-9_.-]{0,63}$/;
const STATUSES = new Set(['done', 'skipped']);

export async function ensureTourTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_tours (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tour_id VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'done',
      version INTEGER NOT NULL DEFAULT 1,
      seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, tour_id)
    )
  `);
}

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/** Validates a progress mark `{ id, status, version }` from the page. */
export function sanitizeTourMark(body) {
  const id = String(body?.id || '');
  if (!TOUR_ID_RE.test(id)) throw httpError(400, 'Unknown tour', 'TOUR_ID');
  const status = STATUSES.has(body?.status) ? body.status : 'done';
  const version = Math.max(1, Math.min(1000, Math.round(Number(body?.version) || 1)));
  return { id, status, version };
}

/** { seen: { [tourId]: { status, version, at } }, disabled } of one person. */
export async function getTourState(userId) {
  const [rows, user] = await Promise.all([
    query(`SELECT tour_id, status, version, seen_at FROM user_tours WHERE user_id = $1`, [userId]),
    query(`SELECT ui FROM users WHERE id = $1`, [userId]),
  ]);
  const seen = {};
  for (const row of rows.rows) seen[row.tour_id] = { status: row.status, version: row.version, at: row.seen_at };
  return { seen, disabled: sanitizeStoredUi(user.rows[0]?.ui).toursOff };
}

export async function markTour(userId, body) {
  const mark = sanitizeTourMark(body);
  await query(
    `INSERT INTO user_tours (user_id, tour_id, status, version, seen_at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, tour_id) DO UPDATE SET status = EXCLUDED.status, version = GREATEST(user_tours.version, EXCLUDED.version), seen_at = NOW()`,
    [userId, mark.id, mark.status, mark.version]
  );
  return mark;
}

/** Forgets one tour of a person (so it starts again on the next visit). */
export async function forgetTour(userId, tourId) {
  if (!TOUR_ID_RE.test(String(tourId || ''))) throw httpError(400, 'Unknown tour', 'TOUR_ID');
  await query(`DELETE FROM user_tours WHERE user_id = $1 AND tour_id = $2`, [userId, tourId]);
}

/** Reads the person's interface preferences (users.ui). */
export async function getUserUi(userId) {
  const { rows } = await query(`SELECT ui FROM users WHERE id = $1`, [userId]);
  return sanitizeStoredUi(rows[0]?.ui);
}

/** Merges a patch into users.ui (row-locked, so two tabs saving at once both land). */
export async function updateUserUi(userId, patch) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT ui FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!rows[0]) throw httpError(404, 'User not found', 'NOT_FOUND');
    const next = sanitizeUserUi(patch, rows[0].ui);
    await client.query(`UPDATE users SET ui = $2::jsonb, updated_at = NOW() WHERE id = $1`, [userId, JSON.stringify(next)]);
    return next;
  });
}

export async function setToursDisabled(userId, disabled) {
  return updateUserUi(userId, { toursOff: disabled === true });
}

/** Everyone sees the tours again. Returns how many progress marks were removed. */
export async function resetAllTours() {
  const result = await query(`DELETE FROM user_tours`);
  return result.rowCount || 0;
}
