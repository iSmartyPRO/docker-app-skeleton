import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getSetupStatus,
  testDatabase,
  saveDatabase,
  completeSetup,
  saveAccessMode,
} from '../services/setup.js';
import { assertSetupAllowed, hasValidSetupToken, requireSetupToken, setupTokenConfigured } from '../middleware/setupGuard.js';

const router = Router();

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many setup attempts. Try again later.' },
});

router.use(setupLimiter);

router.get('/status', async (req, res, next) => {
  try {
    const status = await getSetupStatus();
    const tokenRequired = setupTokenConfigured();
    const allowed = hasValidSetupToken(req);
    if (tokenRequired && !allowed) {
      return res.json({
        success: true,
        needsSetup: status.needsSetup,
        step: status.step,
        setupTokenRequired: true,
      });
    }
    res.json({ success: true, setupTokenRequired: tokenRequired, ...status });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/test-db',
  requireSetupToken,
  assertSetupAllowed,
  async (req, res, next) => {
    try {
      const result = await testDatabase(req.body);
      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Connection failed',
        });
      }

      res.json({
        success: true,
        database: result.database,
        version: result.version,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/database',
  requireSetupToken,
  assertSetupAllowed,
  async (req, res, next) => {
    try {
      const result = await saveDatabase(req.body);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/complete',
  requireSetupToken,
  assertSetupAllowed,
  async (req, res, next) => {
    try {
      const result = await completeSetup(req.body);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/access',
  requireSetupToken,
  assertSetupAllowed,
  async (req, res, next) => {
    try {
      const result = await saveAccessMode(req.body);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
