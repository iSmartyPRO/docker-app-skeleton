import { query } from '../../config/database.js';
import { excerpt } from '../../services/linkPreview/meta.js';
import { loadAccess } from './access.js';
import { resolveShare } from './shares.js';

/*
 * What a messenger preview of a knowledge base link may show
 * (services/linkPreview): /s/<slug>, /s/<slug>/f/<folderId>, /s/<slug>/d/<itemId>.
 * Only what the public page shows: the shared folder and what inherits its
 * access. A password-protected share is "locked", a refused one "invalid";
 * a folder or article outside the share falls back to the share itself.
 */

const REFUSED = new Set(['NOT_FOUND', 'EXPIRED', 'OWNER_INACTIVE', 'OWNER_NO_ACCESS']);

async function countsOf(folderId) {
  const { rows } = await query(
    `SELECT (SELECT COUNT(*) FROM kb_folders WHERE parent_id = $1 AND inherit_access)::int
          + (SELECT COUNT(*) FROM kb_items WHERE folder_id = $1 AND inherit_access)::int AS n`,
    [folderId]
  );
  return rows[0]?.n ?? 0;
}

export async function kbPreview(slug, { folderId = null, itemId = null } = {}) {
  let share;
  try {
    share = await resolveShare(slug, null);
  } catch (err) {
    if (err.code === 'PASSWORD_REQUIRED') return { state: 'locked' };
    if (REFUSED.has(err.code)) return { state: 'invalid' };
    throw err;
  }
  const base = { state: 'ok', module: 'kb', expiresAt: share.expires_at || null, version: share.version };
  const inside = async (id) => {
    if (id === share.folder_id) return true;
    const access = await loadAccess({ isAdmin: true });
    return access.inheritsFrom(id, share.folder_id);
  };

  if (itemId) {
    const { rows } = await query(
      `SELECT id, folder_id, kind, title, description, content, content_format, file_ext, file_size, inherit_access FROM kb_items WHERE id = $1`,
      [itemId]
    );
    const item = rows[0];
    if (item?.inherit_access && (await inside(item.folder_id))) {
      const html = item.content_format === 'html';
      return {
        ...base,
        kind: item.kind === 'file' ? 'file' : item.kind === 'link' ? 'link' : 'article',
        name: item.title,
        title: '',
        ext: item.kind === 'file' ? String(item.file_ext || '').toLowerCase() : '',
        size: item.kind === 'file' ? Number(item.file_size) || 0 : undefined,
        excerpt: item.description || (item.kind === 'article' ? excerpt(item.content, { html, skip: item.title }) : ''),
      };
    }
  }

  let folder = null;
  if (folderId && folderId !== share.folder_id && (await inside(folderId))) {
    folder = (await query(`SELECT id, name, description FROM kb_folders WHERE id = $1`, [folderId])).rows[0] || null;
  }
  const root = folder || (await query(`SELECT id, name, description FROM kb_folders WHERE id = $1`, [share.folder_id])).rows[0];
  if (!root) return { state: 'invalid' };
  return {
    ...base,
    kind: 'folder',
    name: root.name,
    // The share's own title names the shared folder only.
    title: folder ? '' : share.title || '',
    items: await countsOf(root.id),
    excerpt: root.description || '',
  };
}
