import { unlink } from 'fs/promises';
import multer from 'multer';
import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { KB_FILE_GROUPS } from '../catalog.js';
import { folderTree } from '../shared/relpath.js';
import { HEX, LEVEL, LEVEL_NAMES, avatarOf, clean, httpError, levelMap, readAcl, requireLevel, writeAcl } from '../shared/acl.js';
import { extOf, hasSignature, mimeOf, newStorageKey, originalName, readHead, removeBlob, signatureMatches, storagePath, verifyContent } from '../shared/storage.js';
import { childLevels, nodeAccess, nodeAccessMany, requireNode, spaceLevel } from './access.js';
import { tr } from '../../services/i18n/index.js';

export const NAME_MAX = 255;

export async function filesSettings() {
  return parseSettings(await getSettings()).modules.files.settings;
}

export function safeName(value) {
  const name = String(value ?? '')
    .replace(/[\\/\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (!name || name === '.' || name === '..') throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  return name;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export function nodeShape(row, level, extra = {}) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentId: row.parent_id,
    spaceId: row.space_id,
    ownerId: row.owner_id,
    file: row.kind === 'file' ? { name: row.name, mime: row.mime, size: Number(row.size) || 0, ext: row.ext } : null,
    systemTag: row.system_tag || null,
    level: LEVEL_NAMES[level],
    shared: Boolean(row.share_count || row.link_count),
    owner: row.owner_name ? { id: row.owner_id, name: row.owner_name, avatarUrl: avatarOf(row.owner_avatar) } : null,
    childCount: row.child_count !== undefined ? Number(row.child_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
    // The last change made through a public link: { title, name, action, at }.
    via: row.via_link || null,
    ...extra,
  };
}

const NODE_SELECT = `
  SELECT n.*, COALESCE(u.display_name, u.username) AS owner_name, u.avatar_path AS owner_avatar,
         (SELECT COUNT(*) FROM fs_shares s WHERE s.node_id = n.id)::int AS share_count,
         (SELECT COUNT(*) FROM fs_links l WHERE l.node_id = n.id AND l.revoked_at IS NULL)::int AS link_count,
         (SELECT json_build_object('title', e.link_title, 'name', e.visitor_name, 'action', e.action, 'at', e.created_at)
            FROM fs_link_events e WHERE e.node_id = n.id ORDER BY e.id DESC LIMIT 1) AS via_link,
         CASE WHEN n.kind = 'folder'
              THEN (SELECT COUNT(*) FROM fs_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL)::int END AS child_count
  FROM fs_nodes n LEFT JOIN users u ON u.id = n.owner_id
`;

const ORDER = `ORDER BY CASE WHEN n.kind = 'folder' THEN 0 ELSE 1 END, n.system_tag NULLS LAST, LOWER(n.name)`;

function crumbsOf(access) {
  return access.visibleChain.slice(0, -1).map((row) => ({ id: row.id, name: row.name, systemTag: row.system_tag || null }));
}

// ── Spaces ──────────────────────────────────────────────────────────────────

function spaceShape(row, level) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color,
    level: LEVEL_NAMES[level],
    size: row.size !== undefined ? Number(row.size) : undefined,
  };
}

export async function listSpaces(ctx) {
  const levels = await levelMap('fs_space_acl', ctx);
  const { rows } = await query(
    `SELECT s.*, (SELECT COALESCE(SUM(size), 0) FROM fs_nodes n WHERE n.space_id = s.id AND n.kind = 'file')::bigint AS size
     FROM fs_spaces s ORDER BY LOWER(s.name)`
  );
  return rows.filter((row) => levels.of(row.id) >= LEVEL.view).map((row) => spaceShape(row, levels.of(row.id)));
}

async function loadSpace(id) {
  if (!Number.isInteger(Number(id)) || Number(id) < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM fs_spaces WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

export async function createSpace(ctx, input, { allowed }) {
  if (!allowed) throw httpError(403, 'Only administrators can create shared spaces', 'FORBIDDEN');
  const name = clean(input.name, 120);
  if (!name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  const visibility = ['team', 'teamEdit', 'private'].includes(input.visibility) ? input.visibility : 'teamEdit';
  const space = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO fs_spaces (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, clean(input.description, 1000) || null, HEX.test(input.color || '') ? input.color.toUpperCase() : '#0EA5E9', ctx.userId]
    );
    await client.query(`INSERT INTO fs_space_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'user', $2, $3)`, [rows[0].id, ctx.userId, LEVEL.manage]);
    if (visibility !== 'private') {
      await client.query(`INSERT INTO fs_space_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'everyone', NULL, $2)`, [
        rows[0].id,
        visibility === 'teamEdit' ? LEVEL.edit : LEVEL.view,
      ]);
    }
    return rows[0];
  });
  return spaceShape(space, LEVEL.manage);
}

