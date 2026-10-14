import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { LEVEL, contextFromRequest, httpError, intId, listSubjects, wrap } from '../shared/acl.js';
import { officePreview, sendBlob, sendPdf, storagePath } from '../shared/storage.js';
import { requireNode } from './access.js';
import { countView, createLink, deleteLink, linkActivity, listLinks, nodeInLink, resolveLink, startSession, unlockLink, updateLink, visitorLinkShape } from './links.js';
import { sessionUploads, visitorDelete, visitorFolderTree, visitorMkdir, visitorReplace, visitorUpdate, visitorUpload } from './linkWrites.js';
import {
  createFolder,
  createSpace,
  deleteSpace,
  emptyTrash,
  ensureFolderTree,
  filesSettings,
  getNode,
  getShares,
  getSpaceAccess,
  listPlace,
  listSpaces,
  listTrash,
  moveNode,
  nodeShape,
  purgeNode,
  recent,
  renameNode,
  restoreNode,
  search,
  setShares,
  setSpaceAccess,
  sharedWithMe,
  trashNode,
  updateSpace,
  uploadTo,
  usageOf,
} from './service.js';

async function sendNodeFile(res, node, download) {
  if (node.kind !== 'file') throw httpError(404, 'Not found', 'NOT_FOUND');
  await sendBlob(res, storagePath(node.storage_key), { name: node.name, ext: node.ext, download });
}

async function sendNodePreview(res, node) {
  if (node.kind !== 'file') throw httpError(404, 'Not found', 'NOT_FOUND');
  const path = await officePreview({ cacheKey: `fs-${node.id}`, version: node.updated_at, path: storagePath(node.storage_key), name: node.name, ext: node.ext });
  sendPdf(res, path, node.name.replace(/\.[^.]+$/, ''));
}

function place(input = {}) {
  if (input.parentId || input.folderId) return { parentId: intId(input.parentId || input.folderId) };
  if (input.spaceId) return { spaceId: intId(input.spaceId) };
  return {};
}

