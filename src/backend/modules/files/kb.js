import { query, withTransaction } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { LEVEL, httpError } from '../shared/acl.js';
import { extOf, mimeOf } from '../shared/storage.js';
import { nodeAccess } from './access.js';
import { fileUploader, runUpload, storeUploads } from './service.js';
import { tr } from '../../services/i18n/index.js';

/*
 * The Knowledge Base keeps its files in Files:
 *  - uploads into the KB land in the uploader's "My files / Knowledge base"
 *  - existing files can be added to the KB from Files
 *  - articles embed or attach files (kb_item_files)
 * KB readers reach these files through the KB (its access rules), never
 * through Files access.
 */


export async function ensureKbFolder(userId, locale = 'en') {
  const existing = await query(
    `SELECT * FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND parent_id IS NULL AND system_tag = 'kb' AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await query(
    `INSERT INTO fs_nodes (kind, name, owner_id, system_tag, created_by, updated_by) VALUES ('folder', $1, $2, 'kb', $2, $2) RETURNING *`,
    [tr(locale, 'files.kbFolder'), userId]
  );
  return rows[0];
}

/** Multipart upload into the user's KB folder, with the knowledge-base limits. */
export async function uploadForKb(ctx, req, res, { maxUploadMb, fileGroups, locale }) {
  // KB uploads land in the person's own files, which a space-limited token does not reach.
  if (ctx.limits?.fs_space_acl) throw httpError(403, 'The API token is limited to selected spaces', 'TOKEN_LIMITED');
  const folder = await ensureKbFolder(ctx.userId, locale);
  const upload = await fileUploader({ maxUploadMb, fileGroups, allowAny: false });
  await runUpload(upload, req, res);
  return storeUploads(ctx, { parentId: folder.id, spaceId: null, ownerId: ctx.userId }, req.files || []);
}

/**
 * A file the user may put into the KB: edit access, not in the trash. Viewing
 * is not enough: the KB republishes the file to its own readers and keeps it
 * from being deleted, which only someone who may change the file can decide.
 */
export async function usableFile(ctx, nodeId) {
  const access = await nodeAccess(ctx, nodeId);
  if (access.level < LEVEL.view || access.trashed) throw httpError(404, 'File not found', 'NOT_FOUND');
  if (access.level < LEVEL.edit) throw httpError(403, 'You need edit access to this file to use it in the knowledge base', 'FORBIDDEN');
  if (access.node.kind !== 'file') throw httpError(400, 'Choose a file, not a folder', 'NOT_FILE');
  return access.node;
}

export async function nodesById(ids) {
  if (!ids.length) return [];
  const { rows } = await query(`SELECT * FROM fs_nodes WHERE id = ANY($1)`, [ids]);
  return rows;
}

export function attachmentShape(row, inline = false) {
  return {
    nodeId: row.id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size) || 0,
    ext: row.ext,
    inline,
    available: !row.deleted_at,
  };
}

/**
 * One-time move of knowledge-base files (uploads/kb/…) into Files: each file
 * becomes a node in its author's "Knowledge base" folder. Blobs stay where
 * they are; the node just points at them.
 */
export async function migrateKbFiles() {
  if ((await getSetting('kb_files_migrated')) === 'true') return;
  const { rows } = await query(
    `SELECT i.*, COALESCE(u.locale, 'en') AS locale FROM kb_items i LEFT JOIN users u ON u.id = i.created_by
     WHERE i.kind = 'file' AND i.file_node_id IS NULL AND i.file_name IS NOT NULL`
  );
  if (rows.length) {
    const fallback = await query(`SELECT id, locale FROM users ORDER BY id LIMIT 1`);
    for (const row of rows) {
      const ownerId = row.created_by || fallback.rows[0]?.id;
      if (!ownerId) continue;
      const folder = await ensureKbFolder(ownerId, row.created_by ? row.locale : fallback.rows[0]?.locale);
      const name = String(row.file_original || row.title || 'file').slice(0, 255);
      const ext = row.file_ext || extOf(name);
      await withTransaction(async (client) => {
        const node = await client.query(
          `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at)
           VALUES ('file', $1, $2, $3, $4, $5, $6, $7, $3, $3, $8, $8) RETURNING id`,
          [name, folder.id, ownerId, `kb/${row.file_name}`, row.file_mime || mimeOf(ext), Number(row.file_size) || 0, ext, row.created_at]
        );
        await client.query(`UPDATE kb_items SET file_node_id = $2 WHERE id = $1`, [row.id, node.rows[0].id]);
      });
    }
    console.log(`Knowledge base: ${rows.length} file(s) moved into Files`);
  }
  await setSetting('kb_files_migrated', 'true');
}
