import { query } from '../../config/database.js';
import { hasPermission } from '../../services/permissions.js';

/*
 * Knowledge-base access.
 *
 * Levels: 0 none · 1 view · 2 edit · 3 manage.
 * An entry grants a level to everyone, a user, a group or a role on:
 *   root   — the whole base
 *   folder — a folder; with inherit_access it also gets its parent's level
 *   item   — a material; without inherit_access only its own entries apply
 * A user's level is the highest matching grant. `kb.admin` means manage
 * everywhere.
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

/** Who is asking: built from the session (or a share for public visitors). */
export function contextFromRequest(req) {
  const access = req.access || {};
  return {
    userId: req.user?.id || null,
    groupIds: new Set(access.groupIds || []),
    roleIds: new Set((access.roles || []).map((role) => role.id)),
    isAdmin: hasPermission(access.permissions || [], 'kb.admin'),
    // An API token's resource limits travel along: the KB reaches Files
    // (uploads into My files, files picked from Files, file materials).
    limits: req.apiLimits || null,
  };
}

/** A token narrowed to some Files spaces reaches only files inside them through the KB too. */
export function fileWithinLimits(ctx, node) {
  const narrowed = ctx?.limits?.fs_space_acl;
  return !narrowed || Boolean(node?.space_id && narrowed.has(Number(node.space_id)));
}

function matches(entry, ctx) {
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

/**
 * Loads folders and ACL once per request; levels are then computed in memory
 * (memoised), so listing a folder never costs a query per child.
 */
export async function loadAccess(ctx) {
  const [folders, acl] = await Promise.all([
    query(`SELECT id, parent_id, inherit_access FROM kb_folders`),
    query(`SELECT resource_type, resource_id, subject_type, subject_id, level FROM kb_acl`),
  ]);
  const folderById = new Map(folders.rows.map((row) => [row.id, row]));
  const entries = new Map();
  for (const entry of acl.rows) {
    const key = `${entry.resource_type}:${entry.resource_id}`;
    if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push(entry);
  }
  const own = (type, id) =>
    (entries.get(`${type}:${id}`) || []).reduce(
      (max, entry) => (matches(entry, ctx) ? Math.max(max, entry.level) : max),
      0
    );

  const memo = new Map();
  const root = ctx.isAdmin ? LEVEL.manage : own('root', 0);

  function folderLevel(id) {
    if (ctx.isAdmin) return LEVEL.manage;
    if (memo.has(id)) return memo.get(id);
    const folder = folderById.get(id);
    if (!folder) return 0;
    memo.set(id, 0); // guards against a corrupted cycle
    const inherited = folder.inherit_access ? (folder.parent_id ? folderLevel(folder.parent_id) : root) : 0;
    const level = Math.max(inherited, own('folder', id));
    memo.set(id, level);
    return level;
  }

  function itemLevel(item) {
    if (ctx.isAdmin) return LEVEL.manage;
    const parent = folderLevel(item.folder_id);
    return item.inherit_access ? Math.max(parent, own('item', item.id)) : own('item', item.id);
  }

  /** Folder ids from the base down to `id` (inclusive). */
  function path(id) {
    const chain = [];
    let current = folderById.get(id);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift(current.id);
      current = current.parent_id ? folderById.get(current.parent_id) : null;
    }
    return chain;
  }

  function isWithin(id, ancestorId) {
    return path(id).includes(ancestorId);
  }

  /** True when every folder from `ancestorId` down to `id` inherits access (safe to share). */
  function inheritsFrom(id, ancestorId) {
    const chain = path(id);
    const start = chain.indexOf(ancestorId);
    if (start === -1) return false;
    return chain.slice(start + 1).every((folderId) => folderById.get(folderId)?.inherit_access);
  }

  return { root, folderLevel, itemLevel, path, isWithin, inheritsFrom, folderById, entries };
}

export function requireLevel(level, needed, what = 'this') {
  if (level < needed) {
    throw httpError(
      level === 0 ? 404 : 403,
      level === 0 ? 'Not found' : `You do not have permission to change ${what}`,
      level === 0 ? 'NOT_FOUND' : 'FORBIDDEN'
    );
  }
}

/** Access entries of one resource, with readable subject names for the editor. */
export async function readAcl(type, id) {
  const result = await query(
    `SELECT a.id, a.subject_type, a.subject_id, a.level,
            u.display_name, u.username, g.name AS group_name, r.name AS role_name, r.key AS role_key, r.is_system
     FROM kb_acl a
     LEFT JOIN users u ON a.subject_type = 'user' AND u.id = a.subject_id
     LEFT JOIN app_groups g ON a.subject_type = 'group' AND g.id = a.subject_id
     LEFT JOIN app_roles r ON a.subject_type = 'role' AND r.id = a.subject_id
     WHERE a.resource_type = $1 AND a.resource_id = $2
     ORDER BY a.level DESC, a.id`,
    [type, id]
  );
  return result.rows.map((row) => ({
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

/** Replaces the entries of one resource after validating them. */
export async function writeAcl(client, type, id, entries) {
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
  await client.query(`DELETE FROM kb_acl WHERE resource_type = $1 AND resource_id = $2`, [type, id]);
  for (const entry of clean) {
    await client.query(
      `INSERT INTO kb_acl (resource_type, resource_id, subject_type, subject_id, level) VALUES ($1, $2, $3, $4, $5)`,
      [type, id, entry.subjectType, entry.subjectId, entry.level]
    );
  }
  return clean.length;
}
