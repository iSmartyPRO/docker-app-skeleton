import { Router } from 'express';
import { requireConsole, requirePermission } from '../middleware/auth.js';
import { clientIp } from '../middleware/ipGuard.js';
import { avatarUpload, logoUpload, verifyUploadedFile } from '../middleware/upload.js';
import {
  clearProjectLogo,
  getSettings,
  parseSettings,
  setProjectLogo,
  toAdminSettings,
  updateAdminSettings,
} from '../services/settings.js';
import {
  assertCanManage,
  createUser,
  deleteUser,
  getAdminUser,
  listUsers,
  revokeSessions,
  setAvatar,
  unlinkTelegram,
  updateUser,
} from '../services/users.js';
import { getOverview, getSystemInfo } from '../services/overview.js';
import { listWazzupChannels, testIntegration } from '../services/integrations.js';
import {
  addIpRule,
  decideIpAccess,
  listIpRules,
  listSecurityEvents,
  removeIpRule,
} from '../services/security.js';
import {
  PERMISSION_CATALOG,
  SETTINGS_PATCH_PERMISSIONS,
  SETTINGS_PERMISSIONS,
  hasPermission,
} from '../services/permissions.js';
import {
  createRole,
  deleteGroup,
  deleteRole,
  listGroups,
  listRoles,
  saveGroup,
  updateRole,
} from '../services/rbac.js';

const router = Router();
router.use(requireConsole);

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

/**
 * Rejects a security change that would deny the acting admin's own IP —
 * the classic "enable the allow-list, lose the admin panel" foot-gun.
 */
async function assertAdminKeepsAccess(req, { security, rules } = {}) {
  const parsed = parseSettings(await getSettings({ fresh: true }));
  const nextSecurity = { ...(parsed.security || {}), ...(security || {}) };
  const nextRules = rules || (await listIpRules());
  const ip = clientIp(req);
  const verdict = decideIpAccess(ip, nextSecurity, nextRules);
  if (!verdict.allowed) {
    const hint =
      verdict.reason === 'whitelist' ? ' Add it to the allow-list first.' : ' Remove the matching block rule.';
    const error = new Error(`This change would block your own address (${ip}).${hint}`);
    error.statusCode = 409;
    error.code = 'SELF_LOCKOUT';
    throw error;
  }
}

// ── Console ─────────────────────────────────────────────────────────────────

router.get('/overview', wrap(async (req, res) => {
  res.json({ success: true, overview: await getOverview() });
}));

router.get('/permissions', wrap(async (req, res) => {
  res.json({ success: true, catalog: PERMISSION_CATALOG });
}));

// ── Settings ────────────────────────────────────────────────────────────────

const anySettings = requirePermission('settings.view', ...SETTINGS_PERMISSIONS);

router.get('/system', anySettings, wrap(async (req, res) => {
  res.json({ success: true, system: await getSystemInfo() });
}));

router.get('/settings', anySettings, wrap(async (req, res) => {
  res.json({ success: true, settings: toAdminSettings(parseSettings(await getSettings())) });
}));

/** Each top-level key of the patch needs its own permission. */
router.put('/settings', anySettings, wrap(async (req, res) => {
  const patch = req.body || {};
  const denied = Object.keys(patch).filter(
    (key) => SETTINGS_PATCH_PERMISSIONS[key] && !hasPermission(req.actor.permissions, SETTINGS_PATCH_PERMISSIONS[key])
  );
  if (denied.length) {
    res.status(403).json({ success: false, error: 'You do not have permission to change these settings', code: 'FORBIDDEN' });
    return;
  }
  if (patch.security) await assertAdminKeepsAccess(req, { security: patch.security });
  res.json({ success: true, settings: await updateAdminSettings(patch) });
}));

const generalSettings = requirePermission('settings.general');

router.post('/settings/logo', generalSettings, (req, res, next) => {
  logoUpload(req, res, async (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Logo file is required' });
    try {
      await verifyUploadedFile(req.file, 'logo');
      const settings = await setProjectLogo(req.file.filename, req.query.variant);
      return res.json({ success: true, settings });
    } catch (error) {
      return next(error);
    }
  });
});

router.delete('/settings/logo', generalSettings, wrap(async (req, res) => {
  res.json({ success: true, settings: await clearProjectLogo(req.query.variant) });
}));

const integrationSettings = requirePermission('settings.integrations');

router.post('/integrations/:kind/test', integrationSettings, wrap(async (req, res) => {
  res.json({ success: true, ...(await testIntegration(req.params.kind, req.body || {})) });
}));

// Channel picker for the Wazzup screen; accepts an unsaved API key in the body.
router.post('/integrations/wazzup/channels', integrationSettings, wrap(async (req, res) => {
  res.json({ success: true, channels: await listWazzupChannels(req.body || {}) });
}));

