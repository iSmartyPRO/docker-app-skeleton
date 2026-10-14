import { query } from '../../config/database.js';
import { addressMatch, addressOrder } from '../shared/linkSlug.js';
import { driveSettings } from './credentials.js';
import { effectivePerms } from './linkPerms.js';
import { openLink } from './links.js';
import { extOf } from '../shared/storage.js';
import { listFolder, statEntry, thumbFile } from './service.js';

/*
 * What a messenger preview of /d/<token|slug> may show (services/linkPreview).
 * The same rules as the public page for an anonymous visitor, but stricter
 * where the page is generous: a password-protected link shows nothing about
 * the item (not even its kind), a refused link is one generic "invalid" card.
 *
 * Size and item count come from the file server, so they are asked for only
 * when `facts` is set (crawlers, the preview picture) and only for a few
 * seconds; people opening the link get the page without waiting for them.
 */

const REFUSED = new Set(['NOT_FOUND', 'REVOKED', 'EXPIRED', 'OWNER_INACTIVE', 'LINKS_DISABLED', 'UPLOADS_DISABLED', 'OWNER_NO_ACCESS', 'GONE']);
const THUMB_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif']);
const FACTS_MS = 3000;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolveLater) => setTimeout(() => resolveLater(null), ms).unref?.())]).catch(() => null);

function baseModel(row, perms) {
  return {
    state: 'ok',
    module: 'drive',
    kind: row.kind === 'file' ? 'file' : 'folder',
    name: row.name,
    title: row.title || '',
    note: row.note || '',
    perms,
    expiresAt: row.expires_at || null,
    owner: row.owner_name || '',
    ext: row.kind === 'file' ? extOf(row.name) : '',
    version: row.version,
  };
}

export async function drivePreview(token, { facts = false } = {}) {
  let opened;
  try {
    opened = await openLink(token, null, null);
  } catch (err) {
    if (err.code === 'PASSWORD_REQUIRED') return { state: 'locked' };
    if (err.code === 'SIGN_IN_REQUIRED') return { state: 'employees' };
    if (err.code === 'UNAVAILABLE') {
      // The file server is down, the link itself is fine (and has no password: checked before).
      const { rows } = await query(
        `SELECT l.*, COALESCE(u.display_name, u.username) AS owner_name FROM drive_links l JOIN users u ON u.id = l.created_by
         WHERE ${addressMatch('l', 1)} ${addressOrder('l', 1)}`,
        [String(token || '').slice(0, 64)]
      );
      if (!rows[0]) return { state: 'invalid' };
      return baseModel(rows[0], effectivePerms(rows[0], await driveSettings()));
    }
    if (REFUSED.has(err.code)) return { state: 'invalid' };
    throw err;
  }
  const { link, target, perms } = opened;
  const model = baseModel(link, perms);
  // A file request never shows what is in its folder.
  if (!facts || !perms.includes('view')) return model;
  if (model.kind === 'folder') {
    const listing = await withTimeout(listFolder(target, link.path), FACTS_MS);
    if (listing) {
      model.files = listing.entries.filter((entry) => !entry.dir).length;
      model.folders = listing.entries.filter((entry) => entry.dir).length;
    }
    return model;
  }
  const stat = await withTimeout(statEntry(target, link.path), FACTS_MS);
  if (stat?.entry) {
    model.size = stat.entry.size;
    if (THUMB_EXTS.has(model.ext)) {
      const { entry } = stat;
      model.thumb = {
        kind: 'drive',
        key: `drv-${link.id}-${entry.mtime || ''}-${entry.size}`,
        load: () => withTimeout(thumbFile(target, link.path, 640, entry), 8000),
      };
    }
  }
  return model;
}
