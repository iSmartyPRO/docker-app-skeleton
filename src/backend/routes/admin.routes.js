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
  tokenLockedChanges,
  unlinkTelegram,
  updateUser,
} from '../services/users.js';
import { getOverview, getSystemInfo } from '../services/overview.js';
import { emitEvent } from '../api/events.js';
import { adminTest, notifyOverview, saveNotifyConfig } from '../services/notifications.js';
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
  SETTINGS_PERMISSIONS,
  deniedSettingsKeys,
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

import { disconnectGmailSender, publicBase, redirectUri } from '../services/google.js';
import { readFile as readIconFile, unlink as removeIconFile, unlink as removeUploadedFile } from 'fs/promises';

/**
 * App icons (browser tab, PWA, home screen): a square PNG of 192–4096 px, or a
 * square SVG (scales to every size; already checked for scripts by
 * verifyUploadedFile). JPEG/WebP are refused: browsers and iOS handle them
 * poorly as icons.
 */
async function verifyAppIcon(file) {
  const fail = async (message) => {
    await removeIconFile(file.path).catch(() => {});
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  };
  if (/\.svg$/i.test(file.filename)) {
    const text = (await readIconFile(file.path)).toString('utf8');
    const box = /<svg\b[^>]*\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (box && Math.abs(Number(box[1]) - Number(box[2])) > 0.01 * Math.max(Number(box[1]), Number(box[2]))) {
      return fail('The app icon must be square');
    }
    return null;
  }
  if (!/\.png$/i.test(file.filename)) return fail('The app icon must be a PNG or SVG image');
  const head = (await readIconFile(file.path)).subarray(0, 24);
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  if (width !== height) return fail('The app icon must be square');
  if (width < 192 || width > 4096) return fail('The app icon must be between 192 and 4096 pixels');
  return null;
}
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
  res.json({ success: true, overview: await getOverview(req.actor.permissions) });
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
  // Unknown keys are refused too, so a new setting can never slip through
  // with only settings.view.
  const denied = deniedSettingsKeys(patch, req.actor.permissions);
  if (denied.length) {
    res.status(403).json({ success: false, error: 'You do not have permission to change these settings', code: 'FORBIDDEN', keys: denied });
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
      if (req.query.variant === 'icon') await verifyAppIcon(req.file);
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

// Google: values the admin copies into Google Cloud Console; disconnecting the Gmail sender.
router.get('/integrations/google/info', integrationSettings, wrap(async (req, res) => {
  res.json({ success: true, redirectUri: redirectUri(), origin: publicBase() });
}));

router.delete('/integrations/google/gmail', integrationSettings, wrap(async (req, res) => {
  await disconnectGmailSender();
  res.json({ success: true });
}));

// Channel picker for the Wazzup screen; accepts an unsaved API key in the body.
router.post('/integrations/wazzup/channels', integrationSettings, wrap(async (req, res) => {
  res.json({ success: true, channels: await listWazzupChannels(req.body || {}) });
}));

// ── Users ───────────────────────────────────────────────────────────────────

const viewUsers = requirePermission('users.view');
const manageUsers = requirePermission('users.manage');

// ── Notification delivery (channels, WhatsApp provider, coverage, test) ────
const notifySettings = requirePermission('settings.integrations', 'settings.view');
// Accounts sharing a contact (names, phones, e-mails) only with users.view.
const notifyView = (req) => ({ duplicates: hasPermission(req.actor.permissions, 'users.view') });
router.get('/notifications', notifySettings, wrap(async (req, res) => res.json({ success: true, ...(await notifyOverview(notifyView(req))) })));
router.put('/notifications', requirePermission('settings.integrations'), wrap(async (req, res) => res.json({ success: true, ...(await saveNotifyConfig(req.body || {}, notifyView(req))) })));
router.post('/notifications/test', requirePermission('settings.integrations'), wrap(async (req, res) => res.json({ success: true, result: await adminTest(req.body || {}) })));

router.get('/users', viewUsers, wrap(async (req, res) => {
  res.json({ success: true, users: await listUsers() });
}));

// Webhook events about accounts go to webhooks whose person may view users.
const userWebhook = (type, user, actorId) =>
  emitEvent(type, { data: { user, actorId }, visible: (req) => hasPermission(req.access?.permissions || [], 'users.view') });

router.post('/users', manageUsers, wrap(async (req, res) => {
  const user = await createUser(req.body || {}, req.actor);
  res.status(201).json({ success: true, user });
  userWebhook('user.created', user, req.actor.id);
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
  // A token editing its own owner here is held to the cabinet's rule: no
  // contact changes (they receive sign-in codes).
  if (req.apiToken && Number(req.params.id) === Number(req.actor.id)) {
    const locked = tokenLockedChanges(req.body, req.userRow, true);
    if (locked.length) {
      res.status(403).json({
        success: false,
        code: 'TOKEN_FORBIDDEN_FIELD',
        error: `An API token cannot change ${locked.join(', ')}. Sign in to the portal to change contacts.`,
        fields: locked,
      });
      return;
    }
  }
  const user = await updateUser(Number(req.params.id), req.body || {}, { actor: req.actor });
  res.json({ success: true, user });
  userWebhook('user.updated', user, req.actor.id);
}));

router.post('/users/:id/avatar', manageUsers, wrap(async (req, res) => {
  // Checked before anything is written to disk.
  await assertCanManage(req.actor, Number(req.params.id));
  await new Promise((resolve, reject) => {
    avatarUpload(req, res, (err) => {
      if (err) {
        err.statusCode = 400;
        reject(err);
      } else resolve();
    });
  });
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Avatar file is required' });
    return;
  }
  try {
    await verifyUploadedFile(req.file, 'avatar');
    res.json({ success: true, user: await setAvatar(Number(req.params.id), req.file.filename) });
  } catch (error) {
    // Nothing references a file that was not saved to the user.
    await removeUploadedFile(req.file.path).catch(() => {});
    throw error;
  }
}));

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
  const before = await getAdminUser(Number(req.params.id));
  await deleteUser(Number(req.params.id), req.actor);
  res.json({ success: true });
  if (before) userWebhook('user.deleted', before, req.actor.id);
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
