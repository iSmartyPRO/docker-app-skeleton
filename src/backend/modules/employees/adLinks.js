import { query } from '../../config/database.js';
import { fullName } from './logic.js';

/*
 * The AD login of employee cards (employees.ad_account) for the AD directory
 * module («Каталог AD», a separate package): which cards hold a login, the link
 * picker, writing and clearing the login. Part of the public api.js, so the
 * directory never queries the employees tables itself. Rights are checked by the
 * caller (the directory asks for employees.hr / employees.view).
 */

const shape = (row) => ({ id: row.id, name: fullName(row), status: row.status, adAccount: row.ad_account || null, userId: row.user_id || null });

/** Cards whose AD login is one of `logins` (any case) or linked to one of `userIds`. */
export async function cardsForAdAccounts({ logins = [], userIds = [] } = {}) {
  const names = [...new Set(logins.filter(Boolean).map((value) => String(value).toLowerCase()))];
  const ids = [...new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!names.length && !ids.length) return [];
  const { rows } = await query(
    `SELECT id, last_name, first_name, middle_name, status, LOWER(ad_account) AS ad_account, user_id FROM employees
      WHERE LOWER(ad_account) = ANY($1::text[]) OR user_id = ANY($2::int[])`,
    [names, ids]
  );
  return rows.map(shape);
}

/** Cards whose name contains `text` (at least 2 characters), for the link picker. */
export async function findCardsByName(text, limit = 20) {
  const value = String(text || '').trim().slice(0, 60);
  if (value.length < 2) return [];
  const like = `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const { rows } = await query(
    `SELECT id, last_name, first_name, middle_name, status, ad_account, user_id FROM employees
      WHERE (last_name || ' ' || first_name || ' ' || COALESCE(middle_name, '')) ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1
      ORDER BY LOWER(last_name), LOWER(first_name) LIMIT $2`,
    [like, Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return rows.map(shape);
}

/** Writes the AD login into a card. → { id, name, before } or null when there is no such card. */
export async function setAdAccount(employeeId, login) {
  const { rows } = await query(
    `UPDATE employees e SET ad_account = $2, updated_at = NOW() FROM (SELECT id, ad_account FROM employees WHERE id = $1) old
      WHERE e.id = old.id RETURNING e.id, e.last_name, e.first_name, old.ad_account AS before`,
    [Number(employeeId) || 0, login == null ? null : String(login).slice(0, 200)]
  );
  return rows[0] ? { id: rows[0].id, name: `${rows[0].last_name} ${rows[0].first_name}`, before: rows[0].before || null } : null;
}

/** Clears the AD login of a card. → { before } or null when there is no such card. */
export async function clearAdAccount(employeeId) {
  const { rows } = await query(
    `UPDATE employees e SET ad_account = NULL, updated_at = NOW() FROM (SELECT id, ad_account FROM employees WHERE id = $1) old WHERE e.id = old.id RETURNING old.ad_account`,
    [Number(employeeId) || 0]
  );
  return rows[0] ? { before: rows[0].ad_account || null } : null;
}
