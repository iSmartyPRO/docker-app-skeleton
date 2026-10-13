import { Router } from 'express';
import { wrap } from '../shared/acl.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { resolvePrefs, savePrefs, storedPrefs } from './service.js';

const moduleSettings = async () => parseSettings(await getSettings()).modules.assistant?.settings || {};

/** /api/app/assistant — the signed-in person's robot settings. */
export function privateRoutes() {
  const router = Router();
  router.get('/prefs', wrap(async (req, res) => {
    res.json({ success: true, prefs: resolvePrefs(await storedPrefs(req.user.id), await moduleSettings()) });
  }));
  router.put('/prefs', wrap(async (req, res) => {
    const module = await moduleSettings();
    const saved = await savePrefs(req.user.id, req.body || {}, module);
    res.json({ success: true, prefs: resolvePrefs(saved, module) });
  }));
  return router;
}
