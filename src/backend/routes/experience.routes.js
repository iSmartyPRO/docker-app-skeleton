import { Router } from 'express';
import multer from 'multer';
import { refuseImpersonation, requireAuth, requirePermission } from '../middleware/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { getSessionUser, toPublicUser } from '../services/users.js';
import { getTourState, getUserUi, markTour, forgetTour, resetAllTours, setToursDisabled, updateUserUi } from '../services/tours.js';
import { BACKGROUND_LIMITS, IMAGE_ID_RE, backgroundFile, pruneBackgrounds, storeBackground } from '../services/themeImage.js';

/*
 * Personal experience: guided tours and themes.
 *
 *   GET  /api/account/tours                  { seen, disabled }
 *   PUT  /api/account/tours                  { id, status, version } | { disabled } | { forget: id }
 *   GET  /api/account/ui                     { ui }   (also part of /auth/me → user.ui)
 *   PUT  /api/account/ui                     { motion?, toursOff?, custom? } → { ui, user }
 *   POST /api/account/background             multipart `image` → { image: { id, scheme, luma, urls } }
 *   GET  /api/account/background/:id/:variant  the person's own picture (full | mobile | placeholder)
 *   POST /api/admin/tours/reset              everyone sees the tours again (settings.general)
 */

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

async function themePolicy() {
  try {
    return parseSettings(await getSettings()).appearance.themes;
  } catch {
    return { allowed: [], allowCustom: true, allowMotion: true };
  }
}

const imageUrls = (id) => ({
  full: `/api/account/background/${id}/full`,
  mobile: `/api/account/background/${id}/mobile`,
  placeholder: `/api/account/background/${id}/placeholder`,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BACKGROUND_LIMITS.maxBytes, files: 1 } }).single('image');

export const accountExperienceRoutes = Router();
accountExperienceRoutes.use(['/tours', '/ui', '/background'], requireAuth);
// "Sign in as" looks around but never changes the person's tours or theme.
accountExperienceRoutes.use(['/tours', '/ui', '/background'], refuseImpersonation);

accountExperienceRoutes.get('/tours', wrap(async (req, res) => {
  res.json({ success: true, ...(await getTourState(req.user.id)) });
}));

accountExperienceRoutes.put('/tours', wrap(async (req, res) => {
  const body = req.body || {};
  if (typeof body.disabled === 'boolean') await setToursDisabled(req.user.id, body.disabled);
  else if (body.forget) await forgetTour(req.user.id, body.forget);
  else await markTour(req.user.id, body);
  res.json({ success: true, ...(await getTourState(req.user.id)) });
}));

accountExperienceRoutes.get('/ui', wrap(async (req, res) => {
  res.json({ success: true, ui: await getUserUi(req.user.id) });
}));

accountExperienceRoutes.put('/ui', wrap(async (req, res) => {
  const patch = req.body || {};
  // While the custom theme is off nothing of it (picture, accent, panels) is saved; clearing it still works.
  if (patch.custom && typeof patch.custom === 'object') {
    const policy = await themePolicy();
    if (!policy.allowCustom) return res.status(403).json({ success: false, code: 'BG_DISABLED', error: 'Custom backgrounds are turned off' });
    if (patch.custom.image && !IMAGE_ID_RE.test(String(patch.custom.image))) return res.status(400).json({ success: false, code: 'BG_ID', error: 'Unknown picture' });
  }
  const ui = await updateUserUi(req.user.id, patch);
  // Only the saved picture stays; earlier ones and unsaved previews go.
  if (patch.custom !== undefined) await pruneBackgrounds(req.user.id, [ui.custom?.image]);
  const session = await getSessionUser(req.user.id);
  res.json({ success: true, ui, user: toPublicUser(session.row, session.access) });
}));

accountExperienceRoutes.post('/background', (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, code: 'BG_TOO_LARGE', error: 'The picture is larger than 8 MB' });
      err.statusCode = 400;
      return next(err);
    }
    try {
      const policy = await themePolicy();
      if (!policy.allowCustom) return res.status(403).json({ success: false, code: 'BG_DISABLED', error: 'Custom backgrounds are turned off' });
      if (!req.file) return res.status(400).json({ success: false, code: 'BG_EMPTY', error: 'Choose a picture' });
      const image = await storeBackground(req.user.id, req.file.buffer);
      // Only once the new one is ready: keep the saved picture and this one; earlier unsaved previews go.
      const saved = (await getUserUi(req.user.id)).custom?.image;
      await pruneBackgrounds(req.user.id, [saved, image.id]);
      return res.json({ success: true, image: { ...image, urls: imageUrls(image.id) } });
    } catch (error) {
      if (error.statusCode && error.code) return res.status(error.statusCode).json({ success: false, code: error.code, error: error.message });
      return next(error);
    }
  });
});

accountExperienceRoutes.get('/background/:id/:variant', requireAuth, (req, res) => {
  const file = backgroundFile(req.user.id, req.params.id, req.params.variant);
  if (!file) return res.status(404).json({ success: false, error: 'Not found' });
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Ids are random and never reused: the browser may keep it.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  return res.sendFile(file, (error) => {
    if (error && !res.headersSent) res.status(404).json({ success: false, error: 'Not found' });
  });
});

export const adminExperienceRoutes = Router();

adminExperienceRoutes.post('/reset', requirePermission('settings.general'), refuseImpersonation, wrap(async (req, res) => {
  const removed = await resetAllTours();
  console.info(`tours: reset for everyone by @${req.user?.username} (${removed} marks removed)`);
  res.json({ success: true, removed });
}));
