import { query, withTransaction } from '../../config/database.js';
import { LEVEL, LEVEL_NAMES, httpError, loadAccess, readAcl, requireLevel, writeAcl } from './access.js';
import { removeStoredFile } from './files.js';
import { attachmentsOf, planAttachments, syncAttachments, writeAttachments } from './attachments.js';

const HEX = /^#[0-9a-f]{6}$/i;
const ICON = /^[a-z0-9_-]{2,32}$/i;

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function folderShape(row, access, counts = {}) {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    description: row.description || '',
    icon: row.icon || null,
    color: row.color || null,
    inheritAccess: row.inherit_access,
    level: LEVEL_NAMES[access.folderLevel(row.id)],
    folderCount: counts.folders?.get(row.id) || 0,
    itemCount: counts.items?.get(row.id) || 0,
    updatedAt: row.updated_at,
  };
}

export function itemShape(row, level) {
  return {
    id: row.id,
    folderId: row.folder_id,
    kind: row.kind,
    title: row.title,
    description: row.description || '',
    url: row.kind === 'link' ? row.url : null,
    file:
      row.kind === 'file'
        ? { name: row.file_original, mime: row.file_mime, size: Number(row.file_size) || 0, ext: row.file_ext }
        : null,
    format: row.kind === 'article' ? (row.content_format === 'html' ? 'html' : 'md') : undefined,
    inheritAccess: row.inherit_access,
    level: level !== undefined ? LEVEL_NAMES[level] : undefined,
    author: row.author_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ITEM_SELECT = `
  i.id, i.folder_id, i.kind, i.title, i.description, i.url, i.file_original, i.file_mime,
  i.file_size, i.file_ext, i.content_format, i.inherit_access, i.created_at, i.updated_at,
  COALESCE(u.display_name, u.username) AS author_name
`;

/** Children per folder, counting only what this user can see. */
async function counts(access) {
  const [folders, items] = await Promise.all([
    query(`SELECT id, parent_id FROM kb_folders WHERE parent_id IS NOT NULL`),
    query(`SELECT id, folder_id, inherit_access FROM kb_items`),
  ]);
  const tally = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const result = { folders: new Map(), items: new Map() };
  folders.rows.forEach((row) => access.folderLevel(row.id) >= LEVEL.view && tally(result.folders, row.parent_id));
  items.rows.forEach((row) => access.itemLevel(row) >= LEVEL.view && tally(result.items, row.folder_id));
  return result;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Every folder the user can see. Folders whose parent is hidden float to the top level. */
export async function getTree(ctx) {
  const access = await loadAccess(ctx);
  const [rows, count] = await Promise.all([
    query(`SELECT * FROM kb_folders ORDER BY sort, LOWER(name)`),
    counts(access),
  ]);
  const visible = rows.rows.filter((row) => access.folderLevel(row.id) >= LEVEL.view);
  const ids = new Set(visible.map((row) => row.id));
  return {
    rootLevel: LEVEL_NAMES[access.root],
    folders: visible.map((row) => ({
      ...folderShape(row, access, count),
      parentId: row.parent_id && ids.has(row.parent_id) ? row.parent_id : null,
    })),
  };
}

/** Start page: top-level folders and recently updated materials. */
export async function getHome(ctx) {
  const tree = await getTree(ctx);
  const access = await loadAccess(ctx);
  const recent = await query(
    `SELECT ${ITEM_SELECT} FROM kb_items i LEFT JOIN users u ON u.id = COALESCE(i.updated_by, i.created_by)
     ORDER BY i.updated_at DESC LIMIT 60`
  );
  return {
    rootLevel: tree.rootLevel,
    folders: tree.folders.filter((folder) => folder.parentId === null),
    recent: recent.rows
      .filter((row) => access.itemLevel(row) >= LEVEL.view)
      .slice(0, 12)
      .map((row) => itemShape(row, access.itemLevel(row))),
  };
}

export async function getFolder(ctx, id) {
  const access = await loadAccess(ctx);
  const level = access.folderLevel(id);
  requireLevel(level, LEVEL.view);
  const [folder, children, items, count, shares] = await Promise.all([
    query(`SELECT * FROM kb_folders WHERE id = $1`, [id]),
    query(`SELECT * FROM kb_folders WHERE parent_id = $1 ORDER BY sort, LOWER(name)`, [id]),
    query(
      `SELECT ${ITEM_SELECT} FROM kb_items i LEFT JOIN users u ON u.id = COALESCE(i.updated_by, i.created_by)
       WHERE i.folder_id = $1 ORDER BY i.sort, LOWER(i.title)`,
      [id]
    ),
    counts(access),
    query(`SELECT COUNT(*)::int AS n FROM kb_shares WHERE folder_id = $1 AND revoked_at IS NULL`, [id]),
  ]);
  if (!folder.rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  const crumbs = access
    .path(id)
    .slice(0, -1)
    .filter((folderId) => access.folderLevel(folderId) >= LEVEL.view);
  const names = crumbs.length
    ? (await query(`SELECT id, name, icon, color FROM kb_folders WHERE id = ANY($1)`, [crumbs])).rows
    : [];
  return {
    folder: { ...folderShape(folder.rows[0], access, count), shareCount: shares.rows[0].n },
    breadcrumbs: crumbs.map((folderId) => names.find((row) => row.id === folderId)).filter(Boolean),
    folders: children.rows
      .filter((row) => access.folderLevel(row.id) >= LEVEL.view)
      .map((row) => folderShape(row, access, count)),
    items: items.rows
      .filter((row) => access.itemLevel(row) >= LEVEL.view)
      .map((row) => itemShape(row, access.itemLevel(row))),
  };
}

export async function loadItemRow(id) {
  const result = await query(
    `SELECT i.*, COALESCE(u.display_name, u.username) AS author_name
     FROM kb_items i LEFT JOIN users u ON u.id = COALESCE(i.updated_by, i.created_by)
     WHERE i.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return result.rows[0];
}

/** One material with its article body and breadcrumbs; `level` gates editing in the UI. */
export async function getItem(ctx, id) {
  const access = await loadAccess(ctx);
  const row = await loadItemRow(id);
  const level = access.itemLevel(row);
  requireLevel(level, LEVEL.view);
  const crumbIds = access.path(row.folder_id).filter((folderId) => access.folderLevel(folderId) >= LEVEL.view);
  const names = crumbIds.length
    ? (await query(`SELECT id, name, icon, color FROM kb_folders WHERE id = ANY($1)`, [crumbIds])).rows
    : [];
  return {
    item: {
      ...itemShape(row, level),
      content: row.kind === 'article' ? row.content || '' : undefined,
      attachments: row.kind === 'article' ? await attachmentsOf(row.id) : [],
    },
    breadcrumbs: crumbIds.map((folderId) => names.find((entry) => entry.id === folderId)).filter(Boolean),
  };
}

export async function search(ctx, text) {
  const q = clean(text, 100);
  if (q.length < 2) return { folders: [], items: [] };
  const access = await loadAccess(ctx);
  const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const [folders, items] = await Promise.all([
    query(`SELECT * FROM kb_folders WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY LOWER(name) LIMIT 50`, [like]),
    query(
      `SELECT ${ITEM_SELECT} FROM kb_items i LEFT JOIN users u ON u.id = COALESCE(i.updated_by, i.created_by)
       WHERE i.title ILIKE $1 OR i.description ILIKE $1 OR i.file_original ILIKE $1 OR regexp_replace(i.content, '<[^>]*>', ' ', 'g') ILIKE $1
       ORDER BY i.updated_at DESC LIMIT 100`,
      [like]
    ),
  ]);
  return {
    folders: folders.rows.filter((row) => access.folderLevel(row.id) >= LEVEL.view).map((row) => folderShape(row, access)),
    items: items.rows
      .filter((row) => access.itemLevel(row) >= LEVEL.view)
      .slice(0, 50)
      .map((row) => itemShape(row, access.itemLevel(row))),
  };
}

// ── Folders ─────────────────────────────────────────────────────────────────

function folderFields(input, current = {}) {
  const name = clean(input.name ?? current.name, 120);
  if (!name) throw httpError(400, 'Folder name is required');
  const icon = input.icon === null || input.icon === '' ? null : input.icon ?? current.icon ?? null;
  const color = input.color === null || input.color === '' ? null : input.color ?? current.color ?? null;
  if (icon && !ICON.test(icon)) throw httpError(400, 'Unknown icon');
  if (color && !HEX.test(color)) throw httpError(400, 'Colour must be #RRGGBB');
  return { name, description: clean(input.description ?? current.description, 1000), icon, color };
}

export async function createFolder(ctx, input) {
  const access = await loadAccess(ctx);
  const parentId = input.parentId ? Number(input.parentId) : null;
  requireLevel(parentId ? access.folderLevel(parentId) : access.root, LEVEL.edit, 'this folder');
  const fields = folderFields(input);
  const result = await query(
    `INSERT INTO kb_folders (parent_id, name, description, icon, color, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
    [parentId, fields.name, fields.description, fields.icon, fields.color, ctx.userId]
  );
  return result.rows[0].id;
}

export async function updateFolder(ctx, id, input) {
  const access = await loadAccess(ctx);
  requireLevel(access.folderLevel(id), LEVEL.edit, 'this folder');
  const current = (await query(`SELECT * FROM kb_folders WHERE id = $1`, [id])).rows[0];
  if (!current) throw httpError(404, 'Not found', 'NOT_FOUND');
  const fields = folderFields(input, current);

  let parentId = current.parent_id;
  if (input.parentId !== undefined && Number(input.parentId || 0) !== Number(current.parent_id || 0)) {
    // Moving needs manage on the folder and edit on the destination.
    requireLevel(access.folderLevel(id), LEVEL.manage, 'this folder');
    parentId = input.parentId ? Number(input.parentId) : null;
    requireLevel(parentId ? access.folderLevel(parentId) : access.root, LEVEL.edit, 'the destination');
    if (parentId && access.isWithin(parentId, id)) throw httpError(400, 'A folder cannot be moved into itself');
  }
  await query(
    `UPDATE kb_folders SET name = $2, description = $3, icon = $4, color = $5, parent_id = $6,
       updated_by = $7, updated_at = NOW() WHERE id = $1`,
    [id, fields.name, fields.description, fields.icon, fields.color, parentId, ctx.userId]
  );
}

export async function deleteFolder(ctx, id) {
  const access = await loadAccess(ctx);
  requireLevel(access.folderLevel(id), LEVEL.manage, 'this folder');
  const files = await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM kb_folders WHERE id = $1
       UNION ALL SELECT f.id FROM kb_folders f JOIN tree t ON f.parent_id = t.id
     )
     SELECT i.file_name FROM kb_items i WHERE i.folder_id IN (SELECT id FROM tree) AND i.file_name IS NOT NULL AND i.file_node_id IS NULL`,
    [id]
  );
  const ids = await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM kb_folders WHERE id = $1
       UNION ALL SELECT f.id FROM kb_folders f JOIN tree t ON f.parent_id = t.id
     ) SELECT id FROM tree`,
    [id]
  );
  await withTransaction(async (client) => {
    const folderIds = ids.rows.map((row) => row.id);
    await client.query(
      `DELETE FROM kb_acl WHERE (resource_type = 'folder' AND resource_id = ANY($1))
         OR (resource_type = 'item' AND resource_id IN (SELECT id FROM kb_items WHERE folder_id = ANY($1)))`,
      [folderIds]
    );
    await client.query(`DELETE FROM kb_folders WHERE id = $1`, [id]);
  });
  await Promise.all(files.rows.map((row) => removeStoredFile(row.file_name)));
}

// ── Items ───────────────────────────────────────────────────────────────────

function validUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return url.toString();
  } catch {
    throw httpError(400, 'Link must be a valid http(s) URL');
  }
}

/** Article body format: Markdown by default, HTML from the visual editor. */
export function contentFormat(value) {
  return value === 'html' ? 'html' : 'md';
}

export async function createItem(ctx, input) {
  const folderId = Number(input.folderId);
  const access = await loadAccess(ctx);
  requireLevel(access.folderLevel(folderId), LEVEL.edit, 'this folder');
  const kind = input.kind === 'link' ? 'link' : 'article';
  const title = clean(input.title, 200);
  if (!title) throw httpError(400, 'Title is required');
  const result = await query(
    `INSERT INTO kb_items (folder_id, kind, title, description, content, url, created_by, updated_by, content_format)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8) RETURNING id`,
    [
      folderId,
      kind,
      title,
      clean(input.description, 1000),
      kind === 'article' ? String(input.content || '').slice(0, 500000) : null,
      kind === 'link' ? validUrl(input.url) : null,
      ctx.userId,
      contentFormat(input.format),
    ]
  );
  const itemId = result.rows[0].id;
  if (kind === 'article') {
    try {
      await syncAttachments(ctx, itemId, input.content, input.attachments);
    } catch (err) {
      await query(`DELETE FROM kb_items WHERE id = $1`, [itemId]);
      throw err;
    }
  }
  return itemId;
}

export async function updateItem(ctx, id, input) {
  const access = await loadAccess(ctx);
  const row = await loadItemRow(id);
  requireLevel(access.itemLevel(row), LEVEL.edit, 'this material');
  let folderId = row.folder_id;
  if (input.folderId !== undefined && Number(input.folderId) !== row.folder_id) {
    folderId = Number(input.folderId);
    requireLevel(access.folderLevel(folderId), LEVEL.edit, 'the destination');
  }
  const title = clean(input.title ?? row.title, 200);
  if (!title) throw httpError(400, 'Title is required');
  // Everything is checked before anything is written: a rejected attachment
  // must not leave the new text saved without its files (or the other way round).
  const values = [
    id,
    folderId,
    title,
    clean(input.description ?? row.description, 1000),
    row.kind === 'article' ? String(input.content ?? row.content ?? '').slice(0, 500000) : null,
    row.kind === 'link' ? validUrl(input.url ?? row.url) : null,
    ctx.userId,
    contentFormat(input.format ?? row.content_format),
  ];
  const plan =
    row.kind === 'article' && (input.content !== undefined || input.attachments !== undefined)
      ? await planAttachments(ctx, id, input.content ?? row.content, input.attachments)
      : null;
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE kb_items SET folder_id = $2, title = $3, description = $4, content = $5, url = $6,
         updated_by = $7, content_format = $8, updated_at = NOW() WHERE id = $1`,
      values
    );
    if (plan) await writeAttachments(client, plan);
  });
}

export async function deleteItem(ctx, id) {
  const access = await loadAccess(ctx);
  const row = await loadItemRow(id);
  requireLevel(access.itemLevel(row), LEVEL.edit, 'this material');
  await query(`DELETE FROM kb_acl WHERE resource_type = 'item' AND resource_id = $1`, [id]);
  await query(`DELETE FROM kb_items WHERE id = $1`, [id]);
  // Files-backed materials leave the file in its owner's Files.
  if (row.file_name && !row.file_node_id) await removeStoredFile(row.file_name);
}

// ── Access settings ─────────────────────────────────────────────────────────

async function resourceLevel(access, type, id) {
  if (type === 'root') return access.root;
  if (type === 'folder') return access.folderLevel(id);
  return access.itemLevel(await loadItemRow(id));
}

export async function getAccess(ctx, type, id) {
  const access = await loadAccess(ctx);
  requireLevel(await resourceLevel(access, type, id), LEVEL.manage, 'access');
  let inherit = null;
  if (type === 'folder') inherit = (await query(`SELECT inherit_access FROM kb_folders WHERE id = $1`, [id])).rows[0]?.inherit_access;
  if (type === 'item') inherit = (await loadItemRow(id)).inherit_access;
  return { inherit, entries: await readAcl(type, id) };
}

/**
 * Saves access for the base, a folder or a material. The editor keeps at least
 * manage for themselves (unless they are a knowledge-base admin), so nobody
 * locks themselves out by accident.
 */
export async function setAccess(ctx, type, id, { inherit, entries }) {
  const access = await loadAccess(ctx);
  requireLevel(await resourceLevel(access, type, id), LEVEL.manage, 'access');
  await withTransaction(async (client) => {
    await writeAcl(client, type, type === 'root' ? 0 : id, entries);
    if (typeof inherit === 'boolean' && type !== 'root') {
      const table = type === 'folder' ? 'kb_folders' : 'kb_items';
      await client.query(`UPDATE ${table} SET inherit_access = $2 WHERE id = $1`, [id, inherit]);
    }
  });
  if (!ctx.isAdmin) {
    const after = await loadAccess(ctx);
    if ((await resourceLevel(after, type, id)) < LEVEL.manage) {
      // Roll back to the previous state would need a snapshot; instead grant the editor manage explicitly.
      await query(
        `INSERT INTO kb_acl (resource_type, resource_id, subject_type, subject_id, level)
         VALUES ($1, $2, 'user', $3, 3)
         ON CONFLICT (resource_type, resource_id, subject_type, COALESCE(subject_id, 0)) DO UPDATE SET level = 3`,
        [type, type === 'root' ? 0 : id, ctx.userId]
      );
    }
  }
}

/** Who can be granted access: everyone, users, groups and roles (names only). */
export async function listSubjects() {
  const [users, groups, roles] = await Promise.all([
    query(`SELECT id, username, COALESCE(display_name, username) AS name FROM users WHERE is_active IS NOT FALSE ORDER BY LOWER(COALESCE(display_name, username))`),
    query(`SELECT id, name FROM app_groups ORDER BY LOWER(name)`),
    query(`SELECT id, key, name, is_system FROM app_roles ORDER BY sort, name`),
  ]);
  return {
    users: users.rows,
    groups: groups.rows,
    roles: roles.rows.map((row) => ({ id: row.id, key: row.key, name: row.name, isSystem: row.is_system })),
  };
}
