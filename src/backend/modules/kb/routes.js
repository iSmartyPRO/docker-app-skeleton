import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../../config/database.js';
import { LEVEL, contextFromRequest, httpError, loadAccess, requireLevel } from './access.js';
import {
  createFolder,
  createItem,
  deleteFolder,
  deleteItem,
  getAccess,
  getFolder,
  getHome,
  getItem,
  getTree,
  itemShape,
  listSubjects,
  loadItemRow,
  search,
  setAccess,
  updateFolder,
  updateItem,
} from './service.js';
import {
  CONVERTIBLE,
  kbSettings,
} from './files.js';
import {
  checkSlug,
  countView,
  createShare,
  deleteShare,
  listShares,
  resolveShare,
  shareShape,
  slugify,
  unlockShare,
  updateShare,
} from './shares.js';
import { addFromFiles, attachmentsOf, sendAttachment, sendAttachmentPreview, sendItemFile, sendItemPreview } from './attachments.js';
import { uploadForKb } from '../files/kb.js';

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

const id = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  return n;
};

// ── Signed-in users: /api/app/kb ───────────────────────────────────────────

export function privateRoutes() {
  const router = Router();

  router.use((req, res, next) => {
    req.kb = contextFromRequest(req);
    next();
  });

  router.get('/', wrap(async (req, res) => {
    const { module, conversion } = await kbSettings();
    res.json({
      success: true,
      ...(await getHome(req.kb)),
      config: {
        defaultIcon: module.defaultIcon,
        defaultColor: module.defaultColor,
        maxUploadMb: module.maxUploadMb,
        publicLinks: module.publicLinks,
        requireSharePassword: module.requireSharePassword,
        maxShareDays: module.maxShareDays,
        conversion: Boolean(conversion?.enabled && conversion?.serverUrl),
        isAdmin: req.kb.isAdmin,
      },
    });
  }));

  router.get('/tree', wrap(async (req, res) => {
    res.json({ success: true, ...(await getTree(req.kb)) });
  }));

  router.get('/search', wrap(async (req, res) => {
    res.json({ success: true, ...(await search(req.kb, req.query.q)) });
  }));

  // Folders
  router.get('/folders/:id', wrap(async (req, res) => {
    res.json({ success: true, ...(await getFolder(req.kb, id(req.params.id))) });
  }));
  router.post('/folders', wrap(async (req, res) => {
    res.status(201).json({ success: true, id: await createFolder(req.kb, req.body || {}) });
  }));
  router.put('/folders/:id', wrap(async (req, res) => {
    await updateFolder(req.kb, id(req.params.id), req.body || {});
    res.json({ success: true });
  }));
  router.delete('/folders/:id', wrap(async (req, res) => {
    await deleteFolder(req.kb, id(req.params.id));
    res.json({ success: true });
  }));

  // Upload: access is checked before multer touches the disk. Files are kept
  // in Files ("My files / Knowledge base" of the uploader) and linked here.
  router.post('/folders/:id/files', wrap(async (req, res) => {
    const folderId = id(req.params.id);
    const access = await loadAccess(req.kb);
    requireLevel(access.folderLevel(folderId), LEVEL.edit, 'this folder');
    const { module } = await kbSettings();
    const nodes = await uploadForKb(req.kb, req, res, { maxUploadMb: module.maxUploadMb, fileGroups: module.fileGroups, locale: req.locale });
    const created = [];
    for (const node of nodes) {
      const result = await query(
        `INSERT INTO kb_items (folder_id, kind, title, file_node_id, file_original, file_mime, file_size, file_ext, created_by, updated_by)
         VALUES ($1, 'file', $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
        [folderId, node.name.replace(/\.[^.]+$/, '').slice(0, 200) || node.name, node.id, node.name, node.mime, node.size, node.ext, req.kb.userId]
      );
      created.push(itemShape(result.rows[0], LEVEL.edit));
    }
    res.status(201).json({ success: true, items: created });
  }));

  // Existing files from Files become materials of this folder.
  router.post('/folders/:id/from-files', wrap(async (req, res) => {
    const folderId = id(req.params.id);
    const access = await loadAccess(req.kb);
    requireLevel(access.folderLevel(folderId), LEVEL.edit, 'this folder');
    const rows = await addFromFiles(req.kb, folderId, req.body?.nodeIds);
    res.status(201).json({ success: true, items: rows.map((row) => itemShape(row, LEVEL.edit)) });
  }));

  // Items
  router.post('/items', wrap(async (req, res) => {
    res.status(201).json({ success: true, id: await createItem(req.kb, req.body || {}) });
  }));
  router.get('/items/:id', wrap(async (req, res) => {
    res.json({ success: true, ...(await getItem(req.kb, id(req.params.id))) });
  }));
  router.put('/items/:id', wrap(async (req, res) => {
    await updateItem(req.kb, id(req.params.id), req.body || {});
    res.json({ success: true });
  }));
  router.delete('/items/:id', wrap(async (req, res) => {
    await deleteItem(req.kb, id(req.params.id));
    res.json({ success: true });
  }));
  router.get('/items/:id/file', wrap(async (req, res) => {
    const row = await loadItemRow(id(req.params.id));
    const access = await loadAccess(req.kb);
    requireLevel(access.itemLevel(row), LEVEL.view);
    await sendItemFile(res, row, req.query.download === '1');
  }));
  router.get('/items/:id/preview.pdf', wrap(async (req, res) => {
    const row = await loadItemRow(id(req.params.id));
    const access = await loadAccess(req.kb);
    requireLevel(access.itemLevel(row), LEVEL.view);
    await sendItemPreview(res, row);
  }));
  // Files embedded in / attached to an article.
  router.get('/items/:id/attachments/:nodeId', wrap(async (req, res) => {
    const row = await loadItemRow(id(req.params.id));
    const access = await loadAccess(req.kb);
    requireLevel(access.itemLevel(row), LEVEL.view);
    await sendAttachment(res, row.id, id(req.params.nodeId), req.query.download === '1');
  }));
  router.get('/items/:id/attachments/:nodeId/preview.pdf', wrap(async (req, res) => {
    const row = await loadItemRow(id(req.params.id));
    const access = await loadAccess(req.kb);
    requireLevel(access.itemLevel(row), LEVEL.view);
    await sendAttachmentPreview(res, row.id, id(req.params.nodeId));
  }));

  // Access
  router.get('/subjects', wrap(async (req, res) => {
    res.json({ success: true, ...(await listSubjects()) });
  }));
  router.get('/access/:type/:id', wrap(async (req, res) => {
    const type = ['root', 'folder', 'item'].includes(req.params.type) ? req.params.type : null;
    if (!type) throw httpError(404, 'Not found');
    res.json({ success: true, ...(await getAccess(req.kb, type, type === 'root' ? 0 : id(req.params.id))) });
  }));
  router.put('/access/:type/:id', wrap(async (req, res) => {
    const type = ['root', 'folder', 'item'].includes(req.params.type) ? req.params.type : null;
    if (!type) throw httpError(404, 'Not found');
    await setAccess(req.kb, type, type === 'root' ? 0 : id(req.params.id), req.body || {});
    res.json({ success: true });
  }));

  // Public links
  router.get('/shares/check', wrap(async (req, res) => {
    const slug = req.query.slug ? String(req.query.slug) : slugify(req.query.from);
    res.json({ success: true, ...(await checkSlug(slug, req.query.exclude ? Number(req.query.exclude) : null)) });
  }));
  router.get('/folders/:id/shares', wrap(async (req, res) => {
    res.json({ success: true, shares: await listShares(req.kb, id(req.params.id)) });
  }));
  router.post('/folders/:id/shares', wrap(async (req, res) => {
    res.status(201).json({ success: true, share: await createShare(req.kb, id(req.params.id), req.body || {}) });
  }));
  router.put('/shares/:id', wrap(async (req, res) => {
    res.json({ success: true, share: await updateShare(req.kb, id(req.params.id), req.body || {}) });
  }));
  router.delete('/shares/:id', wrap(async (req, res) => {
    await deleteShare(req.kb, id(req.params.id));
    res.json({ success: true });
  }));

  return router;
}

// ── Visitors with a link: /api/s/:slug ─────────────────────────────────────

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.params.slug || '').toLowerCase()}`,
  message: { success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' },
});

function tokenOf(req) {
  return req.get('x-share-token') || req.query.t || '';
}

/** Folder inside the share that inherits access from the shared folder. */
async function sharedFolder(share, folderId) {
  const access = await loadAccess({ isAdmin: true });
  const target = folderId || share.folder_id;
  if (target !== share.folder_id && !access.inheritsFrom(target, share.folder_id)) {
    throw httpError(404, 'Not found', 'NOT_FOUND');
  }
  return { access, target };
}

async function sharedItem(share, itemId) {
  const row = await loadItemRow(itemId);
  if (!row.inherit_access) throw httpError(404, 'Not found', 'NOT_FOUND');
  await sharedFolder(share, row.folder_id);
  return row;
}

function publicFolder(row, counts) {
  const shape = { id: row.id, name: row.name, description: row.description || '', icon: row.icon, color: row.color };
  if (counts) {
    shape.folderCount = counts.get(`f${row.id}`) || 0;
    shape.itemCount = counts.get(`i${row.id}`) || 0;
  }
  return shape;
}

/** Public counts only include what the link actually exposes (inheriting children). */
async function publicCounts(ids) {
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT 'f' || parent_id AS k, COUNT(*)::int AS n FROM kb_folders WHERE parent_id = ANY($1) AND inherit_access GROUP BY parent_id
     UNION ALL
     SELECT 'i' || folder_id, COUNT(*)::int FROM kb_items WHERE folder_id = ANY($1) AND inherit_access GROUP BY folder_id`,
    [ids]
  );
  return new Map(rows.map((row) => [row.k, row.n]));
}

export function publicRoutes() {
  const router = Router();

  router.post('/:slug/unlock', unlockLimiter, wrap(async (req, res) => {
    res.json({ success: true, ...(await unlockShare(req.params.slug, req.body?.password)) });
  }));

  router.get('/:slug', wrap(async (req, res) => {
    let share;
    try {
      share = await resolveShare(req.params.slug, tokenOf(req));
    } catch (err) {
      if (err.code === 'PASSWORD_REQUIRED') {
        res.status(401).json({ success: false, code: err.code, error: err.message, share: err.share });
        return;
      }
      throw err;
    }
    if (!req.query.folder) await countView(share);
    const { module, conversion } = await kbSettings();
    const { access, target } = await sharedFolder(share, req.query.folder ? id(req.query.folder) : null);
    const [folder, children, items, root] = await Promise.all([
      query(`SELECT * FROM kb_folders WHERE id = $1`, [target]),
      query(`SELECT * FROM kb_folders WHERE parent_id = $1 AND inherit_access ORDER BY sort, LOWER(name)`, [target]),
      query(
        `SELECT i.*, NULL AS author_name FROM kb_items i WHERE i.folder_id = $1 AND i.inherit_access
         ORDER BY i.sort, LOWER(i.title)`,
        [target]
      ),
      query(`SELECT * FROM kb_folders WHERE id = $1`, [share.folder_id]),
    ]);
    const chain = access.path(target);
    const crumbIds = chain.slice(chain.indexOf(share.folder_id), -1);
    const crumbs = crumbIds.length
      ? (await query(`SELECT * FROM kb_folders WHERE id = ANY($1)`, [crumbIds])).rows
      : [];
    const shape = shareShape(share);
    const childCounts = await publicCounts(children.rows.map((row) => row.id));
    res.json({
      success: true,
      share: { title: shape.title, slug: shape.slug, allowDownload: shape.allowDownload, expiresAt: shape.expiresAt },
      root: publicFolder(root.rows[0]),
      folder: publicFolder(folder.rows[0]),
      breadcrumbs: crumbIds.map((folderId) => crumbs.find((row) => row.id === folderId)).filter(Boolean).map((row) => publicFolder(row)),
      folders: children.rows.map((row) => publicFolder(row, childCounts)),
      items: items.rows.map((row) => itemShape(row)),
      config: {
        defaultIcon: module.defaultIcon,
        defaultColor: module.defaultColor,
        conversion: Boolean(conversion?.enabled && conversion?.serverUrl),
      },
    });
  }));

  router.get('/:slug/items/:id', wrap(async (req, res) => {
    const share = await resolveShare(req.params.slug, tokenOf(req));
    const row = await sharedItem(share, id(req.params.id));
    res.json({
      success: true,
      item: {
        ...itemShape(row),
        content: row.kind === 'article' ? row.content || '' : undefined,
        attachments: row.kind === 'article' ? await attachmentsOf(row.id) : [],
      },
    });
  }));

  router.get('/:slug/items/:id/attachments/:nodeId', wrap(async (req, res) => {
    const share = await resolveShare(req.params.slug, tokenOf(req));
    const row = await sharedItem(share, id(req.params.id));
    const download = req.query.download === '1';
    if (download && !share.allow_download) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
    await sendAttachment(res, row.id, id(req.params.nodeId), download);
  }));

  router.get('/:slug/items/:id/attachments/:nodeId/preview.pdf', wrap(async (req, res) => {
    const share = await resolveShare(req.params.slug, tokenOf(req));
    const row = await sharedItem(share, id(req.params.id));
    await sendAttachmentPreview(res, row.id, id(req.params.nodeId));
  }));

  router.get('/:slug/items/:id/file', wrap(async (req, res) => {
    const share = await resolveShare(req.params.slug, tokenOf(req));
    const row = await sharedItem(share, id(req.params.id));
    const download = req.query.download === '1';
    if (download && !share.allow_download) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
    await sendItemFile(res, row, download);
  }));

  router.get('/:slug/items/:id/preview.pdf', wrap(async (req, res) => {
    const share = await resolveShare(req.params.slug, tokenOf(req));
    const row = await sharedItem(share, id(req.params.id));
    await sendItemPreview(res, row);
  }));

  return router;
}

export { CONVERTIBLE };
