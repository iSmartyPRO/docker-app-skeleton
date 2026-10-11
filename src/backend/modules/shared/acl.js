import { query } from '../../config/database.js';
import { hasPermission } from '../../services/permissions.js';

/*
 * Flat access lists for module resources (task projects, calendars…).
 *
 * Levels: 0 none · 1 view · 2 edit · 3 manage. An entry grants a level to
 * everyone signed in, a user, a group or a role; a user's level on a resource
 * is the highest matching grant. Holders of the module's admin permission get
 * manage everywhere. Every table has the same shape:
 *   (resource_id, subject_type, subject_id, level)
 */

export const LEVEL = { none: 0, view: 1, edit: 2, manage: 3 };
export const LEVEL_NAMES = ['none', 'view', 'edit', 'manage'];
export const SUBJECT_TYPES = ['everyone', 'user', 'group', 'role'];

export function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function contextFromRequest(req, adminPermission) {
  const access = req.access || {};
  // An API token may be narrowed to some resources (see api/scopes.js);
  // a narrowed token never gets the module administrator's bypass.
  const limits = req.apiLimits || null;
  return {
    userId: req.user?.id || null,
    groupIds: new Set(access.groupIds || []),
    roleIds: new Set((access.roles || []).map((role) => role.id)),
    isAdmin: hasPermission(access.permissions || [], adminPermission) && !limits,
    limits,
  };
}

/** False when the context is narrowed to resources of `table` and `id` is not one of them. */
export function withinLimits(ctx, table, id) {
  const allowed = ctx?.limits?.[table];
  return !allowed || allowed.has(Number(id));
}

export function matches(entry, ctx) {
  switch (entry.subject_type) {
    case 'everyone':
      return Boolean(ctx.userId);
    case 'user':
      return entry.subject_id === ctx.userId;
    case 'group':
      return ctx.groupIds.has(entry.subject_id);
    case 'role':
      return ctx.roleIds.has(entry.subject_id);
    default:
      return false;
  }
}

export async function ensureAclTable(table, resourceTable) {
  await query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER NOT NULL REFERENCES ${resourceTable}(id) ON DELETE CASCADE,
      subject_type VARCHAR(16) NOT NULL,
      subject_id INTEGER,
      level SMALLINT NOT NULL
    )
  `);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_subject_key ON ${table} (resource_id, subject_type, COALESCE(subject_id, 0))`
  );
}

/** Level per resource id for this user, computed from one query. */
export async function levelMap(table, ctx) {
  const { rows } = await query(`SELECT resource_id, subject_type, subject_id, level FROM ${table}`);
  const levels = new Map();
  for (const entry of rows) {
    if (!matches(entry, ctx)) continue;
    levels.set(entry.resource_id, Math.max(levels.get(entry.resource_id) || 0, entry.level));
  }
  return {
    of: (id) => (!withinLimits(ctx, table, id) ? 0 : ctx.isAdmin ? LEVEL.manage : levels.get(id) || 0),
    visibleIds: () => [...levels.entries()].filter(([id, level]) => level >= LEVEL.view && withinLimits(ctx, table, id)).map(([id]) => id),
  };
}

export async function levelOn(table, resourceId, ctx) {
  if (!withinLimits(ctx, table, resourceId)) return 0;
  if (ctx.isAdmin) return LEVEL.manage;
  const { rows } = await query(`SELECT subject_type, subject_id, level FROM ${table} WHERE resource_id = $1`, [resourceId]);
  return rows.reduce((max, entry) => (matches(entry, ctx) ? Math.max(max, entry.level) : max), 0);
}

export function requireLevel(level, needed) {
  if (level < needed) {
    throw httpError(
      level === 0 ? 404 : 403,
      level === 0 ? 'Not found' : 'You do not have permission for this action',
      level === 0 ? 'NOT_FOUND' : 'FORBIDDEN'
    );
  }
}

export async function readAcl(table, resourceId) {
  const { rows } = await query(
    `SELECT a.subject_type, a.subject_id, a.level,
            u.display_name, u.username, g.name AS group_name, r.name AS role_name, r.key AS role_key, r.is_system
     FROM ${table} a
     LEFT JOIN users u ON a.subject_type = 'user' AND u.id = a.subject_id
     LEFT JOIN app_groups g ON a.subject_type = 'group' AND g.id = a.subject_id
     LEFT JOIN app_roles r ON a.subject_type = 'role' AND r.id = a.subject_id
     WHERE a.resource_id = $1
     ORDER BY a.level DESC, a.id`,
    [resourceId]
  );
  return rows.map((row) => ({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    level: LEVEL_NAMES[row.level],
    label:
      row.subject_type === 'user'
        ? row.display_name || row.username
        : row.subject_type === 'group'
          ? row.group_name
          : row.subject_type === 'role'
            ? row.role_name
            : null,
    roleKey: row.role_key || null,
    isSystemRole: Boolean(row.is_system),
  }));
}

