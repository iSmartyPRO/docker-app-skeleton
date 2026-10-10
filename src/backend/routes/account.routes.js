import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { avatarUpload, verifyUploadedFile } from '../middleware/upload.js';
import { cookieOptions, signToken } from '../services/auth.js';
import config from '../config/app.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { verifyTelegramForLinking } from '../services/signin.js';
import {
  changePassword,
  findUserById,
  getSessionUser,
  linkTelegram,
  revokeSessions,
  setAvatar,
  toPublicUser,
  unlinkTelegram,
  updateUser,
} from '../services/users.js';

const router = Router();
router.use(requireAuth);

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

async function sessionDays() {
  try {
    return parseSettings(await getSettings()).security?.sessionDays;
  } catch {
    return 7;
  }
}

async function freshUser(id) {
  const session = await getSessionUser(id);
  return toPublicUser(session.row, session.access);
}

/** Re-issues this device's cookie after token_version changed. */
async function reissue(req, res) {
  const days = await sessionDays();
  const fresh = await findUserById(req.user.id);
  res.cookie(config.auth.cookieName, signToken(fresh, { sessionDays: days }), cookieOptions(req, { sessionDays: days }));
}

router.get('/profile', wrap(async (req, res) => {
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

router.put('/profile', wrap(async (req, res) => {
  await updateUser(req.user.id, {
    displayName: req.body?.displayName,
    email: req.body?.email,
    phone: req.body?.phone,
    locale: req.body?.locale,
    theme: req.body?.theme,
  });
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

router.put('/password', wrap(async (req, res) => {
  await changePassword(req.user.id, req.body?.currentPassword, req.body?.password);
  await reissue(req, res);
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

// Signs out every other device: bumps token_version and re-issues this cookie.
router.post('/sessions/revoke', wrap(async (req, res) => {
  await revokeSessions(req.user.id);
  await reissue(req, res);
  res.json({ success: true });
}));

router.post('/telegram', wrap(async (req, res) => {
  const telegram = await verifyTelegramForLinking(req.body || {});
  await linkTelegram(req.user.id, telegram);
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

router.delete('/telegram', wrap(async (req, res) => {
  await unlinkTelegram(req.user.id);
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

router.post('/avatar', (req, res, next) => {
  avatarUpload(req, res, async (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Avatar file is required' });
    try {
      await verifyUploadedFile(req.file, 'avatar');
      await setAvatar(req.user.id, req.file.filename);
      return res.json({ success: true, user: await freshUser(req.user.id) });
    } catch (error) {
      return next(error);
    }
  });
});

export default router;
