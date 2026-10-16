import { query, withTransaction } from '../../config/database.js';
import { assertCanManage, createUser, isValidPhone, normalizePhone, updateUser } from '../../services/users.js';
import { recordSecurityEvent } from '../../services/security.js';
import { emitEvent } from '../../api/events.js';
import { hasPermission } from '../../services/permissions.js';
import { assertHr, rightsOf } from './access.js';
import { getEmployee, logEvent, syncUser } from './service.js';
import { fullName, httpError, intOrNull } from './logic.js';

/*
 * The employee ↔ portal account link (docs/employees.md → Portal accounts).
 * The link is optional: a builder without portal access has none.
 *
 *   create  a new account from the card in one step (users.manage + employees.hr):
 *           the same createUser() as Users → «Add user» (password rules, unique
 *           contacts, «you cannot grant more than you hold»), then the link
 *   link    an existing account without a card (employees.hr + users.manage,
 *           and not an account with more access than yours: the card then
 *           sets its unit and position, which decide its approvers)
 *   unlink  the card and the account go separate ways; nothing is deleted
 *           (the same rights as linking)
 *   block   block / unblock the linked account (users.manage), offered on termination
 *
 * A linked account follows the card: unit and position (users.org_unit_id,
 * users.position_title) are kept in sync.
 */

export const SIGN_IN_METHODS = ['password', 'code', 'directory'];

const audit = (req, detail) => recordSecurityEvent({ kind: 'employee_account', severity: 'info', username: req?.user?.username, ip: req?.ip, detail }).catch(() => {});

async function cardRow(id) {
  const { rows } = await query(`SELECT * FROM employees WHERE id = $1`, [intOrNull(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  return rows[0];
}

function actorOf(req) {
  if (req.actor) return req.actor;
  return { id: req.user.id, permissions: new Set(req.access?.permissions || []) };
}

/** A username suggestion from the card: «ivanov.i» from «Иванов Иван». */
export function suggestUsername(row) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const latin = (value) => String(value || '').toLowerCase().split('').map((ch) => map[ch] ?? ch).join('').replace(/[^a-z0-9]/g, '');
  const base = [latin(row.last_name), latin(row.first_name).slice(0, 1)].filter(Boolean).join('.');
  return (base || 'user').slice(0, 30);
}

/**
 * Creates a portal account for the employee and links it. `method`:
 *   password   the password is set now (≥ 10 characters)
 *   code       no password: one-time codes by e-mail / phone (needs one of them)
 *   directory  no password: the first Active Directory sign-in with this username takes it over
 */
export async function createAccount(req, id, input = {}) {
  const rights = await rightsOf(req);
  assertHr(rights);
  if (!hasPermission(rights.perms, 'users.manage')) throw httpError(403, 'Creating accounts needs the users.manage permission', 'FORBIDDEN');
  const row = await cardRow(id);
  if (row.user_id) throw httpError(409, 'The employee already has a portal account', 'ALREADY_LINKED');
  const method = SIGN_IN_METHODS.includes(input.method) ? input.method : 'password';
  const email = String(input.email ?? row.work_email ?? '').trim() || null;
  const cardPhones = [row.work_mobile, row.work_phone].filter(Boolean);
  let phone = String(input.phone ?? cardPhones[0] ?? '').trim() || null;
  if (phone) {
    let valid = false;
    try {
      valid = Boolean(normalizePhone(phone)) && isValidPhone(normalizePhone(phone));
    } catch {
      valid = false;
    }
    // A phone copied from the card that is not a real number is left out; a typed one must be valid.
    if (!valid) {
      if (cardPhones.includes(phone)) phone = null;
      else throw httpError(400, 'The phone is not a valid number: use the international format, e.g. +996 700 123 456', 'BAD_PHONE', { field: 'phone' });
    }
  }
  if (method === 'password' && !input.password) throw httpError(400, 'Set a password or choose another sign-in method', 'PASSWORD_REQUIRED', { field: 'password' });
  if (method === 'code' && !email && !phone) throw httpError(400, 'One-time codes need an e-mail or a phone', 'CONTACT_REQUIRED', { field: 'email' });
  const user = await createUser(
    {
      username: input.username || suggestUsername(row),
      email,
      phone,
      password: method === 'password' ? input.password : undefined,
      displayName: fullName(row),
      roleIds: Array.isArray(input.roleIds) ? input.roleIds : undefined,
      groupIds: Array.isArray(input.groupIds) ? input.groupIds : undefined,
    },
    actorOf(req)
  );
  try {
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(`UPDATE employees SET user_id = $2, updated_at = NOW() WHERE id = $1 AND user_id IS NULL`, [row.id, user.id]);
      if (!rowCount) throw httpError(409, 'The employee already has a portal account', 'ALREADY_LINKED');
      await syncUser(client, row.id);
      await logEvent(client, row.id, 'account_created', req.user?.id || null, { userId: user.id, username: user.username, method });
    });
  } catch (err) {
    // The account was made a moment ago for this card only: take it back.
    await query(`DELETE FROM users WHERE id = $1`, [user.id]).catch(() => {});
    throw err;
  }
  audit(req, `created account ${user.username} for employee #${row.id}`);
  emitEvent('user.created', { data: { user, actorId: req.user?.id || null }, visible: (r) => hasPermission(r.access?.permissions || [], 'users.view') }).catch?.(() => {});
  return { ...(await getEmployee(req, row.id)), created: { id: user.id, username: user.username, method } };
}

