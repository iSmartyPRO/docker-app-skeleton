import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import bcrypt from 'bcryptjs';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { query, withTransaction } from '../config/database.js';
import { avatarDir } from '../config/paths.js';
import { LOCKED_ROLE } from './permissions.js';
import {
  NO_PASSWORD,
  assertSuperadminRemains,
  canManageTarget,
  defaultGroupId,
  getAccessMap,
  getUserAccess,
  hasSuperadmin,
  setUserAccess,
} from './rbac.js';

export async function ensureUsersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(255),
      password_hash TEXT NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(128)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(8) DEFAULT 'en'`);
  // NULL language = "as the portal": the default language from the settings.
  // The old default 'en' was never a choice, so it is cleared once.
  await query(`ALTER TABLE users ALTER COLUMN locale DROP DEFAULT`);
  const settingsTable = await query(`SELECT to_regclass('app_settings') AS t`);
  if (settingsTable.rows[0].t) {
    const done = await query(`SELECT 1 FROM app_settings WHERE key = 'users_locale_cleared'`);
    if (!done.rows.length) {
      await query(`UPDATE users SET locale = NULL WHERE locale = 'en'`);
      await query(`INSERT INTO app_settings (key, value) VALUES ('users_locale_cleared', 'true') ON CONFLICT (key) DO NOTHING`);
    }
  }
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(16) DEFAULT 'system'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);
  // Sign-in through integrations
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_source VARCHAR(16) NOT NULL DEFAULT 'local'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_method VARCHAR(16)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram VARCHAR(64)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mattermost VARCHAR(64)`);
  // Set by an administrator, a directory or Google, or proven by an email code.
  // Only trusted addresses may link a Google account automatically.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_trusted BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_key ON users (telegram_id) WHERE telegram_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email))`);
  await query(`CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone)`);
}

const USER_COLUMNS = `
  id, username, email, display_name, avatar_path, locale, theme,
  role, is_active, is_blocked, last_login_at, token_version, created_at, updated_at,
  phone, telegram_id, telegram_username, instagram, mattermost, auth_source, external_id, last_login_method, email_trusted,
  (password_hash LIKE '$2%') AS has_password
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function assertUsername(username) {
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) {
    throw httpError(400, 'Username must be 3–32 characters: letters, digits, dot, underscore or hyphen');
  }
  return name;
}

export function assertPassword(password) {
  const pass = String(password || '');
  if (pass.length < 10 || pass.length > 200) {
    throw httpError(400, 'Password must be 10–200 characters');
  }
  return pass;
}

function normalizeEmail(email) {
  if (email == null || email === '') return null;
  const value = String(email).trim().slice(0, 255);
  if (!EMAIL_RE.test(value)) throw httpError(400, 'Email is not valid');
  return value;
}

/**
 * International (E.164) phone: "+996 700 12-34-56" → "+996700123456".
 * Validated against real numbering plans, so a missing digit is caught on
 * save instead of silently breaking WhatsApp sign-in codes later.
 */
export function normalizePhone(phone) {
  if (phone == null || phone === '') return null;
  const digits = String(phone).replace(/\D/g, '');
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (!parsed || !parsed.isValid()) {
    throw httpError(400, 'Phone number is not valid. Use the international format, e.g. +996 700 123 456');
  }
  return parsed.number;
}

export function isValidPhone(phone) {
  if (!phone) return true;
  return Boolean(parsePhoneNumberFromString(String(phone))?.isValid());
}

export function avatarUrl(path) {
  if (!path) return null;
  return `/uploads/avatars/${basename(path)}`;
}

const EMPTY_ACCESS = { roles: [], groups: [], permissions: [], roleIds: [], groupIds: [] };

export function toPublicUser(user, access = EMPTY_ACCESS) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone || null,
    phoneValid: isValidPhone(user.phone),
    instagram: user.instagram || null,
    mattermost: user.mattermost || null,
    displayName: user.display_name || user.username,
    avatarUrl: avatarUrl(user.avatar_path),
    // null = follow the portal's default language
    locale: user.locale || null,
    theme: user.theme || 'system',
    authSource: user.auth_source || 'local',
    hasPassword: Boolean(user.has_password),
    telegram: user.telegram_id
      ? { id: String(user.telegram_id), username: user.telegram_username || null }
      : null,
    roles: access.roles,
    groups: access.groups,
    permissions: access.permissions,
    createdAt: user.created_at,
  };
}

export function toAdminUser(user, access = EMPTY_ACCESS) {
  if (!user) return null;
  return {
    ...toPublicUser(user, access),
    roleIds: access.roleIds,
    groupIds: access.groupIds,
    isActive: user.is_active !== false,
    isBlocked: user.is_blocked === true,
    lastLoginAt: user.last_login_at,
    lastLoginMethod: user.last_login_method || null,
    updatedAt: user.updated_at,
  };
}

export async function countUsers() {
  try {
    const result = await query('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0].count;
  } catch (err) {
    if (err.code === '42P01') return 0;
    throw err;
  }
}

/** Setup is complete once a super administrator exists (or a legacy admin before migration). */
export async function hasAdminUser() {
  try {
    if (await hasSuperadmin()) return true;
    const legacy = await query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`);
    return legacy.rows[0].count > 0;
  } catch (err) {
    if (err.code === '42P01') return false;
    throw err;
  }
}

