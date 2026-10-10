import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { avatarDir } from '../config/paths.js';

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
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(16) DEFAULT 'system'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);
}

const USER_COLUMNS = `
  id, username, email, display_name, avatar_path, locale, theme,
  role, is_active, is_blocked, last_login_at, token_version, created_at, updated_at
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function assertUsername(username) {
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) {
    const error = new Error('Username must be 3–32 characters: letters, digits, dot, underscore or hyphen');
    error.statusCode = 400;
    throw error;
  }
  return name;
}

export function assertPassword(password) {
  const pass = String(password || '');
  if (pass.length < 10 || pass.length > 200) {
    const error = new Error('Password must be 10–200 characters');
    error.statusCode = 400;
    throw error;
  }
  return pass;
}

function normalizeEmail(email) {
  if (email == null || email === '') return null;
  const value = String(email).trim().slice(0, 255);
  if (!EMAIL_RE.test(value)) {
    const error = new Error('Email is not valid');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export function avatarUrl(path) {
  if (!path) return null;
  return `/uploads/avatars/${basename(path)}`;
}

export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name || user.username,
    avatarUrl: avatarUrl(user.avatar_path),
    locale: user.locale || 'en',
    theme: user.theme || 'system',
    role: user.role,
    createdAt: user.created_at,
  };
}

export function toAdminUser(user) {
  if (!user) return null;
  return {
    ...toPublicUser(user),
    isActive: user.is_active !== false,
    isBlocked: user.is_blocked === true,
    lastLoginAt: user.last_login_at,
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

export async function hasAdminUser() {
  try {
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`
    );
    return result.rows[0].count > 0;
  } catch (err) {
    if (err.code === '42P01') return false;
    throw err;
  }
}

export async function findUserByUsername(username) {
  const result = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function listUsers() {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY id ASC`
  );
  return result.rows.map(toAdminUser);
}

export async function createAdminUser({ username, email, password }) {
  await ensureUsersTable();

  const existing = await countUsers();
  if (existing > 0) {
    const error = new Error('Admin user already exists. Setup is complete.');
    error.statusCode = 403;
    throw error;
  }

  const name = assertUsername(username);
  const passwordHash = await bcrypt.hash(assertPassword(password), 12);
  const result = await query(
    `
    INSERT INTO users (username, email, password_hash, role, display_name)
    VALUES ($1, $2, $3, 'admin', $1)
    RETURNING ${USER_COLUMNS}
    `,
    [name, normalizeEmail(email), passwordHash]
  );

  return toPublicUser(result.rows[0]);
}

export async function createUser({
  username,
  email,
  password,
  role = 'user',
  displayName,
}) {
  const name = assertUsername(username);
  const pass = assertPassword(password);
  const nextRole = role === 'admin' ? 'admin' : 'user';

  const passwordHash = await bcrypt.hash(pass, 12);
  try {
    const result = await query(
      `
      INSERT INTO users (username, email, password_hash, role, display_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${USER_COLUMNS}
      `,
      [name, normalizeEmail(email), passwordHash, nextRole, displayName || name]
    );
    return toAdminUser(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const error = new Error('Username already exists');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function countActiveAdmins() {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM users
     WHERE role = 'admin' AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`
  );
  return result.rows[0].count;
}

function isActiveAdmin(user) {
  return user.role === 'admin' && user.is_active !== false && user.is_blocked !== true;
}

/**
 * Admin edits must never leave the project without a working administrator,
 * and an admin cannot demote, disable or block their own account.
 */
async function assertAdminSafety(user, patch, actorId) {
  const demotes = patch.role === 'user';
  const disables = patch.isActive === false;
  const blocks = patch.isBlocked === true;
  if (!demotes && !disables && !blocks) return;

  if (actorId != null && Number(actorId) === Number(user.id)) {
    throw badRequest('You cannot demote, disable or block your own account');
  }
  if (isActiveAdmin(user) && (await countActiveAdmins()) <= 1) {
    throw badRequest('This is the last active administrator');
  }
}

export async function updateUser(id, patch, { allowRole = false, actorId = null } = {}) {
  const user = await findUserById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  if (allowRole) await assertAdminSafety(user, patch, actorId);

  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (patch.email !== undefined) add('email', normalizeEmail(patch.email));
  if (patch.displayName !== undefined) {
    add('display_name', String(patch.displayName).slice(0, 128));
  }
  if (patch.locale === 'en' || patch.locale === 'ru') add('locale', patch.locale);
  if (['light', 'dark', 'system'].includes(patch.theme)) add('theme', patch.theme);
  if (allowRole && (patch.role === 'admin' || patch.role === 'user')) {
    add('role', patch.role);
  }
  if (allowRole && typeof patch.isActive === 'boolean') add('is_active', patch.isActive);
  if (allowRole && typeof patch.isBlocked === 'boolean') add('is_blocked', patch.isBlocked);
  const revokes =
    Boolean(patch.password) ||
    (allowRole && patch.role && patch.role !== user.role) ||
    (allowRole && patch.isActive === false) ||
    (allowRole && patch.isBlocked === true);
  if (patch.password) {
    add('password_hash', await bcrypt.hash(assertPassword(patch.password), 12));
  }
  if (revokes) add('token_version', Number(user.token_version || 0) + 1);

  if (!fields.length) return toAdminUser(user);

  values.push(id);
  const result = await query(
    `
    UPDATE users
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $${values.length}
    RETURNING ${USER_COLUMNS}
    `,
    values
  );
  return toAdminUser(result.rows[0]);
}

export async function changePassword(id, currentPassword, nextPassword) {
  const result = await query(
    `SELECT id, password_hash FROM users WHERE id = $1`,
    [id]
  );
  const user = result.rows[0];
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
  if (!ok) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 400;
    throw error;
  }
  return updateUser(id, { password: nextPassword });
}

export async function setAvatar(id, filename) {
  const user = await findUserById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  if (user.avatar_path) {
    await unlink(join(avatarDir, basename(user.avatar_path))).catch(() => {});
  }
  const result = await query(
    `
    UPDATE users SET avatar_path = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING ${USER_COLUMNS}
    `,
    [filename, id]
  );
  return toAdminUser(result.rows[0]);
}

/** Invalidates every issued session cookie for the user. */
export async function revokeSessions(id) {
  const result = await query(
    `UPDATE users SET token_version = token_version + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id]
  );
  if (!result.rows[0]) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

export async function getUserStats() {
  const result = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
      COUNT(*) FILTER (WHERE is_blocked IS TRUE)::int AS blocked,
      COUNT(*) FILTER (WHERE is_active IS FALSE)::int AS disabled,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days')::int AS active30d
    FROM users
  `);
  return result.rows[0];
}

export async function recentLogins(limit = 6) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE last_login_at IS NOT NULL
     ORDER BY last_login_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(toAdminUser);
}

export async function markLogin(id) {
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id]);
}

export async function deleteUser(id, actorId) {
  if (Number(id) === Number(actorId)) {
    const error = new Error('You cannot delete your own account');
    error.statusCode = 400;
    throw error;
  }
  const user = await findUserById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  if (isActiveAdmin(user) && (await countActiveAdmins()) <= 1) {
    throw badRequest('Cannot delete the last administrator');
  }
  if (user.avatar_path) {
    await unlink(join(avatarDir, basename(user.avatar_path))).catch(() => {});
  }
  await query(`DELETE FROM users WHERE id = $1`, [id]);
}
