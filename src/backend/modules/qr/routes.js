import { Router } from 'express';
import multer from 'multer';
import { wrap } from '../shared/acl.js';
import { ASSET_TYPES, readAsset, storeAsset } from './assets.js';
import {
  bootstrap,
  codeStats,
  deleteCode,
  deleteTemplate,
  getCode,
  listCodes,
  listTemplates,
  qrContext,
  qrSettings,
  reorderTemplates,
  requireAdmin,
  resolveSlug,
  restorePresets,
  saveCode,
  saveTemplate,
  setDefaultTemplate,
} from './service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });

function single(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      if (err.code === 'LIMIT_FILE_SIZE') err.code = 'FILE_TOO_LARGE';
    }
    next(err);
  });
}

/** /api/app/qr — each person's codes; templates for administrators (qr.admin). */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.qr_ctx = qrContext(req);
    next();
  });

  router.get('/', wrap(async (req, res) => res.json({ success: true, ...(await bootstrap(req.qr_ctx)) })));
  router.get('/codes', wrap(async (req, res) => res.json({ success: true, codes: await listCodes(req.qr_ctx) })));
  router.get('/codes/:id', wrap(async (req, res) => res.json({ success: true, code: await getCode(req.qr_ctx, req.params.id) })));
  router.post('/codes', wrap(async (req, res) => res.json({ success: true, code: await saveCode(req.qr_ctx, req.body || {}) })));
  router.put('/codes/:id', wrap(async (req, res) => res.json({ success: true, code: await saveCode(req.qr_ctx, req.body || {}, req.params.id) })));
  router.delete('/codes/:id', wrap(async (req, res) => {
    await deleteCode(req.qr_ctx, req.params.id);
    res.json({ success: true });
  }));
  router.get('/codes/:id/stats', wrap(async (req, res) => res.json({ success: true, stats: await codeStats(req.qr_ctx, req.params.id, req.query.days) })));

  // Logos: administrators always, others when the module allows uploads.
  router.post(
    '/assets',
    (req, res, next) => {
      if (req.qr_ctx.isAdmin) return next();
      qrSettings()
        .then((settings) => {
          if (settings.allowUploads === false) requireAdmin(req.qr_ctx);
          next();
        })
        .catch(next);
    },
    single,
    wrap(async (req, res) => res.json({ success: true, file: await storeAsset(req.file) }))
  );

  const admin = (handler) =>
    wrap(async (req, res) => {
      requireAdmin(req.qr_ctx);
      await handler(req, res);
    });

  router.get('/admin/templates', admin(async (req, res) => res.json({ success: true, templates: await listTemplates({ all: true }) })));
  router.post('/admin/templates', admin(async (req, res) => res.json({ success: true, template: await saveTemplate(req.qr_ctx, req.body || {}) })));
  router.put('/admin/templates/:id', admin(async (req, res) => res.json({ success: true, template: await saveTemplate(req.qr_ctx, req.body || {}, req.params.id) })));
  router.delete('/admin/templates/:id', admin(async (req, res) => {
    await deleteTemplate(req.params.id);
    res.json({ success: true });
  }));
  router.post('/admin/templates/:id/default', admin(async (req, res) => {
    await setDefaultTemplate(req.params.id);
    res.json({ success: true });
  }));
  router.put('/admin/templates-order', admin(async (req, res) => {
    await reorderTemplates(req.body?.ids || []);
    res.json({ success: true });
  }));
  router.post('/admin/templates/restore', admin(async (req, res) => res.json({ success: true, ...(await restorePresets()) })));
  return router;
}

const BOTS = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|vkshare/i;

const GONE = {
  ru: ['QR-код приостановлен', 'Владелец кода временно отключил эту ссылку.'],
  en: ['This QR code is paused', 'Its owner has switched the link off for now.'],
  ky: ['QR-код токтотулду', 'Коддун ээси бул шилтемени убактылуу өчүргөн.'],
  tr: ['Bu QR kodu duraklatıldı', 'Sahibi bağlantıyı şimdilik kapattı.'],
  zh: ['此二维码已暂停', '所有者暂时关闭了该链接。'],
};
const MISSING = {
  ru: ['QR-код не найден', 'Ссылка устарела или была удалена.'],
  en: ['QR code not found', 'The link is out of date or was removed.'],
  ky: ['QR-код табылган жок', 'Шилтеме эскирген же өчүрүлгөн.'],
  tr: ['QR kodu bulunamadı', 'Bağlantı eskimiş ya da silinmiş.'],
  zh: ['未找到二维码', '链接已过期或已被删除。'],
};

function page(req, status, texts) {
  const lang = Object.keys(texts).find((code) => String(req.headers['accept-language'] || '').toLowerCase().startsWith(code)) || 'en';
  const [title, lead] = texts[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#F8FAFC;color:#0F172A}
main{max-width:360px;padding:32px;text-align:center}h1{font-size:22px;margin:16px 0 8px}p{margin:0;color:#64748B}
.i{width:64px;height:64px;margin:auto;border-radius:18px;background:#E2E8F0;display:grid;place-items:center;font-size:30px}</style></head>
<body><main><div class="i">${status === 410 ? '⏸' : '?'}</div><h1>${title}</h1><p>${lead}</p></main></body></html>`;
}

/** /api/qr — logo files and the redirect of dynamic codes (nginx maps /q/<slug> here). */
export function publicRoutes() {
  const router = Router();
  router.get('/assets/:file', wrap(async (req, res) => {
    const asset = await readAsset(req.params.file);
    if (!asset) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', ASSET_TYPES[asset.ext]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(asset.data);
  }));
  router.get('/go/:slug', wrap(async (req, res) => {
    const result = await resolveSlug(req.params.slug, { count: !BOTS.test(req.headers['user-agent'] || '') });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (result.status === 302) {
      res.redirect(302, result.target);
      return;
    }
    res.status(result.status).type('html').send(page(req, result.status, result.status === 410 ? GONE : MISSING));
  }));
  return router;
}
