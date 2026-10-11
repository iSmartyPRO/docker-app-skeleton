import { Router } from 'express';
import { query, tryConnectDB } from '../config/database.js';
import { getSettings, parseSettings, toPublicSettings } from '../services/settings.js';
import authRoutes from './auth.routes.js';
import setupRoutes from './setup.routes.js';
import adminRoutes from './admin.routes.js';
import accountRoutes from './account.routes.js';
import notificationRoutes from './notifications.routes.js';
import pwaRoutes from './pwa.routes.js';
import { moduleRouter } from '../modules/index.js';
import { accountApiRoutes, adminApiRoutes, developerRoutes } from '../api/routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/setup', setupRoutes);
// API console and personal tokens sit before their parents' guards.
router.use('/admin/api', adminApiRoutes());
router.use('/admin', adminRoutes);
router.use('/account/api', accountApiRoutes());
router.use('/account', accountRoutes);
router.use('/developer', developerRoutes());
router.use('/notifications', notificationRoutes);
router.use('/pwa', pwaRoutes);
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

router.get('/settings', async (req, res, next) => {
  try {
    const db = await tryConnectDB();
    if (!db.ok) {
      return res.status(503).json({
        success: false,
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