export async function findUserByUsername(username) {
  const result = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users
     WHERE LOWER(username) = LOWER($1)
     ORDER BY (username = $1) DESC
     LIMIT 1`,
    [username]
  );
  return result.rows[0] || null;
}

export async function findUserByEmail(email) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(email) = LOWER($1) ORDER BY id LIMIT 2`,
    [String(email || '').trim()]
  );
  // Ambiguous addresses are treated as unknown rather than guessing.
  return result.rows.length === 1 ? result.rows[0] : null;
}

export async function findUserByPhone(phone) {
  let normalized;
  try {
    normalized = normalizePhone(phone);
  } catch {
    return null;
  }
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE phone = $1 ORDER BY id LIMIT 2`, [
    normalized,
  ]);
  return result.rows.length === 1 ? result.rows[0] : null;
}

/** Telegram username of an account that has linked Telegram (so the bot can write to it). */
export async function findUserByTelegramUsername(username) {
  const name = String(username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(name)) return null;
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE LOWER(telegram_username) = LOWER($1) AND telegram_id IS NOT NULL LIMIT 1`,
    [name]
  );
  return result.rows[0] || null;
}

export function normalizeInstagram(value) {
  if (value == null || value === '') return null;
  const name = String(value).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(name)) throw httpError(400, 'Instagram username is not valid');
  return name.toLowerCase();
}

/** Mattermost usernames: lowercase letters, digits, dot, dash, underscore. */
export function normalizeMattermost(value) {
  if (value == null || value === '') return null;
  const name = String(value).trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,63}$/.test(name)) throw httpError(400, 'Mattermost username is not valid');
  return name;
}

export async function findUserByMattermost(username) {
  let name;
  try {
    name = normalizeMattermost(username);
  } catch {
    return null;
  }
  if (!name) return null;
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE mattermost = $1 ORDER BY id LIMIT 2`, [name]);
  return result.rows.length === 1 ? result.rows[0] : null;
}

export async function findUserByTelegramId(telegramId) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE telegram_id = $1 LIMIT 1`, [
    String(telegramId),
  ]);
  return result.rows[0] || null;
}

export async function findUserByExternalId(source, externalId) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE auth_source = $1 AND LOWER(external_id) = LOWER($2) LIMIT 1`,
    [source, externalId]
  );
  return result.rows[0] || null;
}

export async function findUserById(id, client = { query }) {
  const result = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

/** User row plus effective access, shaped for the API. */
export async function getAdminUser(id) {
  const user = await findUserById(id);
  if (!user) return null;
  return toAdminUser(user, await getUserAccess(user.id));
}

export async function getSessionUser(id) {
  const user = await findUserById(id);
  if (!user) return null;
  return { row: user, access: await getUserAccess(user.id) };
}

export async function listUsers() {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users ORDER BY id ASC`);
  const access = await getAccessMap(result.rows.map((row) => row.id));
  return result.rows.map((row) => toAdminUser(row, access.get(row.id)));
}

