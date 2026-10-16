import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { SETTINGS_PERMISSIONS } from '../services/permissions.js';
import { APP_VERSION } from '../config/version.js';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { CATEGORIES, CORE_SERVICES, MODULE_MANIFEST, compareVersions } from '../modules/manifest.js';
import { dependentsOf, moduleStatus } from '../modules/dependencies.js';
import { demoOverview, purgeAll, purgeModule, seedAll, seedModule } from '../services/demo.js';
import { systemReport } from '../services/systemInfo.js';
import { recordSecurityEvent } from '../services/security.js';

/*
 * Platform endpoints of the console (mounted inside /api/admin, behind requireConsole):
 *
 *   GET  /modules                 manifests + state of every module (Modules page)
 *   GET  /demo                    demo data per module           (superadministrators)
 *   POST /demo/:module/seed|purge one module                      (superadministrators)
 *   POST /demo/seed-all|purge-all every enabled module            (superadministrators)
 *   GET  /system/report           the System page report (no secrets)
 *
 * Switching modules on and off stays PUT /admin/settings { modules } — the
 * requirement rules are applied there (modules/dependencies.js).
 */

const router = Router();
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

const anySettings = requirePermission('settings.view', ...SETTINGS_PERMISSIONS);
const isSuperadmin = (req) => req.actor?.permissions?.has('*');

/** Demo data changes the whole portal: a superadministrator in their own session (not a token, not "sign in as"). */
function demoGuard(req, res, next) {
  if (!isSuperadmin(req)) return res.status(403).json({ success: false, code: 'SUPERADMIN_ONLY', error: 'Only a superadministrator can do this' });
  if (req.apiToken && req.method !== 'GET') return res.status(403).json({ success: false, code: 'SESSION_REQUIRED', error: 'Demo data is managed from the console' });
  if (req.auth?.imp && req.method !== 'GET') return res.status(403).json({ success: false, code: 'IMPERSONATION_LIMIT', error: 'Not available while signed in as another user' });
  return next();
}

export function modulesPayload(parsed, { demo = null } = {}) {
  const enabled = Object.fromEntries(Object.entries(parsed.modules).map(([id, state]) => [id, Boolean(state.enabled)]));
  const integrations = Object.fromEntries(Object.entries(parsed.integrations || {}).map(([key, value]) => [key, Boolean(value?.enabled)]));
  const demoBy = new Map((demo?.modules || []).map((item) => [item.module, item]));
  const modules = MODULE_CATALOG.map((module) => {
    const manifest = MODULE_MANIFEST[module.id];
    const { status, missing } = moduleStatus(module.id, enabled, { integrations });
    return {
      id: module.id,
      name: manifest.name,
      version: manifest.version,
      category: manifest.category,
      minCore: manifest.minCore,
      compatible: compareVersions(APP_VERSION, manifest.minCore) >= 0,
      requires: manifest.requires,
      enhances: manifest.enhances.map((link) => ({ ...link, active: link.integration ? integrations[link.integration] : enabled[link.id] })),
      // Modules that list this one in `enhances`: what they gain when it is on.
      enhancedBy: Object.entries(MODULE_MANIFEST).flatMap(([other, entry]) => entry.enhances.filter((link) => link.id === module.id).map((link) => ({ id: other, what: link.what }))),
      dependents: dependentsOf(module.id, enabled),
      requiredBy: Object.entries(MODULE_MANIFEST).filter(([, entry]) => entry.requires.some((link) => link.id === module.id)).map(([other]) => other),
      changelog: manifest.changelog,
      docs: manifest.docs,
      permissions: module.permissions,
      core: Boolean(module.core),
      overlay: Boolean(module.overlay),
      enabled: enabled[module.id],
      status,
      missing,
      demo: demoBy.get(module.id) || null,
    };
  });
  return { coreVersion: APP_VERSION, categories: CATEGORIES, core: CORE_SERVICES, modules };
}

router.get('/modules', anySettings, wrap(async (req, res) => {
  const parsed = parseSettings(await getSettings());
  const demo = await demoOverview().catch(() => null);
  res.json({ success: true, ...modulesPayload(parsed, { demo }), demo: demo ? { active: demo.active, users: demo.users, canManage: Boolean(isSuperadmin(req)) } : null });
}));

// ── Demo data ───────────────────────────────────────────────────────────────

const demoEvent = (req, detail) =>
  recordSecurityEvent({ kind: 'demo_data', severity: 'info', username: req.user?.username, ip: req.ip, detail }).catch(() => {});

router.get('/demo', demoGuard, wrap(async (req, res) => {
  res.json({ success: true, demo: await demoOverview() });
}));

router.post('/demo/seed-all', demoGuard, wrap(async (req, res) => {
  const parsed = parseSettings(await getSettings({ fresh: true }));
  const enabled = MODULE_CATALOG.filter((module) => parsed.modules[module.id]?.enabled).map((module) => module.id);
  const results = await seedAll(enabled, req);
  demoEvent(req, `seed all (${results.map((item) => item.module).join(', ')})`);
  res.json({ success: true, results, demo: await demoOverview() });
}));

router.post('/demo/purge-all', demoGuard, wrap(async (req, res) => {
  const results = await purgeAll(req);
  demoEvent(req, 'purge all');
  res.json({ success: true, results, demo: await demoOverview() });
}));

router.post('/demo/:module/:action(seed|purge)', demoGuard, wrap(async (req, res) => {
  const { module, action } = req.params;
  const known = MODULE_CATALOG.find((entry) => entry.id === module);
  if (!known) return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Unknown module' });
  if (action === 'seed') {
    const parsed = parseSettings(await getSettings({ fresh: true }));
    if (!parsed.modules[module]?.enabled) return res.status(409).json({ success: false, code: 'MODULE_DISABLED', error: 'Switch the module on first' });
  }
  const result = action === 'seed' ? await seedModule(module, req) : await purgeModule(module, req);
  demoEvent(req, `${action} ${module}`);
  return res.json({ success: true, result, demo: await demoOverview() });
}));

// ── System ──────────────────────────────────────────────────────────────────

router.get('/system/report', requirePermission('settings.view', 'settings.system'), wrap(async (req, res) => {
  res.json({ success: true, report: await systemReport({ fresh: req.query.fresh === '1' }) });
}));

export default router;