export function cleanEntries(entries) {
  const clean = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const subjectType = SUBJECT_TYPES.includes(entry?.subjectType) ? entry.subjectType : null;
    const level = LEVEL[entry?.level];
    if (!subjectType || !level) continue;
    const subjectId = subjectType === 'everyone' ? null : Number(entry.subjectId);
    if (subjectType !== 'everyone' && !Number.isInteger(subjectId)) continue;
    const key = `${subjectType}:${subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ subjectType, subjectId, level });
  }
  return clean.slice(0, 200);
}

/**
 * Replaces a resource's entries. When the editor would lose manage on it,
 * they keep it as a personal entry — nobody locks themselves out.
 */
export async function writeAcl(client, table, resourceId, entries, ctx) {
  const clean = cleanEntries(entries);
  if (ctx && !ctx.isAdmin) {
    const keeps = clean.some(
      (entry) =>
        entry.level >= LEVEL.manage &&
        matches({ subject_type: entry.subjectType, subject_id: entry.subjectId }, ctx)
    );
    if (!keeps) {
      const mine = clean.find((entry) => entry.subjectType === 'user' && entry.subjectId === ctx.userId);
      if (mine) mine.level = LEVEL.manage;
      else clean.push({ subjectType: 'user', subjectId: ctx.userId, level: LEVEL.manage });
    }
  }
  await client.query(`DELETE FROM ${table} WHERE resource_id = $1`, [resourceId]);
  for (const entry of clean) {
    await client.query(
      `INSERT INTO ${table} (resource_id, subject_type, subject_id, level) VALUES ($1, $2, $3, $4)`,
      [resourceId, entry.subjectType, entry.subjectId, entry.level]
    );
  }
  return clean.length;
}

/** Active users who hold at least `minLevel` on a resource (expands groups and roles). */
export async function membersOf(table, resourceId, minLevel = LEVEL.view) {
  const { rows } = await query(
    `WITH grants AS (
       SELECT subject_type, subject_id FROM ${table} WHERE resource_id = $1 AND level >= $2
     ),
     ids AS (
       SELECT u.id FROM users u WHERE EXISTS (SELECT 1 FROM grants WHERE subject_type = 'everyone')
       UNION SELECT subject_id FROM grants WHERE subject_type = 'user'
       UNION SELECT m.user_id FROM user_group_members m JOIN grants g ON g.subject_type = 'group' AND g.subject_id = m.group_id
       UNION SELECT ur.user_id FROM user_roles ur JOIN grants g ON g.subject_type = 'role' AND g.subject_id = ur.role_id
       UNION SELECT m.user_id FROM user_group_members m
             JOIN group_roles gr ON gr.group_id = m.group_id
             JOIN grants g ON g.subject_type = 'role' AND g.subject_id = gr.role_id
     )
     SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
     FROM users u JOIN ids ON ids.id = u.id
     WHERE u.is_active IS NOT FALSE AND u.is_blocked IS NOT TRUE
     ORDER BY LOWER(COALESCE(u.display_name, u.username))`,
    [resourceId, minLevel]
  );
  return rows.map(userShape);
}

export function avatarOf(path) {
  return path ? `/uploads/avatars/${String(path).split('/').pop()}` : null;
}

export function userShape(row) {
  if (!row?.id) return null;
  return { id: row.id, username: row.username, name: row.name || row.username, avatarUrl: avatarOf(row.avatar_path) };
}

export async function listSubjects() {
  const [users, groups, roles] = await Promise.all([
    query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
       WHERE is_active IS NOT FALSE ORDER BY LOWER(COALESCE(display_name, username))`
    ),
    query(`SELECT id, name FROM app_groups ORDER BY LOWER(name)`),
    query(`SELECT id, key, name, is_system FROM app_roles ORDER BY sort, name`),
  ]);
  return {
    users: users.rows.map(userShape),
    groups: groups.rows,
    roles: roles.rows.map((row) => ({ id: row.id, key: row.key, name: row.name, isSystem: row.is_system })),
  };
}

export const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

export const intId = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  return n;
};

export function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export const HEX = /^#[0-9a-f]{6}$/i;