export async function updateSpace(ctx, id, input) {
  const space = await loadSpace(id);
  requireLevel(await spaceLevel(ctx, space.id), LEVEL.manage);
  const name = input.name !== undefined ? clean(input.name, 120) : space.name;
  if (!name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  const { rows } = await query(
    `UPDATE fs_spaces SET name = $2, description = $3, color = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [space.id, name, input.description !== undefined ? clean(input.description, 1000) || null : space.description, HEX.test(input.color || '') ? input.color.toUpperCase() : space.color]
  );
  return spaceShape(rows[0], LEVEL.manage);
}

export async function deleteSpace(ctx, id) {
  const space = await loadSpace(id);
  requireLevel(await spaceLevel(ctx, space.id), LEVEL.manage);
  const used = await query(
    `SELECT 1 FROM fs_nodes n WHERE n.space_id = $1
       AND (EXISTS (SELECT 1 FROM kb_items k WHERE k.file_node_id = n.id) OR EXISTS (SELECT 1 FROM kb_item_files f WHERE f.node_id = n.id))
     LIMIT 1`,
    [space.id]
  );
  if (used.rows.length) throw httpError(409, 'Files of this space are used in the knowledge base', 'FILE_IN_USE');
  const blobs = await query(`SELECT storage_key FROM fs_nodes WHERE space_id = $1 AND kind = 'file'`, [space.id]);
  await query(`DELETE FROM fs_spaces WHERE id = $1`, [space.id]);
  await Promise.all(blobs.rows.map((row) => removeBlob(row.storage_key)));
}

export async function getSpaceAccess(ctx, id) {
  const space = await loadSpace(id);
  requireLevel(await spaceLevel(ctx, space.id), LEVEL.manage);
  return readAcl('fs_space_acl', space.id);
}

export async function setSpaceAccess(ctx, id, entries) {
  const space = await loadSpace(id);
  requireLevel(await spaceLevel(ctx, space.id), LEVEL.manage);
  await withTransaction((client) => writeAcl(client, 'fs_space_acl', space.id, entries, ctx));
  return readAcl('fs_space_acl', space.id);
}

// ── Listing ─────────────────────────────────────────────────────────────────

/**
 * A place to list: { root: 'my' } · { root: 'space', spaceId } · { folderId }.
 * Returns { place, folder, crumbs, items, level }.
 */
export async function listPlace(ctx, place) {
  if (place.folderId) {
    const access = await requireNode(ctx, place.folderId, LEVEL.view);
    if (access.node.kind !== 'folder') throw httpError(404, 'Not found', 'NOT_FOUND');
    const { rows } = await query(`${NODE_SELECT} WHERE n.parent_id = $1 AND n.deleted_at IS NULL ${ORDER}`, [access.node.id]);
    const levelOf = await childLevels(ctx, access.level, rows.map((row) => row.id));
    const space = access.node.space_id ? await loadSpace(access.node.space_id) : null;
    return {
      folder: nodeShape(access.node, access.level),
      crumbs: crumbsOf(access),
      root: access.base > 0 ? (space ? { type: 'space', space: spaceShape(space, access.base) } : { type: 'my' }) : { type: 'shared' },
      level: LEVEL_NAMES[access.level],
      items: access.trashed ? [] : rows.map((row) => nodeShape(row, levelOf(row.id))),
    };
  }
  if (place.root === 'space') {
    const space = await loadSpace(place.spaceId);
    const level = await spaceLevel(ctx, space.id);
    requireLevel(level, LEVEL.view);
    const { rows } = await query(`${NODE_SELECT} WHERE n.space_id = $1 AND n.parent_id IS NULL AND n.deleted_at IS NULL ${ORDER}`, [space.id]);
    return { folder: null, crumbs: [], root: { type: 'space', space: spaceShape(space, level) }, level: LEVEL_NAMES[level], items: rows.map((row) => nodeShape(row, level)) };
  }
  personalAllowed(ctx);
  const { rows } = await query(
    `${NODE_SELECT} WHERE n.owner_id = $1 AND n.space_id IS NULL AND n.parent_id IS NULL AND n.deleted_at IS NULL ${ORDER}`,
    [ctx.userId]
  );
  return { folder: null, crumbs: [], root: { type: 'my' }, level: 'manage', items: rows.map((row) => nodeShape(row, LEVEL.manage)), usage: await usageOf(ctx.userId) };
}

/** Nodes shared with me (directly or through a group), newest first. */
export async function sharedWithMe(ctx) {
  const { rows } = await query(
    `${NODE_SELECT}
     WHERE n.deleted_at IS NULL AND (n.owner_id IS DISTINCT FROM $1 OR n.space_id IS NOT NULL)
       AND n.id IN (
         SELECT node_id FROM fs_shares
         WHERE (subject_type = 'user' AND subject_id = $1) OR (subject_type = 'group' AND subject_id = ANY($2))
       )
     ORDER BY n.updated_at DESC LIMIT 300`,
    [ctx.userId, [...ctx.groupIds]]
  );
  const accessById = await nodeAccessMany(ctx, rows.map((row) => row.id));
  const items = [];
  for (const row of rows) {
    const access = accessById.get(row.id);
    if (access && access.level >= LEVEL.view && !access.trashed && access.base === 0) items.push(nodeShape(row, access.level));
  }
  return items;
}

export async function recent(ctx) {
  const { rows } = await query(
    `${NODE_SELECT} WHERE n.kind = 'file' AND n.deleted_at IS NULL
       AND ((n.owner_id = $1 AND n.space_id IS NULL) OR n.updated_by = $1)
     ORDER BY n.updated_at DESC LIMIT 40`,
    [ctx.userId]
  );
  const accessById = await nodeAccessMany(ctx, rows.map((row) => row.id));
  const items = [];
  for (const row of rows) {
    const access = accessById.get(row.id);
    if (access && access.level >= LEVEL.view && !access.trashed) items.push(nodeShape(row, access.level));
  }
  return items;
}

export async function search(ctx, text) {
  const q = clean(text, 100);
  if (q.length < 2) return [];
  const { rows } = await query(
    `${NODE_SELECT} WHERE n.deleted_at IS NULL AND n.name ILIKE $1 ORDER BY n.updated_at DESC LIMIT 400`,
    [`%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`]
  );
  // Access of all candidates at once (a handful of queries, not three per row).
  const accessById = await nodeAccessMany(ctx, rows.map((row) => row.id));
  const items = [];
  for (const row of rows) {
    if (items.length >= 60) break;
    const access = accessById.get(row.id);
    if (access && access.level >= LEVEL.view && !access.trashed) items.push(nodeShape(row, access.level, { path: access.visibleChain.slice(0, -1).map((item) => item.name) }));
  }
  return items;
}

export async function getNode(ctx, id) {
  const access = await requireNode(ctx, id, LEVEL.view);
  const { rows } = await query(`${NODE_SELECT} WHERE n.id = $1`, [access.node.id]);
  return { node: nodeShape(rows[0], access.level), crumbs: crumbsOf(access), trashed: access.trashed, usage: await kbUsage([access.node.id]) };
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Where new nodes go: inside a folder, the root of my files, or a space root. */
export async function resolveTarget(ctx, { parentId, spaceId }) {
  if (parentId) {
    const access = await requireNode(ctx, parentId, LEVEL.edit);
    if (access.node.kind !== 'folder' || access.trashed) throw httpError(400, 'Choose a folder', 'NOT_FOLDER');
    // In a space the owner is just who made it (the folder's maker may be gone: owner_id NULL).
    return { parentId: access.node.id, spaceId: access.node.space_id, ownerId: access.node.space_id ? ctx.userId : access.node.owner_id };
  }
  if (spaceId) {
    const space = await loadSpace(spaceId);
    requireLevel(await spaceLevel(ctx, space.id), LEVEL.edit);
    return { parentId: null, spaceId: space.id, ownerId: ctx.userId };
  }
  personalAllowed(ctx);
  return { parentId: null, spaceId: null, ownerId: ctx.userId };
}

/** An API token narrowed to some spaces does not reach the person's own files. */
function personalAllowed(ctx) {
  if (ctx.limits?.fs_space_acl) throw httpError(403, 'The API token is limited to selected spaces', 'TOKEN_LIMITED');
}

/** "Report.pdf" → "Report (2).pdf" when the name is taken in the same folder. */
async function freeName(client, target, name, kind, excludeId = null) {
  const [scope, value] = target.parentId
    ? ['parent_id = $1', target.parentId]
    : target.spaceId
      ? ['parent_id IS NULL AND space_id = $1', target.spaceId]
      : ['parent_id IS NULL AND space_id IS NULL AND owner_id = $1', target.ownerId];
  const siblings = await client.query(
    `SELECT LOWER(name) AS name FROM fs_nodes WHERE deleted_at IS NULL AND id <> $2 AND ${scope}`,
    [value, excludeId || 0]
  );
  const taken = new Set(siblings.rows.map((row) => row.name));
  if (!taken.has(name.toLowerCase())) return name;
  const ext = kind === 'file' ? extOf(name) : '';
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${stem} (${i})${ext ? `.${ext}` : ''}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} (${Date.now()})${ext ? `.${ext}` : ''}`;
}

export async function createFolder(ctx, input) {
  const target = await resolveTarget(ctx, input);
  const name = safeName(input.name);
  const row = await withTransaction(async (client) => {
    const free = await freeName(client, target, name, 'folder');
    const { rows } = await client.query(
      `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, created_by, updated_by)
       VALUES ('folder', $1, $2, $3, $4, $5, $5) RETURNING *`,
      [free, target.parentId, target.ownerId, target.spaceId, ctx.userId]
    );
    return rows[0];
  });
  return nodeShape(row, LEVEL.manage);
}

/**
 * Folder uploads: recreates the folder paths of a dropped/picked folder under
 * the target ("Photos", "Photos/2026", …). A folder that already exists with
 * the same name (any case) is reused; a *file* in the way gets the folder
 * renamed "Name (2)", as a new folder would. `bytes` (the whole upload) is
 * checked against the personal quota up front so a full storage fails before
 * any folder is made; every file is still checked again when it arrives.
 * Returns the folder ids in the order of `paths`.
 */
export async function ensureFolderTree(ctx, place, paths, { bytes = 0 } = {}) {
  const target = await resolveTarget(ctx, place);
  const { list, keys } = folderTree(paths);
  const names = new Map(list.map((item) => [item.key, item.parts.map((part) => safeName(part))]));
  const incoming = Number(bytes) || 0;
  if (!target.spaceId && incoming > 0) {
    const { used, quota } = await usageOf(target.ownerId);
    if (quota && used + incoming > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
  }
  const ownerId = target.spaceId ? ctx.userId : target.ownerId;
  const scopeKey = target.parentId ? `p${target.parentId}` : target.spaceId ? `s${target.spaceId}` : `u${target.ownerId}`;
  let created = 0;
  const ids = await withTransaction(async (client) => {
    // Two uploads into the same place must not both create "Photos".
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fs-tree:${scopeKey}`]);
    const idOf = new Map();
    for (const { key, parts } of list) {
      const parentKey = parts.length > 1 ? parts.slice(0, -1).join('/').toLowerCase() : null;
      const level = { parentId: parentKey ? idOf.get(parentKey) : target.parentId, spaceId: target.spaceId, ownerId };
      const name = names.get(key).at(-1);
      const [scope, value] = level.parentId
        ? ['parent_id = $1', level.parentId]
        : level.spaceId
          ? ['parent_id IS NULL AND space_id = $1', level.spaceId]
          : ['parent_id IS NULL AND space_id IS NULL AND owner_id = $1', level.ownerId];
      const existing = await client.query(
        `SELECT id FROM fs_nodes WHERE deleted_at IS NULL AND kind = 'folder' AND LOWER(name) = LOWER($2) AND ${scope}
         ORDER BY id LIMIT 1`,
        [value, name]
      );
      if (existing.rows[0]) {
        idOf.set(key, existing.rows[0].id);
        continue;
      }
      const free = await freeName(client, level, name, 'folder');
      const { rows } = await client.query(
        `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, created_by, updated_by)
         VALUES ('folder', $1, $2, $3, $4, $5, $5) RETURNING id`,
        [free, level.parentId, level.ownerId, level.spaceId, ctx.userId]
      );
      idOf.set(key, rows[0].id);
      created += 1;
    }
    return keys.map((key) => idOf.get(key));
  });
  return { folders: ids, created };
}

export async function usageOf(userId) {
  const settings = await filesSettings();
  const { rows } = await query(
    `SELECT COALESCE(SUM(size), 0)::bigint AS used FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND kind = 'file'`,
    [userId]
  );
  return { used: Number(rows[0].used), quota: settings.quotaMb ? settings.quotaMb * 1024 * 1024 : 0 };
}

/**
 * Serialises quota-checked writes into one person's storage: two uploads at
 * the same moment must not both pass the check against the same "used".
 * Call inside a transaction; the lock ends with it.
 */
export async function lockQuota(client, ownerId) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fs-quota:${ownerId}`]);
}

export async function usedBytes(client, ownerId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(size), 0)::bigint AS used FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND kind = 'file'`,
    [ownerId]
  );
  return Number(rows[0].used);
}

export function allowedExt(settings, ext) {
  if (settings.allowAny) return true;
  return settings.fileGroups.some((group) => (KB_FILE_GROUPS[group] || []).includes(ext));
}

/**
 * Multer storing straight into the dated storage folders, with the live
 * limits. Public links narrow them further: `maxBytes`, an extra extension
 * check (`allow`) and fewer files per request.
 */
export async function fileUploader(settings, field = 'files', { maxBytes = 0, allow = null, maxFiles = 100 } = {}) {
  const cap = settings.maxUploadMb * 1024 * 1024;
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newStorageKey(extOf(originalName(file)));
          cb(null, storagePath(file.storageKey).replace(/[^/\\]+$/, ''));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxBytes ? Math.min(cap, maxBytes) : cap, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      const ext = extOf(originalName(file));
      if (!allowedExt(settings, ext) || (allow && !allow(ext))) {
        cb(httpError(400, `Files of type .${ext || '?'} are not allowed`, 'FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  }).array(field, maxFiles);
}

export function runUpload(upload, req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') reject(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err?.code === 'LIMIT_FILE_COUNT') reject(httpError(400, 'Too many files at once', 'TOO_MANY_FILES'));
      else if (err) reject(err.statusCode ? err : httpError(400, err.message));
      else resolve();
    });
  });
}

/**
 * Turns uploaded multer files into nodes under `target`; cleans up on failure.
 * `hooks.before(client, file)` runs inside each file's transaction before the
 * insert (extra limits, e.g. a link's quota); `hooks.after(client, row, file)`
 * right after it (e.g. the link activity log), so both commit with the file.
 */
export async function storeUploads(ctx, target, files, hooks = {}) {
  const created = [];
  try {
    let quota = 0;
    if (!target.spaceId) {
      const usage = await usageOf(target.ownerId);
      quota = usage.quota;
      const incoming = files.reduce((sum, file) => sum + file.size, 0);
      if (quota && usage.used + incoming > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
    }
    for (const file of files) {
      const name = safeName(originalName(file));
      const ext = extOf(name);
      await verifyContent(file.path, ext);
      const row = await withTransaction(async (client) => {
        // Checked again under the owner's lock, right before the file counts.
        if (quota) {
          await lockQuota(client, target.ownerId);
          if ((await usedBytes(client, target.ownerId)) + file.size > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
        }
        if (hooks.before) await hooks.before(client, file);
        const free = await freeName(client, target, name, 'file');
        const { rows } = await client.query(
          `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by)
           VALUES ('file', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
          [free, target.parentId, target.ownerId, target.spaceId, file.storageKey, mimeOf(ext), file.size, ext, ctx.userId]
        );
        if (hooks.after) await hooks.after(client, rows[0], file);
        return rows[0];
      });
      created.push(row);
    }
  } catch (err) {
    const stored = new Set(created.map((row) => row.storage_key));
    await Promise.all(files.filter((file) => !stored.has(file.storageKey)).map((file) => unlink(file.path).catch(() => {})));
    throw err;
  }
  return created;
}

