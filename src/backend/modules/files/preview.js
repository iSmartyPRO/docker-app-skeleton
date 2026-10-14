import { query } from '../../config/database.js';
import { storagePath } from '../shared/storage.js';
import { resolveLink } from './links.js';

/*
 * What a messenger preview of /l/<token|slug> may show (services/linkPreview).
 * Exactly what the public page shows an anonymous visitor, never more: a
 * password-protected link is only "locked" (no name, no kind), every refused
 * link the same "invalid" (unknown, revoked, expired, author gone…), and an
 * upload-only link never reveals what is in its folder.
 */

const REFUSED = new Set(['NOT_FOUND', 'EXPIRED', 'OWNER_INACTIVE', 'OWNER_NO_ACCESS', 'LINK_DISABLED']);
const THUMB_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif']);

export async function filesPreview(token) {
  let link;
  try {
    link = await resolveLink(token, null);
  } catch (err) {
    if (err.code === 'PASSWORD_REQUIRED') return { state: 'locked' };
    if (REFUSED.has(err.code)) return { state: 'invalid' };
    throw err;
  }
  const model = {
    state: 'ok',
    module: 'files',
    kind: link.kind === 'folder' ? 'folder' : 'file',
    name: link.name,
    title: link.title || '',
    perms: link.perms,
    expiresAt: link.expires_at || null,
    owner: link.author_name || '',
    version: link.version,
  };
  // A file request shows the folder's name only.
  if (!link.perms.includes('view')) return model;
  if (model.kind === 'folder') {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE kind <> 'folder')::int AS files, COUNT(*) FILTER (WHERE kind = 'folder')::int AS folders
       FROM fs_nodes WHERE parent_id = $1 AND deleted_at IS NULL`,
      [link.node_id]
    );
    model.files = rows[0]?.files ?? 0;
    model.folders = rows[0]?.folders ?? 0;
    return model;
  }
  const { rows } = await query(`SELECT size, ext, storage_key, updated_at FROM fs_nodes WHERE id = $1`, [link.node_id]);
  const node = rows[0];
  if (!node) return model;
  model.size = Number(node.size) || 0;
  model.ext = String(node.ext || '').toLowerCase();
  // A real picture of an image file goes into the card (view rights, no password: already true here).
  if (THUMB_EXTS.has(model.ext) && node.storage_key && model.size <= 6 * 1024 * 1024) {
    model.thumb = { kind: 'file', path: storagePath(node.storage_key), key: `fs-${link.node_id}-${new Date(node.updated_at).getTime()}-${model.size}` };
  }
  return model;
}
