import { Router } from 'express';
import config from '../config/app.js';
import { requireAuth } from '../middleware/auth.js';
import { avatarUpload, verifyUploadedFile } from '../middleware/upload.js';
import { cookieOptions, signToken } from '../services/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import {
  changePassword,
  findUserById,
  setAvatar,
  toPublicUser,
  updateUser,
} from '../services/users.js';

const router = Router();
router.use(requireAuth);

router.get('/profile', async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    res.json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const user = await updateUser(req.user.id, {
      displayName: req.body?.displayName,
      email: req.body?.email,
      locale: req.body?.locale,
      theme: req.body?.theme,
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.put('/password', async (req, res, next) => {
  try {
    const user = await changePassword(
      req.user.id,
      req.body?.currentPassword,
      req.body?.password
    );
    let sessionDays;
    try {
      sessionDays = parseSettings(await getSettings()).security?.sessionDays;
    } catch {
      sessionDays = 7;
    }
    const fresh = await findUserById(req.user.id);
    res.cookie(
      config.auth.cookieName,
      signToken(fresh, { sessionDays }),
      cookieOptions(req, { sessionDays })
    );
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post('/avatar', (req, res, next) => {
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
      const user = await setAvatar(req.user.id, req.file.filename);
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  });
});

export default router;
