import { Router } from 'express';
import { query, tryConnectDB } from '../config/database.js';
import { getSettings, parseSettings, toPublicSettings } from '../services/settings.js';
import authRoutes from './auth.routes.js';
import setupRoutes from './setup.routes.js';
import adminRoutes from './admin.routes.js';
import accountRoutes from './account.routes.js';
import notificationRoutes from './notifications.routes.js';
import pwaRoutes from './pwa.routes.js';
import { previewImageRoutes } from '../services/linkPreview/index.js';
import { moduleRouter } from '../modules/index.js';
import rateLimit from 'express-rate-limit';
import { incidentFromRequest, recordIncident } from '../services/incidents.js';
import { accountApiRoutes, adminApiRoutes, developerRoutes } from '../api/routes.js';
import { wopiRoutes } from '../services/office/wopi.js';
import { accountExperienceRoutes, adminExperienceRoutes } from './experience.routes.js';

const router = Router();

// Online editor callbacks (WOPI): Collabora calls these server to server with an access token, no cookie.
router.use('/wopi', wopiRoutes());
router.use('/auth', authRoutes);
router.use('/setup', setupRoutes);
// API console and personal tokens sit before their parents' guards.
router.use('/admin/api', adminApiRoutes());
// Guided tours and themes (before their parents' routers; they guard themselves).
router.use('/admin/tours', adminExperienceRoutes);
router.use('/account', accountExperienceRoutes);
router.use('/admin', adminRoutes);
router.use('/account/api', accountApiRoutes());
router.use('/account', accountRoutes);
router.use('/developer', developerRoutes());
router.use('/notifications', notificationRoutes);
router.use('/pwa', pwaRoutes);
// Link preview pictures for messengers (Open Graph images).
router.use('/og', previewImageRoutes());
// Modules: /api/apps, /api/app/<id>/…, public prefixes such as /api/s/<slug>
router.use(moduleRouter());

router.get('/status', async (req, res, next) => {
  try {
    const db = await tryConnectDB();
    if (!db.ok) {
      return res.json({
        success: true,
        api: 'ok',
        database: {
          connected: false,
        },
        timestamp: new Date().toISOString(),
      });
    }

    await query('SELECT 1 AS ok');
    const settings = parseSettings(await getSettings());

    res.json({
      success: true,
      api: 'ok',
      app: {
        name: settings.appName,
        version: settings.appVersion,
        accessMode: settings.accessMode || 'closed',
      },
      database: {
        connected: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Crashes in the browser (error screen) are reported here with the tab's session id.
const clientErrorLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
router.post('/client-errors', clientErrorLimiter, (req, res) => {
  const body = req.body || {};
  const entry = recordIncident({
    kind: 'client',
    requestId: req.requestId,
    session: req.clientSession,
    code: /^[A-Z0-9_]{2,40}$/.test(String(body.code || '')) ? body.code : 'APP_CRASH',
    message: body.message,
    stack: body.stack,
    path: body.url,
    build: body.build,
    agent: req.get('user-agent'),
  });
  res.json({ success: true, id: entry.id });
});

router.get('/settings', async (req, res, next) => {
  try {
    const db = await tryConnectDB();
    if (!db.ok) {
      incidentFromRequest(req, 503, 'DB_UNAVAILABLE', new Error(db.error || 'Database is not connected'));
      return res.status(503).json({
        success: false,
        code: 'DB_UNAVAILABLE',
        requestId: req.requestId,
        error: 'Database is not connected',
      });
    }

    res.json({
      success: true,
      settings: toPublicSettings(parseSettings(await getSettings())),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
