import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
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
  toAdminUser,
  updateUser,
} from '../services/users.js';
import { testIntegration } from '../services/integrations.js';
import {
  addIpRule,
  listIpRules,
  listSecurityEvents,
  removeIpRule,
} from '../services/security.js';

const router = Router();
router.use(requireAdmin);

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
      const settings = await setProjectLogo(req.file.filename);
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  });
});

router.delete('/settings/logo', async (req, res, next) => {
  try {
    const settings = await clearProjectLogo();
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
    res.json({ success: true, rules });
  } catch (err) {
    next(err);
  }
});

router.post('/security/ip-rules', async (req, res, next) => {
  try {
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
    await removeIpRule(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