/** /api/app/files — signed-in users. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.fs = contextFromRequest(req, 'files.admin');
    next();
  });

  router.get('/', wrap(async (req, res) => {
    const settings = await filesSettings();
    const rawSettings = await getSettings();
    res.json({
      success: true,
      spaces: await listSpaces(req.fs),
      usage: await usageOf(req.fs.userId),
      config: {
        maxUploadMb: settings.maxUploadMb,
        publicLinks: settings.publicLinks,
        requireLinkPassword: settings.requireLinkPassword,
        maxLinkDays: settings.maxLinkDays,
        writeLinks: settings.writeLinks !== false,
        requireWriteLinkPassword: Boolean(settings.requireWriteLinkPassword),
        linkSharing: settings.linkSharing === 'members' ? 'members' : 'owners',
        trashDays: settings.trashDays,
        openMode: settings.openMode === 'modal' ? 'modal' : 'page',
        canCreateSpaces: settings.spaceCreation !== 'admins' || req.fs.isAdmin,
        conversion: (() => {
          const documents = parseSettings(rawSettings).integrations.documents;
          return Boolean(documents?.enabled && documents?.serverUrl);
        })(),
      },
    });
  }));

  // Places
  router.get('/my', wrap(async (req, res) => res.json({ success: true, ...(await listPlace(req.fs, { root: 'my' })) })));
  router.get('/folders/:id', wrap(async (req, res) => res.json({ success: true, ...(await listPlace(req.fs, { folderId: intId(req.params.id) })) })));
  router.get('/spaces/:id/files', wrap(async (req, res) => res.json({ success: true, ...(await listPlace(req.fs, { root: 'space', spaceId: intId(req.params.id) })) })));
  router.get('/shared', wrap(async (req, res) => res.json({ success: true, items: await sharedWithMe(req.fs) })));
  router.get('/recent', wrap(async (req, res) => res.json({ success: true, items: await recent(req.fs) })));
  router.get('/search', wrap(async (req, res) => res.json({ success: true, items: await search(req.fs, req.query.q) })));
  router.get('/trash', wrap(async (req, res) => res.json({ success: true, items: await listTrash(req.fs) })));
  router.delete('/trash', wrap(async (req, res) => res.json({ success: true, removed: await emptyTrash(req.fs) })));

  // Spaces
  router.post('/spaces', wrap(async (req, res) => {
    const settings = await filesSettings();
    res.status(201).json({ success: true, space: await createSpace(req.fs, req.body || {}, { allowed: settings.spaceCreation !== 'admins' || req.fs.isAdmin }) });
  }));
  router.put('/spaces/:id', wrap(async (req, res) => res.json({ success: true, space: await updateSpace(req.fs, intId(req.params.id), req.body || {}) })));
  router.delete('/spaces/:id', wrap(async (req, res) => {
    await deleteSpace(req.fs, intId(req.params.id));
    res.json({ success: true });
  }));
  router.get('/spaces/:id/access', wrap(async (req, res) => res.json({ success: true, entries: await getSpaceAccess(req.fs, intId(req.params.id)) })));
  router.put('/spaces/:id/access', wrap(async (req, res) => res.json({ success: true, entries: await setSpaceAccess(req.fs, intId(req.params.id), req.body?.entries) })));
  router.get('/subjects', wrap(async (req, res) => res.json({ success: true, ...(await listSubjects()) })));

  // Nodes
  router.post('/folders', wrap(async (req, res) => {
    res.status(201).json({ success: true, node: await createFolder(req.fs, { ...place(req.body), name: req.body?.name }) });
  }));
  // Folder uploads: the folder tree first (existing folders are reused), then each file into its folder.
  router.post('/folders/tree', wrap(async (req, res) => {
    res.json({ success: true, ...(await ensureFolderTree(req.fs, place(req.body), req.body?.paths, { bytes: req.body?.bytes })) });
  }));
  // Upload: the target is checked before multer touches the disk.
  router.post('/upload', wrap(async (req, res) => {
    res.status(201).json({ success: true, items: await uploadTo(req.fs, req, res, place(req.query)) });
  }));
  router.get('/nodes/:id', wrap(async (req, res) => res.json({ success: true, ...(await getNode(req.fs, intId(req.params.id))) })));
  router.put('/nodes/:id', wrap(async (req, res) => {
    const id = intId(req.params.id);
    let node;
    if (req.body?.name !== undefined) node = await renameNode(req.fs, id, req.body.name);
    if (req.body?.move) node = await moveNode(req.fs, id, place(req.body.move));
    res.json({ success: true, node });
  }));
  router.delete('/nodes/:id', wrap(async (req, res) => {
    await trashNode(req.fs, intId(req.params.id));
    res.json({ success: true });
  }));
  router.post('/nodes/:id/restore', wrap(async (req, res) => {
    await restoreNode(req.fs, intId(req.params.id));
    res.json({ success: true });
  }));
  router.delete('/nodes/:id/forever', wrap(async (req, res) => {
    await purgeNode(req.fs, intId(req.params.id));
    res.json({ success: true });
  }));
  router.get('/nodes/:id/file', wrap(async (req, res) => {
    const access = await requireNode(req.fs, intId(req.params.id), LEVEL.view);
    await sendNodeFile(res, access.node, req.query.download === '1');
  }));
  router.get('/nodes/:id/preview.pdf', wrap(async (req, res) => {
    const access = await requireNode(req.fs, intId(req.params.id), LEVEL.view);
    await sendNodePreview(res, access.node);
  }));

  // Sharing
  router.get('/nodes/:id/shares', wrap(async (req, res) => res.json({ success: true, ...(await getShares(req.fs, intId(req.params.id))) })));
  router.put('/nodes/:id/shares', wrap(async (req, res) => res.json({ success: true, ...(await setShares(req.fs, intId(req.params.id), req.body?.entries)) })));
  router.get('/nodes/:id/links', wrap(async (req, res) => res.json({ success: true, ...(await listLinks(req.fs, intId(req.params.id))) })));
  router.post('/nodes/:id/links', wrap(async (req, res) => res.status(201).json({ success: true, link: await createLink(req.fs, intId(req.params.id), req.body || {}) })));
  router.put('/links/:id', wrap(async (req, res) => res.json({ success: true, link: await updateLink(req.fs, intId(req.params.id), req.body || {}) })));
  router.get('/links/:id/activity', wrap(async (req, res) => res.json({ success: true, events: await linkActivity(req.fs, intId(req.params.id)) })));
  router.delete('/links/:id', wrap(async (req, res) => {
    await deleteLink(req.fs, intId(req.params.id));
    res.json({ success: true });
  }));

  return router;
}

// ── Public links: /api/l/<token> ────────────────────────────────────────────

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.token}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }),
});

/*
 * Visitor writes (upload, folders, rename/move, replace, delete) are limited
 * per IP and link and per link overall, on top of the general guest budget.
 * Anonymous POSTs pass the same Origin check as every other API write
 * (server.js): a page on another site cannot drive a visitor's browser.
 */
const writeLimiter = (windowMs, max, key) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: key,
    handler: (req, res) => res.status(429).json({ success: false, error: 'Too many changes through this link. Try again later.', code: 'RATE_LIMITED' }),
  });