/** First account, created by the setup wizard: always a super administrator. */
export async function createAdminUser({ username, email, password }) {
  const existing = await countUsers();
  if (existing > 0 && (await hasAdminUser())) {
    throw httpError(403, 'Admin user already exists. Setup is complete.');
  }
  const name = assertUsername(username);
  const passwordHash = await bcrypt.hash(assertPassword(password), 12);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (username, email, password_hash, role, display_name, email_trusted)
       VALUES ($1, $2, $3, 'admin', $1, TRUE)
       RETURNING ${USER_COLUMNS}`,
      [name, normalizeEmail(email), passwordHash]
    );
    const user = result.rows[0];
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM app_roles WHERE key = $2 ON CONFLICT DO NOTHING`,
      [user.id, LOCKED_ROLE]
    );
    return toPublicUser(user, await getUserAccess(user.id, client));
  });
}

/**
 * Admin-created account. The password is optional: accounts that sign in only
 * through Active Directory, Telegram or one-time codes do not need one.
 * Without explicit groups the user joins the default group.
 */
export async function createUser(input, actor) {
  const name = assertUsername(input.username);
  const passwordHash = input.password ? await bcrypt.hash(assertPassword(input.password), 12) : NO_PASSWORD;
  try {
    return await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, role, display_name, phone, instagram, mattermost, email_trusted)
         VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, TRUE)
         RETURNING ${USER_COLUMNS}`,
        [
          name,
          normalizeEmail(input.email),
          passwordHash,
          String(input.displayName || name).slice(0, 128),
          normalizePhone(input.phone),
          normalizeInstagram(input.instagram),
          normalizeMattermost(input.mattermost),
        ]
      );
      const user = result.rows[0];
      let groupIds = input.groupIds;
      if (groupIds === undefined) {
        const fallback = await defaultGroupId(client);
        groupIds = fallback ? [fallback] : [];
      }
      await setUserAccess(client, { userId: user.id, roleIds: input.roleIds, groupIds, actor });
      return toAdminUser(user, await getUserAccess(user.id, client));
    });
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'Username already exists');
    throw err;
  }
}

/** Account created on first sign-in through Active Directory or Telegram. */
export async function provisionExternalUser(client, { username, displayName, email, source, externalId, telegram, groupIds }) {
  let candidate = String(username || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 28);
  if (candidate.length < 3) candidate = `${source}-user`;
  let name = candidate;
  for (let i = 2; ; i += 1) {
    const taken = await client.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`, [name]);
    if (!taken.rows.length) break;
    name = `${candidate}${i}`;
  }
  let safeEmail = null;
  try {
    safeEmail = normalizeEmail(email);
  } catch {
    safeEmail = null;
  }
  const result = await client.query(
    `INSERT INTO users (username, email, password_hash, role, display_name, auth_source, external_id,
                        telegram_id, telegram_username, email_trusted)
     VALUES ($1, $2::varchar, $3, 'user', $4, $5, $6, $7, $8, $2::varchar IS NOT NULL)
     RETURNING ${USER_COLUMNS}`,
    [
      name,
      safeEmail,
      NO_PASSWORD,
      String(displayName || name).slice(0, 128),
      source,
      externalId || null,
      telegram?.id || null,
      telegram?.username || null,
    ]
  );
  const user = result.rows[0];
  // Everyone joins the default group; directory mappings add more.
  const groups = [...new Set([await defaultGroupId(client), ...(groupIds || [])].filter(Boolean))];
  await setUserAccess(client, { userId: user.id, groupIds: groups, actor: null });
  return user;
}

