import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middleware/auth.js';
import { listSubjects, wrap } from '../shared/acl.js';
import { readIcon, storeIcon } from './icons.js';
import {
  adminList,
  board,
  deleteCategory,
  deleteItem,
  reorder,
  requireAdmin,
  resetLayout,
  resourcesContext,
  saveCategory,
  saveItem,
  saveLayout,
} from './service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });

/** /api/app/resources — signed-in users (layout) and administrators. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.res_ctx = resourcesContext(req);
    next();
  });

  router.get('/', wrap(async (req, res) => res.json({ success: true, ...(await board(req.res_ctx)) })));
  router.put('/layout', wrap(async (req, res) => res.json({ success: true, layout: await saveLayout(req.res_ctx, req.body || {}) })));
  router.delete('/layout', wrap(async (req, res) => {
    await resetLayout(req.res_ctx);
    res.json({ success: true });
  }));

  const admin = (handler) =>
    wrap(async (req, res) => {
      requireAdmin(req.res_ctx);
      await handler(req, res);
    });

  router.get('/admin', admin(async (req, res) => res.json({ success: true, ...(await adminList()) })));
  router.get('/admin/subjects', admin(async (req, res) => res.json({ success: true, ...(await listSubjects()) })));
  router.post('/admin/items', admin(async (req, res) => res.json({ success: true, item: await saveItem(req.res_ctx, req.body || {}) })));
  router.put('/admin/items/:id', admin(async (req, res) => res.json({ success: true, item: await saveItem(req.res_ctx, req.body || {}, req.params.id) })));
  router.delete('/admin/items/:id', admin(async (req, res) => {
    await deleteItem(req.params.id);
    res.json({ success: true });
  }));
  router.put('/admin/order', admin(async (req, res) => {
    await reorder('res_items', req.body?.ids || []);
    res.json({ success: true });
  }));
  router.post('/admin/categories', admin(async (req, res) => res.json({ success: true, category: await saveCategory(req.body || {}) })));
  router.put('/admin/categories/:id', admin(async (req, res) => res.json({ success: true, category: await saveCategory(req.body || {}, req.params.id) })));
  router.delete('/admin/categories/:id', admin(async (req, res) => {
    await deleteCategory(req.params.id);
    res.json({ success: true });
  }));
  router.put('/admin/categories-order', admin(async (req, res) => {
    await reorder('res_categories', req.body?.ids || []);
    res.json({ success: true });
  }));
  router.post(
    '/admin/icons',
    (req, res, next) => {
      requireAdmin(req.res_ctx);
      upload.single('file')(req, res, (err) => {
        if (err) {
          err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
          if (err.code === 'LIMIT_FILE_SIZE') err.code = 'FILE_TOO_LARGE';
        }
        next(err);
      });
    },
    wrap(async (req, res) => res.json({ success: true, file: await storeIcon(req.file) }))
  );
  return router;
}

/** /api/res — the home page board for anyone (public tiles) and uploaded icon files. */
export function publicRoutes() {
  const router = Router();
  router.get('/', optionalAuth, wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    res.json({ success: true, ...(await board(resourcesContext(req))) });
  }));
  router.get('/icons/:file', wrap(async (req, res) => {
    const icon = await readIcon(req.params.file);
    if (!icon) {
      res.status(404).end();
      return;
    }
    const types = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg' };
    res.setHeader('Content-Type', types[icon.ext]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    // File names are random and never reused.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(icon.data);
  }));
  return router;
}