// ── Users ───────────────────────────────────────────────────────────────────

const viewUsers = requirePermission('users.view');
const manageUsers = requirePermission('users.manage');

router.get('/users', viewUsers, wrap(async (req, res) => {
  res.json({ success: true, users: await listUsers() });
}));

router.post('/users', manageUsers, wrap(async (req, res) => {
  res.status(201).json({ success: true, user: await createUser(req.body || {}, req.actor) });
}));

router.get('/users/:id', viewUsers, wrap(async (req, res) => {
  const user = await getAdminUser(Number(req.params.id));
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, user });
}));

router.put('/users/:id', manageUsers, wrap(async (req, res) => {
  const user = await updateUser(Number(req.params.id), req.body || {}, { actor: req.actor });
  res.json({ success: true, user });
}));

router.post('/users/:id/avatar', manageUsers, (req, res, next) => {
  avatarUpload(req, res, async (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Avatar file is required' });
    try {
      await assertCanManage(req.actor, Number(req.params.id));
      await verifyUploadedFile(req.file, 'avatar');
      return res.json({ success: true, user: await setAvatar(Number(req.params.id), req.file.filename) });
    } catch (error) {
      return next(error);
    }
  });
});

router.post('/users/:id/revoke-sessions', manageUsers, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertCanManage(req.actor, id);
  await revokeSessions(id);
  res.json({ success: true, user: await getAdminUser(id) });
}));

router.delete('/users/:id/telegram', manageUsers, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertCanManage(req.actor, id);
  await unlinkTelegram(id);
  res.json({ success: true, user: await getAdminUser(id) });
}));

router.delete('/users/:id', requirePermission('users.delete'), wrap(async (req, res) => {
  await deleteUser(Number(req.params.id), req.actor);
  res.json({ success: true });
}));

// ── Roles & groups ──────────────────────────────────────────────────────────

const manageRoles = requirePermission('roles.manage');
const manageGroups = requirePermission('groups.manage');

router.get('/roles', viewUsers, wrap(async (req, res) => {
  res.json({ success: true, roles: await listRoles() });
}));

router.post('/roles', manageRoles, wrap(async (req, res) => {
  res.status(201).json({ success: true, role: await createRole(req.body || {}, req.actor) });
}));

router.put('/roles/:id', manageRoles, wrap(async (req, res) => {
  res.json({ success: true, role: await updateRole(Number(req.params.id), req.body || {}, req.actor) });
}));

router.delete('/roles/:id', manageRoles, wrap(async (req, res) => {
  await deleteRole(Number(req.params.id), req.actor);
  res.json({ success: true });
}));

router.get('/groups', viewUsers, wrap(async (req, res) => {
  res.json({ success: true, groups: await listGroups() });
}));

router.post('/groups', manageGroups, wrap(async (req, res) => {
  const id = await saveGroup(null, req.body || {}, req.actor);
  res.status(201).json({ success: true, id });
}));

router.put('/groups/:id', manageGroups, wrap(async (req, res) => {
  await saveGroup(Number(req.params.id), req.body || {}, req.actor);
  res.json({ success: true });
}));

router.delete('/groups/:id', manageGroups, wrap(async (req, res) => {
  await deleteGroup(Number(req.params.id), req.actor);
  res.json({ success: true });
}));

// ── Security ────────────────────────────────────────────────────────────────

router.get('/security/events', requirePermission('activity.view'), wrap(async (req, res) => {
  const data = await listSecurityEvents({ kind: req.query.kind, limit: req.query.limit });
  res.json({ success: true, ...data });
}));

const securitySettings = requirePermission('settings.security');

router.get('/security/ip-rules', requirePermission('settings.view', 'settings.security'), wrap(async (req, res) => {
  const rules = await listIpRules(req.query.listType);
  res.json({ success: true, rules, yourIp: clientIp(req) });
}));

router.post('/security/ip-rules', securitySettings, wrap(async (req, res) => {
  if (req.body?.listType === 'blacklist') {
    const candidate = { ip: String(req.body?.ip || '').trim(), list_type: 'blacklist' };
    await assertAdminKeepsAccess(req, { rules: [...(await listIpRules()), candidate] });
  }
  const rule = await addIpRule({
    ip: req.body?.ip,
    listType: req.body?.listType,
    reason: req.body?.reason,
    createdBy: req.user.id,
  });
  res.status(201).json({ success: true, rule });
}));

router.delete('/security/ip-rules/:id', securitySettings, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const remaining = (await listIpRules()).filter((rule) => Number(rule.id) !== id);
  await assertAdminKeepsAccess(req, { rules: remaining });
  await removeIpRule(id);
  res.json({ success: true });
}));

export default router;
