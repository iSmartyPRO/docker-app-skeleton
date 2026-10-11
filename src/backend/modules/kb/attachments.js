import { basename, join } from 'path';
import { query, withTransaction } from '../../config/database.js';
import { httpError } from './access.js';
import { kbDir } from './files.js';
import { officePreview, sendBlob, sendPdf, storagePath } from '../shared/storage.js';
import { attachmentShape, usableFile } from '../files/kb.js';

/*
 * Files of knowledge-base materials, stored in the Files module:
 *  - a "file" material points at one file (kb_items.file_node_id)
 *  - an article can embed files (kbfile:<id> in its Markdown) and carry
 *    attachments; both are rows of kb_item_files
 * Whoever can see the material can open its files; Files access is not needed.
 */

const EMBED = /kbfile:(\d{1,10})/g;

/** Blob location of a material's own file (Files node, or a pre-Files upload). */
async function itemBlob(row) {
  if (row.kind !== 'file') throw httpError(404, 'Not found', 'NOT_FOUND');
  if (row.file_node_id) {
    const { rows } = await query(`SELECT * FROM fs_nodes WHERE id = $1`, [row.file_node_id]);
    const node = rows[0];
    if (!node) throw httpError(404, 'File is missing', 'FILE_MISSING');
    return { path: storagePath(node.storage_key), ext: node.ext, name: row.file_original || node.name, version: node.updated_at, key: `fs-${node.id}` };
  }
  return { path: join(kbDir, basename(row.file_name || '')), ext: row.file_ext, name: row.file_original, version: row.updated_at, key: `kb-${row.id}` };
}

export async function sendItemFile(res, row, download) {
  const blob = await itemBlob(row);
  await sendBlob(res, blob.path, { name: blob.name, ext: blob.ext, download });
}

export async function sendItemPreview(res, row) {
  const blob = await itemBlob(row);
  sendPdf(res, await officePreview({ cacheKey: blob.key, version: blob.version, path: blob.path, name: blob.name, ext: blob.ext }), row.title);
}

export async function attachmentsOf(itemId) {
  const { rows } = await query(
    `SELECT n.*, f.inline FROM kb_item_files f JOIN fs_nodes n ON n.id = f.node_id WHERE f.item_id = $1 ORDER BY f.inline, f.sort, LOWER(n.name)`,
    [itemId]
  );
  return rows.map((row) => attachmentShape(row, row.inline));
}

/**
 * Recomputes an article's files from its Markdown (kbfile:<id>) plus the
 * explicit attachment list. New files must be ones the editor can open in
 * Files; files already attached stay even if the editor cannot see them.
 */
export async function syncAttachments(ctx, itemId, content, explicit) {
  const embedded = new Set([...String(content || '').matchAll(EMBED)].map((match) => Number(match[1])));
  const current = await query(`SELECT node_id FROM kb_item_files WHERE item_id = $1`, [itemId]);
  const had = new Set(current.rows.map((row) => row.node_id));
  const listed = Array.isArray(explicit) ? explicit.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [...had].filter((id) => !embedded.has(id));
  const wanted = [...new Set([...embedded, ...listed])].slice(0, 200);
  const filesCtx = { ...ctx, isAdmin: false };
  for (const nodeId of wanted) {
    if (!had.has(nodeId)) await usableFile(filesCtx, nodeId);
  }
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM kb_item_files WHERE item_id = $1 AND NOT (node_id = ANY($2))`, [itemId, wanted]);
    for (const [index, nodeId] of wanted.entries()) {
      await client.query(
        `INSERT INTO kb_item_files (item_id, node_id, inline, sort) VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, node_id) DO UPDATE SET inline = EXCLUDED.inline, sort = EXCLUDED.sort`,
        [itemId, nodeId, embedded.has(nodeId), index]
      );
    }
  });
}

async function attachedNode(itemId, nodeId) {
  const { rows } = await query(
    `SELECT n.* FROM kb_item_files f JOIN fs_nodes n ON n.id = f.node_id WHERE f.item_id = $1 AND f.node_id = $2`,
    [itemId, Number(nodeId)]
  );
  if (!rows[0] || rows[0].deleted_at) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

export async function sendAttachment(res, itemId, nodeId, download) {
  const node = await attachedNode(itemId, nodeId);
  await sendBlob(res, storagePath(node.storage_key), { name: node.name, ext: node.ext, download });
}

export async function sendAttachmentPreview(res, itemId, nodeId) {
  const node = await attachedNode(itemId, nodeId);
  const path = await officePreview({ cacheKey: `fs-${node.id}`, version: node.updated_at, path: storagePath(node.storage_key), name: node.name, ext: node.ext });
  sendPdf(res, path, node.name.replace(/\.[^.]+$/, ''));
}

/** Adds existing Files files to a folder as "file" materials. */
export async function addFromFiles(ctx, folderId, nodeIds) {
  const ids = [...new Set((Array.isArray(nodeIds) ? nodeIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (!ids.length) throw httpError(400, 'Choose files', 'NO_FILES');
  const filesCtx = { ...ctx, isAdmin: false };
  const nodes = [];
  for (const nodeId of ids) nodes.push(await usableFile(filesCtx, nodeId));
  const created = [];
  for (const node of nodes) {
    const { rows } = await query(
      `INSERT INTO kb_items (folder_id, kind, title, file_node_id, file_original, file_mime, file_size, file_ext, created_by, updated_by)
       VALUES ($1, 'file', $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
      [folderId, node.name.replace(/\.[^.]+$/, '').slice(0, 200) || node.name, node.id, node.name, node.mime, node.size, node.ext, ctx.userId]
    );
    created.push(rows[0]);
  }
  return created;
}
