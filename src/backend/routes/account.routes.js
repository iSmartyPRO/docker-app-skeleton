import { Router } from 'express';
import config from '../config/app.js';
import { requireAuth } from '../middleware/auth.js';
import { avatarUpload, verifyUploadedFile } from '../middleware/upload.js';
import { cookieOptions, signToken } from '../services/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import {
  changePassword,
  findUserById,
  revokeSessions,
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
    const days = await sessionDays();
    const fresh = await findUserById(req.user.id);
    res.cookie(
      config.auth.cookieName,
      signToken(fresh, { sessionDays: days }),
      cookieOptions(req, { sessionDays: days })
    );
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

async function sessionDays() {
  try {
    return parseSettings(await getSettings()).security?.sessionDays;
  } catch {
    return 7;
  }
}

// Signs out every other device: bumps token_version and re-issues this cookie.
router.post('/sessions/revoke', async (req, res, next) => {
  try {
    const fresh = await revokeSessions(req.user.id);
    const days = await sessionDays();
    res.cookie(
      config.auth.cookieName,
      signToken(fresh, { sessionDays: days }),
      cookieOptions(req, { sessionDays: days })
    );
    res.json({ success: true });
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