export async function uploadTo(ctx, req, res, place) {
  const target = await resolveTarget(ctx, place);
  const settings = await filesSettings();
  await runUpload(await fileUploader(settings), req, res);
  const rows = await storeUploads(ctx, target, req.files || []);
  return rows.map((row) => nodeShape(row, LEVEL.edit));
}

/**
 * Replaces a file's content with an uploaded file (multer `file`) of the same
 * type. Files has no version history, so the previous content is kept as a
 * copy in the trash, where the owner can restore it. Same checks as an
 * upload: edit access, magic bytes, personal quota under the owner's lock.
 */
export async function replaceContent(ctx, id, file, hooks = {}) {
  try {
    const access = await requireNode(ctx, id, LEVEL.edit);
    const node = access.node;
    if (node.kind !== 'file' || access.trashed) throw httpError(404, 'Not found', 'NOT_FOUND');
    const ext = extOf(originalName(file));
    if ((ext || '') !== (node.ext || '')) throw httpError(400, `Choose a .${node.ext || '?'} file`, 'EXT_MISMATCH');
    await verifyContent(file.path, ext);
    const quota = node.space_id ? 0 : (await usageOf(node.owner_id)).quota;
    return await withTransaction(async (client) => {
      if (quota) {
        await lockQuota(client, node.owner_id);
        if ((await usedBytes(client, node.owner_id)) + file.size > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
      }
      if (hooks.before) await hooks.before(client, file);
      // The old content stays restorable from the trash.
      await client.query(
        `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by)
         SELECT kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at, NOW(), $2
         FROM fs_nodes WHERE id = $1`,
        [node.id, ctx.userId]
      );
      const { rows } = await client.query(
        `UPDATE fs_nodes SET storage_key = $2, size = $3, mime = $4, updated_by = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [node.id, file.storageKey, file.size, mimeOf(ext), ctx.userId]
      );
      if (hooks.after) await hooks.after(client, rows[0], file);
      return rows[0];
    });
  } catch (err) {
    await unlink(file.path).catch(() => {});
    throw err;
  }
}

export async function renameNode(ctx, id, name) {
  const access = await requireNode(ctx, id, LEVEL.edit);
  if (access.node.system_tag) throw httpError(400, 'This folder cannot be renamed', 'SYSTEM_FOLDER');
  const next = safeName(name);
  const nextExt = access.node.kind === 'file' ? extOf(next) : '';
  // A new extension passes the same checks as an upload: allowed type, and real content for types shown inline.
  if (nextExt && nextExt !== access.node.ext) {
    if (!allowedExt(await filesSettings(), nextExt)) throw httpError(400, `Files of type .${nextExt} are not allowed`, 'FILE_TYPE');
    if (hasSignature(nextExt)) {
      const head = await readHead(storagePath(access.node.storage_key)).catch(() => Buffer.alloc(0));
      if (!signatureMatches(head, nextExt)) throw httpError(400, `The file content is not a valid .${nextExt}`, 'FILE_CONTENT');
    }
  }
  const row = await withTransaction(async (client) => {
    const target = { parentId: access.node.parent_id, spaceId: access.node.space_id, ownerId: access.node.owner_id };
    const free = await freeName(client, target, next, access.node.kind, access.node.id);
    const ext = extOf(free) || access.node.ext;
    const { rows } = await client.query(
      `UPDATE fs_nodes SET name = $2, ext = CASE WHEN kind = 'file' THEN $3 ELSE ext END,
              mime = CASE WHEN kind = 'file' AND $3 IS DISTINCT FROM ext THEN $5 ELSE mime END, updated_by = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [access.node.id, free, ext, ctx.userId, mimeOf(ext)]
    );
    return rows[0];
  });
  return nodeShape(row, access.level);
}

/**
 * Move into a folder or to a root. Crossing between my files and a space (or
 * between spaces) re-homes the whole subtree and needs manage on the source.
 */
export async function moveNode(ctx, id, place) {
  const access = await requireNode(ctx, id, LEVEL.edit);
  if (access.node.system_tag) throw httpError(400, 'This folder cannot be moved', 'SYSTEM_FOLDER');
  const target = await resolveTarget(ctx, place);
  if (target.parentId) {
    const chain = (await nodeAccess(ctx, target.parentId)).chain.map((row) => row.id);
    if (chain.includes(access.node.id)) throw httpError(400, 'A folder cannot be moved into itself', 'MOVE_CYCLE');
  }
  const crossing = (target.spaceId || null) !== (access.node.space_id || null) || (!target.spaceId && target.ownerId !== access.node.owner_id);
  if (crossing && access.base < LEVEL.manage) throw httpError(403, 'Only the owner can move this outside its storage', 'FORBIDDEN');
  const quota = crossing && !target.spaceId ? (await usageOf(target.ownerId)).quota : 0;
  const row = await withTransaction(async (client) => {
    // Into someone's personal storage: the whole subtree counts against their quota, as an upload would.
    if (quota) {
      await lockQuota(client, target.ownerId);
      const { rows: sizes } = await client.query(
        `WITH RECURSIVE tree AS (
           SELECT id, kind, size FROM fs_nodes WHERE id = $1
           UNION ALL SELECT n.id, n.kind, n.size FROM fs_nodes n JOIN tree t ON n.parent_id = t.id
         )
         SELECT (SELECT COALESCE(SUM(size), 0) FROM tree WHERE kind = 'file')::bigint AS incoming,
                (SELECT COALESCE(SUM(size), 0) FROM fs_nodes WHERE owner_id = $2 AND space_id IS NULL AND kind = 'file')::bigint AS used`,
        [access.node.id, target.ownerId]
      );
      if (Number(sizes[0].used) + Number(sizes[0].incoming) > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
    }
    const free = await freeName(client, target, access.node.name, access.node.kind, access.node.id);
    const { rows } = await client.query(
      `UPDATE fs_nodes SET parent_id = $2, name = $3, updated_by = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [access.node.id, target.parentId, free, ctx.userId]
    );
    if (crossing) {
      await client.query(
        `WITH RECURSIVE tree AS (
           SELECT id FROM fs_nodes WHERE id = $1
           UNION ALL SELECT n.id FROM fs_nodes n JOIN tree t ON n.parent_id = t.id
         )
         UPDATE fs_nodes SET space_id = $2, owner_id = $3 WHERE id IN (SELECT id FROM tree)`,
        [access.node.id, target.spaceId, target.ownerId]
      );
      return (await client.query(`SELECT * FROM fs_nodes WHERE id = $1`, [access.node.id])).rows[0];
    }
    return rows[0];
  });
  return nodeShape(row, access.level);
}

async function subtreeIds(rootId) {
  const { rows } = await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM fs_nodes WHERE id = $1
       UNION ALL SELECT n.id FROM fs_nodes n JOIN tree t ON n.parent_id = t.id
     ) SELECT id FROM tree`,
    [rootId]
  );
  return rows.map((row) => row.id);
}

/** Knowledge-base materials that use any of these files. */
export async function kbUsage(nodeIds) {
  if (!nodeIds.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT i.id, i.title, i.folder_id FROM kb_items i
     WHERE i.file_node_id = ANY($1) OR i.id IN (SELECT item_id FROM kb_item_files WHERE node_id = ANY($1))
     ORDER BY i.title LIMIT 50`,
    [nodeIds]
  );
  return rows.map((row) => ({ id: row.id, title: row.title, folderId: row.folder_id }));
}

/** Move to the trash. Files used by the knowledge base stay put. */
export async function trashNode(ctx, id) {
  const access = await requireNode(ctx, id, LEVEL.edit);
  if (access.trashed) return;
  if (access.node.system_tag) throw httpError(400, 'This folder cannot be deleted', 'SYSTEM_FOLDER');
  const usage = await kbUsage(await subtreeIds(access.node.id));
  if (usage.length) {
    const error = httpError(409, 'The file is used in the knowledge base', 'FILE_IN_USE');
    error.details = { usage };
    throw error;
  }
  await query(`UPDATE fs_nodes SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1`, [access.node.id, ctx.userId]);
}

export async function listTrash(ctx) {
  const levels = await levelMap('fs_space_acl', ctx);
  const managed = ctx.isAdmin ? null : levels.visibleIds().filter((spaceId) => levels.of(spaceId) >= LEVEL.manage);
  const { rows } = await query(
    `${NODE_SELECT}
     WHERE n.deleted_at IS NOT NULL
       AND (n.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM fs_nodes p WHERE p.id = n.parent_id AND p.deleted_at IS NOT NULL))
       AND ((n.space_id IS NULL AND n.owner_id = $1 AND NOT $3::boolean) OR (n.space_id IS NOT NULL AND ($2::int[] IS NULL OR n.space_id = ANY($2))))
     ORDER BY n.deleted_at DESC LIMIT 500`,
    [ctx.userId, managed, Boolean(ctx.limits?.fs_space_acl)]
  );
  return rows.map((row) => nodeShape(row, LEVEL.manage));
}

export async function restoreNode(ctx, id) {
  const access = await nodeAccess(ctx, id);
  if (access.base < LEVEL.manage) throw httpError(404, 'Not found', 'NOT_FOUND');
  // A parent that is itself in the trash (or gone) sends the node to the root.
  const parentTrashed = access.chain.slice(0, -1).some((row) => row.deleted_at);
  await withTransaction(async (client) => {
    const target = parentTrashed
      ? { parentId: null, spaceId: access.node.space_id, ownerId: access.node.owner_id }
      : { parentId: access.node.parent_id, spaceId: access.node.space_id, ownerId: access.node.owner_id };
    const free = await freeName(client, target, access.node.name, access.node.kind, access.node.id);
    await client.query(`UPDATE fs_nodes SET deleted_at = NULL, deleted_by = NULL, parent_id = $2, name = $3 WHERE id = $1`, [
      access.node.id,
      target.parentId,
      free,
    ]);
  });
}

export async function purgeNode(ctx, id) {
  const access = await nodeAccess(ctx, id);
  if (access.base < LEVEL.manage) throw httpError(404, 'Not found', 'NOT_FOUND');
  if (!access.trashed) throw httpError(400, 'Move it to the trash first', 'NOT_TRASHED');
  await purgeSubtree(access.node.id);
}

export async function purgeSubtree(rootId) {
  const ids = await subtreeIds(rootId);
  if ((await kbUsage(ids)).length) throw httpError(409, 'The file is used in the knowledge base', 'FILE_IN_USE');
  const blobs = await query(`SELECT storage_key FROM fs_nodes WHERE id = ANY($1) AND kind = 'file'`, [ids]);
  await query(`DELETE FROM fs_nodes WHERE id = $1`, [rootId]);
  await Promise.all(blobs.rows.map((row) => removeBlob(row.storage_key)));
}

export async function emptyTrash(ctx) {
  const items = await listTrash(ctx);
  let removed = 0;
  for (const item of items) {
    try {
      await purgeSubtree(item.id);
      removed += 1;
    } catch {
      /* in use: stays */
    }
  }
  return removed;
}

// ── Sharing with people ─────────────────────────────────────────────────────

export async function getShares(ctx, id) {
  const access = await requireNode(ctx, id, LEVEL.view);
  const { rows } = await query(
    `SELECT s.subject_type, s.subject_id, s.level, COALESCE(u.display_name, u.username) AS user_name, u.username, u.avatar_path, g.name AS group_name
     FROM fs_shares s
     LEFT JOIN users u ON s.subject_type = 'user' AND u.id = s.subject_id
     LEFT JOIN app_groups g ON s.subject_type = 'group' AND g.id = s.subject_id
     WHERE s.node_id = $1 ORDER BY s.level DESC, s.id`,
    [access.node.id]
  );
  return {
    canManage: access.owner,
    entries: rows.map((row) => ({
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      level: LEVEL_NAMES[row.level],
      label: row.subject_type === 'user' ? row.user_name : row.group_name,
      username: row.username || null,
      avatarUrl: avatarOf(row.avatar_path),
    })),
  };
}

/** Replaces the people a node is shared with; newcomers are notified. */
export async function setShares(ctx, id, entries) {
  const access = await requireNode(ctx, id, LEVEL.view);
  if (!access.owner) throw httpError(403, 'Only the owner can share this', 'FORBIDDEN');
  const list = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const subjectType = entry?.subjectType === 'group' ? 'group' : entry?.subjectType === 'user' ? 'user' : null;
    const subjectId = Number(entry?.subjectId);
    const level = entry?.level === 'edit' ? LEVEL.edit : LEVEL.view;
    if (!subjectType || !Number.isInteger(subjectId) || seen.has(`${subjectType}:${subjectId}`)) continue;
    if (subjectType === 'user' && subjectId === ctx.userId) continue;
    seen.add(`${subjectType}:${subjectId}`);
    list.push({ subjectType, subjectId, level });
  }
  const before = await query(`SELECT subject_type, subject_id FROM fs_shares WHERE node_id = $1`, [access.node.id]);
  const had = new Set(before.rows.map((row) => `${row.subject_type}:${row.subject_id}`));
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM fs_shares WHERE node_id = $1`, [access.node.id]);
    for (const entry of list.slice(0, 200)) {
      await client.query(
        `INSERT INTO fs_shares (node_id, subject_type, subject_id, level, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [access.node.id, entry.subjectType, entry.subjectId, entry.level, ctx.userId]
      );
    }
  });
  const added = list.filter((entry) => !had.has(`${entry.subjectType}:${entry.subjectId}`));
  if (added.length) {
    const userIds = added.filter((entry) => entry.subjectType === 'user').map((entry) => entry.subjectId);
    const groupIds = added.filter((entry) => entry.subjectType === 'group').map((entry) => entry.subjectId);
    if (groupIds.length) {
      const members = await query(`SELECT user_id FROM user_group_members WHERE group_id = ANY($1)`, [groupIds]);
      userIds.push(...members.rows.map((row) => row.user_id));
    }
    const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [ctx.userId]);
    const actor = rows[0]?.name || '';
    const name = access.node.name;
    const folder = access.node.kind === 'folder';
    await notify({
      userIds,
      kind: 'files.shared',
      module: 'files',
      link: `/app/files/n/${access.node.id}`,
      actorId: ctx.userId,
      render: (locale) => ({ title: tr(locale, `files.notify.shared.${folder ? 'titleFolder' : 'titleFile'}`, { actor, name }), body: tr(locale, 'files.notify.shared.body') }),
    });
  }
  return getShares(ctx, access.node.id);
}