/** Linking and unlinking change an account (its unit, position and so its approvers): HR + users.manage, within your own access. */
async function assertAccountRights(req, rights, userId) {
  assertHr(rights);
  if (!hasPermission(rights.perms, 'users.manage')) throw httpError(403, 'Linking accounts needs the users.manage permission', 'FORBIDDEN');
  if (userId && req.system !== true) await assertCanManage(actorOf(req), userId);
}

export async function linkAccount(req, id, { userId } = {}) {
  const rights = await rightsOf(req);
  await assertAccountRights(req, rights, null);
  const row = await cardRow(id);
  const target = intOrNull(userId);
  if (!target) throw httpError(400, 'Choose an account', 'USER_REQUIRED', { field: 'userId' });
  const { rows } = await query(`SELECT id, username FROM users WHERE id = $1`, [target]);
  if (!rows[0]) throw httpError(404, 'Account not found', 'NOT_FOUND');
  await assertAccountRights(req, rights, target);
  const { rows: other } = await query(`SELECT id, last_name, first_name, middle_name FROM employees WHERE user_id = $1 AND id <> $2`, [target, row.id]);
  if (other[0]) throw httpError(409, `The account is linked to ${fullName(other[0])}`, 'USER_LINKED', { employeeId: other[0].id, name: fullName(other[0]) });
  await withTransaction(async (client) => {
    await client.query(`UPDATE employees SET user_id = $2, updated_at = NOW() WHERE id = $1`, [row.id, target]);
    await syncUser(client, row.id);
    await logEvent(client, row.id, 'account_linked', req.user?.id || null, { userId: target, username: rows[0].username, previous: row.user_id || null });
  });
  audit(req, `linked account ${rows[0].username} to employee #${row.id}`);
  return getEmployee(req, row.id);
}

export async function unlinkAccount(req, id) {
  const rights = await rightsOf(req);
  await assertAccountRights(req, rights, null);
  const row = await cardRow(id);
  if (!row.user_id) return getEmployee(req, row.id);
  await assertAccountRights(req, rights, row.user_id);
  await withTransaction(async (client) => {
    await client.query(`UPDATE employees SET user_id = NULL, updated_at = NOW() WHERE id = $1`, [row.id]);
    await logEvent(client, row.id, 'account_unlinked', req.user?.id || null, { userId: row.user_id });
  });
  audit(req, `unlinked account #${row.user_id} from employee #${row.id}`);
  return getEmployee(req, row.id);
}

/** Blocks (or unblocks) the linked account: the Users rules apply (users.manage, no one above you, not yourself). */
export async function blockAccount(req, id, { blocked = true } = {}) {
  const rights = await rightsOf(req);
  assertHr(rights);
  if (!hasPermission(rights.perms, 'users.manage')) throw httpError(403, 'Blocking accounts needs the users.manage permission', 'FORBIDDEN');
  const row = await cardRow(id);
  if (!row.user_id) throw httpError(409, 'The employee has no portal account', 'NOT_LINKED');
  await updateUser(row.user_id, { isBlocked: Boolean(blocked) }, { actor: actorOf(req) });
  await logEvent({ query }, row.id, blocked ? 'account_blocked' : 'account_unblocked', req.user?.id || null, { userId: row.user_id });
  audit(req, `${blocked ? 'blocked' : 'unblocked'} account #${row.user_id} of employee #${row.id}`);
  return getEmployee(req, row.id);
}

/** Accounts without a card, for «Связать с пользователем». */
export async function unlinkedAccounts(req, q = '') {
  const rights = await rightsOf(req);
  assertHr(rights);
  const text = String(q || '').trim().slice(0, 80);
  const { rows } = await query(
    `SELECT u.id, u.username, u.email, COALESCE(u.display_name, u.username) AS name, u.is_blocked FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
       AND ($1 = '' OR u.display_name ILIKE '%' || $1 || '%' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
     ORDER BY LOWER(COALESCE(u.display_name, u.username)) LIMIT 50`,
    [text]
  );
  return rows.map((row) => ({ id: row.id, username: row.username, email: row.email || null, name: row.name, isBlocked: row.is_blocked === true }));
}