const visitorWrites = [
  writeLimiter(10 * 60 * 1000, 300, (req) => `fs-w:${req.ip}:${req.params.token}`),
  writeLimiter(10 * 60 * 1000, 1500, (req) => `fs-w:${req.params.token}`),
];
const sessionLimiter = writeLimiter(15 * 60 * 1000, 30, (req) => `fs-s:${req.ip}:${req.params.token}`);

// Reads accept ?t= (file URLs in <img>/<video>); writes take the header only, so tokens stay out of URLs and logs.
const visitorToken = (req) => req.get('x-link-token') || req.query.t || '';
const writeToken = (req) => req.get('x-link-token') || '';
async function openLink(req, res, { write = false } = {}) {
  try {
    return await resolveLink(req.params.token, write ? writeToken(req) : visitorToken(req));
  } catch (err) {
    if (err.code === 'PASSWORD_REQUIRED') {
      res.status(401).json({ success: false, code: err.code, error: err.message, info: err.details });
      return null;
    }
    throw err;
  }
}

export function publicRoutes() {
  const router = Router();

  router.post('/:token/unlock', unlockLimiter, wrap(async (req, res) => {
    res.json({ success: true, ...(await unlockLink(req.params.token, req.body?.password)) });
  }));

  router.get('/:token', wrap(async (req, res) => {
    const link = await openLink(req, res);
    if (!link) return;
    if (!req.query.folder && req.query.preview !== '1') await countView(link);
    const conversion = parseSettings(await getSettings()).integrations.documents;
    const common = { link: visitorLinkShape(link), conversion: Boolean(conversion?.enabled && conversion?.serverUrl) };
    // Upload-only: the folder's name and the visitor's own uploads, never its contents.
    if (!link.perms.includes('view')) {
      const { node } = await nodeInLink(link, link.node_id);
      res.json({ success: true, ...common, node: { id: node.id, kind: node.kind, name: node.name }, crumbs: [], items: [], mine: await sessionUploads(link) });
      return;
    }
    const { node, crumbs } = await nodeInLink(link, req.query.folder || link.node_id);
    const items =
      node.kind === 'folder'
        ? (
            await query(
              `SELECT * FROM fs_nodes WHERE parent_id = $1 AND deleted_at IS NULL
               ORDER BY CASE WHEN kind = 'folder' THEN 0 ELSE 1 END, LOWER(name)`,
              [node.id]
            )
          ).rows.map((row) => nodeShape(row, LEVEL.view))
        : [];
    res.json({ success: true, ...common, node: nodeShape(node, LEVEL.view), crumbs, items });
  }));

  // A visitor session (needed before any change): { name, email } when the link asks for them.
  router.post('/:token/session', sessionLimiter, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.json({ success: true, ...startSession(link, req.body || {}) });
  }));

  router.post('/:token/upload', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.status(201).json({ success: true, items: await visitorUpload(link, req, res) });
  }));

  router.post('/:token/folders', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.status(201).json({ success: true, node: await visitorMkdir(link, req.body || {}, req.ip) });
  }));

  router.post('/:token/folders/tree', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.json({ success: true, ...(await visitorFolderTree(link, req.body || {}, req.ip)) });
  }));

  router.put('/:token/nodes/:id', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.json({ success: true, node: await visitorUpdate(link, intId(req.params.id), req.body || {}, req.ip) });
  }));

  router.post('/:token/nodes/:id/replace', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    res.json({ success: true, node: await visitorReplace(link, intId(req.params.id), req, res) });
  }));

  router.delete('/:token/nodes/:id', visitorWrites, wrap(async (req, res) => {
    const link = await openLink(req, res, { write: true });
    if (!link) return;
    await visitorDelete(link, intId(req.params.id), req.ip);
    res.json({ success: true });
  }));

  router.get('/:token/nodes/:id/file', wrap(async (req, res) => {
    const link = await openLink(req, res);
    if (!link) return;
    if (!link.perms.includes('view')) throw httpError(403, 'This link only accepts files', 'LINK_FORBIDDEN');
    if (req.query.download === '1' && !link.perms.includes('download')) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
    const { node } = await nodeInLink(link, intId(req.params.id));
    await sendNodeFile(res, node, req.query.download === '1');
  }));

  router.get('/:token/nodes/:id/preview.pdf', wrap(async (req, res) => {
    const link = await openLink(req, res);
    if (!link) return;
    if (!link.perms.includes('view')) throw httpError(403, 'This link only accepts files', 'LINK_FORBIDDEN');
    const { node } = await nodeInLink(link, intId(req.params.id));
    await sendNodePreview(res, node);
  }));

  return router;
}
