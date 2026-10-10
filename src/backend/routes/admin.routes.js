import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
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
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  setAvatar,
  revokeSessions,
  toAdminUser,
  updateUser,
} from '../services/users.js';
import { getOverview, getSystemInfo } from '../services/overview.js';
import { testIntegration } from '../services/integrations.js';
import {
  addIpRule,
  decideIpAccess,
  listIpRules,
  listSecurityEvents,
  removeIpRule,
} from '../services/security.js';

const router = Router();
router.use(requireAdmin);

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

router.get('/overview', async (req, res, next) => {
  try {
    res.json({ success: true, overview: await getOverview() });
  } catch (err) {
    next(err);
  }
});

router.get('/system', async (req, res, next) => {
  try {
    res.json({ success: true, system: await getSystemInfo() });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const settings = toAdminSettings(parseSettings(await getSettings()));
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    if (req.body?.security) {
      await assertAdminKeepsAccess(req, { security: req.body.security });
    }
    const settings = await updateAdminSettings(req.body || {});
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/logo', (req, res, next) => {
  logoUpload(req, res, async (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Logo file is required' });
    }
    try {
      await verifyUploadedFile(req.file, 'logo');
      const settings = await setProjectLogo(req.file.filename, req.query.variant);
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  });
});

router.delete('/settings/logo', async (req, res, next) => {
  try {
    const settings = await clearProjectLogo(req.query.variant);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

router.post('/integrations/:kind/test', async (req, res, next) => {
  try {
    const result = await testIntegration(req.params.kind, req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    res.json({ success: true, users: await listUsers() });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const user = await createUser(req.body || {});
    res.status(201).json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await findUserById(Number(req.params.id));
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user: toAdminUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const user = await updateUser(Number(req.params.id), req.body || {}, {
      allowRole: true,
      actorId: req.user.id,
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/avatar', (req, res, next) => {
  avatarUpload(req, res, async (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Avatar file is required' });
    }
    try {
      await verifyUploadedFile(req.file, 'avatar');
      const user = await setAvatar(Number(req.params.id), req.file.filename);
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  });
});

router.post('/users/:id/revoke-sessions', async (req, res, next) => {
  try {
    const user = await revokeSessions(Number(req.params.id));
    res.json({ success: true, user: toAdminUser(user) });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    await deleteUser(Number(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/security/events', async (req, res, next) => {
  try {
    const data = await listSecurityEvents({
      kind: req.query.kind,
      limit: req.query.limit,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

router.get('/security/ip-rules', async (req, res, next) => {
  try {
    const rules = await listIpRules(req.query.listType);
    res.json({ success: true, rules, yourIp: clientIp(req) });
  } catch (err) {
    next(err);
  }
});

router.post('/security/ip-rules', async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
});

router.delete('/security/ip-rules/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const remaining = (await listIpRules()).filter((rule) => Number(rule.id) !== id);
    await assertAdminKeepsAccess(req, { rules: remaining });
    await removeIpRule(id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
