import { query } from '../../config/database.js';
import { httpError } from './logic.js';
import { isApprovalsAdmin } from './engine.js';
import { portalToday, usersById } from './people.js';

/*
 * Substitutes: "from … to … X decides my approvals". Everyone manages their
 * own; approvals administrators manage anyone's. Periods are calendar days in
 * the portal's zone (YYYY-MM-DD), both ends included.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function shape(row, people, today) {
  return {
    id: row.id,
    user: people.get(row.user_id) || { id: row.user_id },
    substitute: people.get(row.substitute_id) || { id: row.substitute_id },
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    note: row.note,
    active: row.starts_on <= today && row.ends_on >= today,
    past: row.ends_on < today,
  };
}

const DAY_COLUMNS = `id, user_id, substitute_id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, note`;

/** Mine (I am away / I stand in) or, for administrators with `all`, everyone's current and future ones. */
export async function listSubstitutes(ctx, { all = false } = {}) {
  const userId = ctx.user.id;
  const today = await portalToday();
  const everyone = all && isApprovalsAdmin(ctx);
  const { rows } = await query(
    `SELECT ${DAY_COLUMNS} FROM approval_substitutes
     WHERE ($1 OR user_id = $2 OR substitute_id = $2) AND ends_on >= ($3::date - 30)
     ORDER BY starts_on, id LIMIT 500`,
    [everyone, userId, today]
  );
  const people = await usersById(rows.flatMap((row) => [row.user_id, row.substitute_id]));
  return { items: rows.map((row) => shape(row, people, today)), today };
}

export async function createSubstitute(ctx, input = {}) {
  const userId = input.userId && Number(input.userId) !== ctx.user.id ? Number(input.userId) : ctx.user.id;
  if (userId !== ctx.user.id && !isApprovalsAdmin(ctx)) throw httpError(403, 'You can set only your own substitute', 'FORBIDDEN');
  const substituteId = Number(input.substituteId);
  if (!Number.isInteger(substituteId) || substituteId < 1) throw httpError(400, 'Choose a substitute', 'BAD_SUBSTITUTE');
  if (substituteId === userId) throw httpError(400, 'A person cannot substitute themselves', 'BAD_SUBSTITUTE');
  const startsOn = String(input.startsOn || '');
  const endsOn = String(input.endsOn || '');
  if (!DAY.test(startsOn) || !DAY.test(endsOn) || endsOn < startsOn) throw httpError(400, 'Choose the period', 'BAD_PERIOD');
  const { rows: users } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [[userId, substituteId]]);
  if (users.length !== 2) throw httpError(400, 'Choose an active person', 'BAD_SUBSTITUTE');
  const { rows } = await query(
    `INSERT INTO approval_substitutes (user_id, substitute_id, starts_on, ends_on, note, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, substituteId, startsOn, endsOn, String(input.note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200), ctx.user.id]
  );
  return rows[0].id;
}

export async function deleteSubstitute(ctx, id) {
  const { rows } = await query(`SELECT user_id, created_by FROM approval_substitutes WHERE id = $1`, [Number(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  if (rows[0].user_id !== ctx.user.id && !isApprovalsAdmin(ctx)) throw httpError(403, 'Not yours', 'FORBIDDEN');
  await query(`DELETE FROM approval_substitutes WHERE id = $1`, [Number(id)]);
}
