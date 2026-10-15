import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { pipeline } from 'stream';
import { query, withTransaction } from '../../config/database.js';
import { hasPermission } from '../../services/permissions.js';
import { bodyToFile, checkOfficeFile } from '../../services/office/content.js';
import { locksOf } from '../../services/office/locks.js';
import { editorSession } from '../../services/office/session.js';
import { registerProvider } from '../../services/office/wopi.js';
import { LEVEL, httpError } from '../shared/acl.js';
import { mimeOf, newStorageKey, removeBlob, storagePath } from '../shared/storage.js';
import { nodeAccess, requireNode } from './access.js';
import { filesSettings, lockQuota, usageOf, usedBytes } from './service.js';

/*
 * Files ↔ online editor (WOPI provider "files"). The WOPI file id is
 * "files-<node id>"; the person's current level on the node decides reading
 * (view) and saving (edit), checked on every call.
 *
 * Saving (PutFile) streams the new content into a new blob and swaps it in,
 * with the same rules as "Replace": file size limit, personal quota (under
 * the owner's lock), content check. Files keeps no version history, so the
 * content before an editing session is kept once per session as a copy in
 * the trash (restorable by the owner); later autosaves of the same session
 * just replace the blob.
 */

export const lockKeyOf = (nodeId) => `files:${Number(nodeId)}`;

function ctxOf(who) {
  const access = who.access || {};
  return {
    userId: who.row.id,
    groupIds: new Set(access.groupIds || []),
    roleIds: new Set((access.roles || []).map((role) => role.id)),
    isAdmin: hasPermission(access.permissions || [], 'files.admin'),
    limits: null,
  };
}

function handleOf(access) {
  const node = access.node;
  const at = new Date(node.updated_at);
  return {
    lockKey: lockKeyOf(node.id),
    canRead: access.level >= LEVEL.view && !access.trashed && node.kind === 'file',
    canWrite: access.level >= LEVEL.edit && !access.trashed && node.kind === 'file',
    name: node.name,
    size: Number(node.size) || 0,
    version: `${at.getTime()}-${Number(node.size) || 0}`,
    lastModified: at,
    ownerId: node.owner_id ? `u${node.owner_id}` : `s${node.space_id || 0}`,
    breadcrumb: access.visibleChain.length > 1 ? access.visibleChain[access.visibleChain.length - 2].name : null,
    node,
  };
}

async function resolve(localId, who) {
  const id = Number(localId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  const ctx = ctxOf(who);
  const access = await nodeAccess(ctx, id);
  return { ...handleOf(access), ctx };
}

async function read(handle, req, res) {
  const path = storagePath(handle.node.storage_key);
  const info = await stat(path).catch(() => null);
  if (!info) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(info.size));
  pipeline(createReadStream(path), res, () => {});
}

async function write(handle, req, info, who) {
  if (req._body || req.readableEnded) throw httpError(415, 'Send the file as the raw request body', 'RAW_BODY_REQUIRED');
  const node = handle.node;
  const settings = await filesSettings();
  const key = await newStorageKey(node.ext);
  const file = storagePath(key);
  const size = await bodyToFile(req, file, settings.maxUploadMb * 1024 * 1024);
  let previousKey = null;
  let row;
  try {
    await checkOfficeFile(file, node.ext);
    const quota = node.space_id ? 0 : (await usageOf(node.owner_id)).quota;
    row = await withTransaction(async (client) => {
      if (quota) await lockQuota(client, node.owner_id);
      const { rows: locked } = await client.query(`SELECT * FROM fs_nodes WHERE id = $1 FOR UPDATE`, [node.id]);
      const current = locked[0];
      if (!current || current.deleted_at || current.kind !== 'file') throw httpError(404, 'Not found', 'NOT_FOUND');
      // The first save of a session keeps the previous content (as a trash copy, like "Replace").
      const keepPrevious = info.firstSave;
      if (quota) {
        const used = await usedBytes(client, node.owner_id);
        const after = used + size - (keepPrevious ? 0 : Number(current.size) || 0);
        if (after > quota) throw httpError(413, 'Your storage is full', 'QUOTA_EXCEEDED');
      }
      if (keepPrevious) {
        await client.query(
          `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by)
           SELECT kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at, NOW(), $2
           FROM fs_nodes WHERE id = $1`,
          [current.id, who.row.id]
        );
      } else {
        previousKey = current.storage_key;
      }
      const { rows } = await client.query(
        `UPDATE fs_nodes SET storage_key = $2, size = $3, mime = $4, updated_by = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [current.id, key, size, mimeOf(current.ext), who.row.id]
      );
      return rows[0];
    });
  } catch (err) {
    await removeBlob(key);
    throw err;
  }
  // An autosave replaced the previous autosave: its blob is no longer referenced by anything.
  if (previousKey) {
    const { rows } = await query(`SELECT 1 FROM fs_nodes WHERE storage_key = $1 LIMIT 1`, [previousKey]);
    if (!rows.length) await removeBlob(previousKey);
  }
  const at = new Date(row.updated_at);
  return { lastModified: at, size, version: `${at.getTime()}-${size}` };
}

registerProvider({ prefix: 'files', module: 'files', resolve, read, write });

/** POST /api/app/files/nodes/:id/editor — the editor frame for a file. */
export async function openEditor(req, ctx, id, body = {}) {
  const access = await requireNode(ctx, id, LEVEL.view);
  const node = access.node;
  if (node.kind !== 'file' || access.trashed) throw httpError(404, 'Not found', 'NOT_FOUND');
  const session = await editorSession(req, {
    fileId: `files-${node.id}`,
    ext: node.ext,
    canWrite: access.level >= LEVEL.edit,
    want: body.mode === 'view' ? 'view' : 'edit',
    lockKey: lockKeyOf(node.id),
    lang: body.lang,
    dark: Boolean(body.dark),
  });
  return { ...session, file: { id: node.id, name: node.name, ext: node.ext, size: Number(node.size) || 0, updatedAt: node.updated_at } };
}

/** Marks files that are open in the editor right now: item.editingBy = name. */
export async function withEditors(items) {
  const files = (items || []).filter((item) => item?.kind === 'file');
  if (!files.length) return items;
  let locks;
  try {
    locks = await locksOf(files.map((item) => lockKeyOf(item.id)));
  } catch {
    return items;
  }
  for (const item of files) {
    const lock = locks.get(lockKeyOf(item.id));
    if (lock) item.editingBy = lock.userName || '—';
  }
  return items;
}