/** Keeps directory-sourced profile fields in sync on every sign-in. */
export async function syncExternalProfile(id, { displayName, email }) {
  let safeEmail;
  try {
    safeEmail = normalizeEmail(email);
  } catch {
    safeEmail = undefined;
  }
  await query(
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       email = COALESCE($3, email),
       email_trusted = CASE WHEN $3::text IS NULL THEN email_trusted ELSE TRUE END,
       updated_at = NOW()
     WHERE id = $1`,
    [id, displayName ? String(displayName).slice(0, 128) : null, safeEmail || null]
  );
}

/**
 * One entry point for every user edit.
 *  - `actor` set: an administrator acting through the console. They must be
 *    allowed to manage the target, and cannot change their own status/access.
 *  - no `actor`: the user editing their own profile (cabinet).
 * Status, password and access changes sign the user out everywhere.
 */
export async function updateUser(id, patch, { actor = null } = {}) {
  return withTransaction(async (client) => {
    const user = await findUserById(id, client);
    if (!user) throw httpError(404, 'User not found');
    const isSelf = !actor || Number(actor.id) === Number(id);
    const access = await getUserAccess(id, client);

    if (actor && !isSelf && !canManageTarget(actor, access.permissions)) {
      throw httpError(403, 'You cannot manage a user with more access than you have');
    }
    if (actor && isSelf) {
      const statusChange =
        (typeof patch.isActive === 'boolean' && patch.isActive !== (user.is_active !== false)) ||
        (typeof patch.isBlocked === 'boolean' && patch.isBlocked !== (user.is_blocked === true));
      if (statusChange) throw httpError(400, 'You cannot disable or block your own account');
    }

    const fields = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (patch.email !== undefined) {
      const email = normalizeEmail(patch.email);
      const byAdmin = Boolean(actor && !isSelf);
      if ((email || null) !== (user.email || null)) {
        add('email', email);
        // Self-entered addresses are unverified until proven by an email code.
        add('email_trusted', byAdmin);
      } else if (byAdmin && email && !user.email_trusted) {
        // An administrator saving the address vouches for it.
        add('email_trusted', true);
      }
    }
    if (patch.displayName !== undefined) add('display_name', String(patch.displayName).slice(0, 128));
    if (patch.phone !== undefined) add('phone', normalizePhone(patch.phone));
    if (patch.instagram !== undefined) add('instagram', normalizeInstagram(patch.instagram));
    if (patch.mattermost !== undefined) add('mattermost', normalizeMattermost(patch.mattermost));
    if (patch.locale === 'en' || patch.locale === 'ru') add('locale', patch.locale);
    else if (patch.locale === null || patch.locale === '' || patch.locale === 'auto') add('locale', null);
    if (['light', 'dark', 'system'].includes(patch.theme)) add('theme', patch.theme);

    let revoke = false;
    if (actor && !isSelf) {
      if (typeof patch.isActive === 'boolean' && patch.isActive !== (user.is_active !== false)) {
        add('is_active', patch.isActive);
        revoke ||= patch.isActive === false;
      }
      if (typeof patch.isBlocked === 'boolean' && patch.isBlocked !== (user.is_blocked === true)) {
        add('is_blocked', patch.isBlocked);
        revoke ||= patch.isBlocked === true;
      }
    }
    if (patch.password) {
      add('password_hash', await bcrypt.hash(assertPassword(patch.password), 12));
      revoke = true;
    }

    if (actor && !isSelf && (patch.roleIds !== undefined || patch.groupIds !== undefined)) {
      const before = JSON.stringify(access.permissions);
      await setUserAccess(client, {
        userId: id,
        roleIds: patch.roleIds,
        groupIds: patch.groupIds,
        actor,
      });
      const after = await getUserAccess(id, client);
      revoke ||= JSON.stringify(after.permissions) !== before;
    } else if (actor && isSelf && (patch.roleIds !== undefined || patch.groupIds !== undefined)) {
      const same =
        (patch.roleIds === undefined || sameIds(patch.roleIds, access.roleIds)) &&
        (patch.groupIds === undefined || sameIds(patch.groupIds, access.groupIds));
      if (!same) throw httpError(400, 'You cannot change your own roles or groups');
    }

    if (revoke) add('token_version', Number(user.token_version || 0) + 1);

    if (fields.length) {
      values.push(id);
      await client.query(
        `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
        values
      );
    }
    await assertSuperadminRemains(client);
    const fresh = await findUserById(id, client);
    return toAdminUser(fresh, await getUserAccess(id, client));
  });
}

function sameIds(a, b) {
  const left = [...new Set((a || []).map(Number))].sort();
  const right = [...new Set((b || []).map(Number))].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function changePassword(id, currentPassword, nextPassword) {
  const result = await query(`SELECT id, password_hash FROM users WHERE id = $1`, [id]);
  const user = result.rows[0];
  if (!user) throw httpError(404, 'User not found');
  // Accounts without a local password (SSO / invited) can set their first one.
  if (user.password_hash.startsWith('$2')) {
    const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
    if (!ok) throw httpError(400, 'Current password is incorrect');
  }
  return updateUser(id, { password: nextPassword });
}

/** Throws unless `actor` may act on user `id` (self is always allowed). */
export async function assertCanManage(actor, id) {
  if (Number(actor.id) === Number(id)) return;
  const access = await getUserAccess(id);
  if (!canManageTarget(actor, access.permissions)) {
    throw httpError(403, 'You cannot manage a user with more access than you have');
  }
}

export async function setAvatar(id, filename) {
  const user = await findUserById(id);
  if (!user) throw httpError(404, 'User not found');
  if (user.avatar_path) {
    await unlink(join(avatarDir, basename(user.avatar_path))).catch(() => {});
  }
  await query(`UPDATE users SET avatar_path = $1, updated_at = NOW() WHERE id = $2`, [filename, id]);
  return getAdminUser(id);
}

/** Invalidates every issued session cookie for the user. */
export async function revokeSessions(id) {
  const result = await query(
    `UPDATE users SET token_version = token_version + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id]
  );
  if (!result.rows[0]) throw httpError(404, 'User not found');
  return result.rows[0];
}

export async function linkTelegram(id, telegram) {
  try {
    await query(
      `UPDATE users SET telegram_id = $2, telegram_username = $3, updated_at = NOW() WHERE id = $1`,
      [id, String(telegram.id), telegram.username || null]
    );
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'This Telegram account is already linked to another user');
    throw err;
  }
}

export async function unlinkTelegram(id) {
  await query(
    `UPDATE users SET telegram_id = NULL, telegram_username = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function getUserStats() {
  const result = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_blocked IS TRUE)::int AS blocked,
      COUNT(*) FILTER (WHERE is_active IS FALSE)::int AS disabled,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days')::int AS active30d
    FROM users
  `);
  const ids = await query(`SELECT id FROM users`);
  const access = await getAccessMap(ids.rows.map((row) => row.id));
  let staff = 0;
  let superadmins = 0;
  for (const entry of access.values()) {
    if (entry.permissions.includes('*')) superadmins += 1;
    if (entry.permissions.includes('*') || entry.permissions.includes('console.access')) staff += 1;
  }
  const groups = await query(`SELECT COUNT(*)::int AS count FROM app_groups`);
  return { ...result.rows[0], staff, superadmins, admins: staff, groups: groups.rows[0].count };
}

export async function recentLogins(limit = 6) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE last_login_at IS NOT NULL
     ORDER BY last_login_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => toAdminUser(row));
}

export async function markLogin(id, method = 'password') {
  await query(`UPDATE users SET last_login_at = NOW(), last_login_method = $2 WHERE id = $1`, [
    id,
    String(method).slice(0, 16),
  ]);
}

export async function deleteUser(id, actor) {
  if (Number(id) === Number(actor.id)) throw httpError(400, 'You cannot delete your own account');
  const avatar = await withTransaction(async (client) => {
    const user = await findUserById(id, client);
    if (!user) throw httpError(404, 'User not found');
    const access = await getUserAccess(id, client);
    if (!canManageTarget(actor, access.permissions)) {
      throw httpError(403, 'You cannot delete a user with more access than you have');
    }
    await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    await assertSuperadminRemains(client);
    return user.avatar_path;
  });
  if (avatar) await unlink(join(avatarDir, basename(avatar))).catch(() => {});
}
