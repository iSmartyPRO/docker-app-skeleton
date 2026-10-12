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
  tokenLockedChanges,
  toPublicUser,
  unlinkTelegram,
  updateUser,
} from '../services/users.js';

import { disconnectGoogle, googleStatus, listGoogleCalendars, setGoogleCalendarSelection } from '../services/google.js';
import { deliveryHistory, getPrefs, listSubscriptions, savePrefs, sendTest, setSubscription, takeTestSend } from '../services/notifications.js';
import { contextFromRequest, levelOn } from '../modules/shared/acl.js';
import { query } from '../config/database.js';
import { canViewCalendar } from '../modules/calendar/service.js';
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

// An API token cannot change the contacts that receive sign-in codes.
router.put('/profile', wrap(async (req, res) => {
  const locked = tokenLockedChanges(req.body, req.userRow || (await findUserById(req.user.id)), Boolean(req.apiToken));
  if (locked.length) {
    res.status(403).json({
      success: false,
      code: 'TOKEN_FORBIDDEN_FIELD',
      error: `An API token cannot change ${locked.join(', ')}. Sign in to the portal to change contacts.`,
      fields: locked,
    });
    return;
  }
  await updateUser(req.user.id, {
    displayName: req.body?.displayName,
    email: req.body?.email,
    phone: req.body?.phone,
    mattermost: req.body?.mattermost,
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

// ── Google (linked account, Calendar access) ────────────────────────────────

router.get('/google', wrap(async (req, res) => {
  res.json({ success: true, google: await googleStatus(req.user.id) });
}));

router.get('/google/calendars', wrap(async (req, res) => {
  const status = await googleStatus(req.user.id);
  if (!status.calendar) return res.json({ success: true, calendars: [], selected: [] });
  const calendars = await listGoogleCalendars(req.user.id);
  // Nothing chosen yet: show the primary calendar.
  const selected = status.calendars.length ? status.calendars : calendars.filter((item) => item.primary).map((item) => item.id);
  return res.json({ success: true, calendars, selected });
}));

router.put('/google/calendars', wrap(async (req, res) => {
  res.json({ success: true, selected: await setGoogleCalendarSelection(req.user.id, req.body?.selected) });
}));

router.delete('/google', wrap(async (req, res) => {
  await disconnectGoogle(req.user.id);
  res.json({ success: true, google: await googleStatus(req.user.id) });
}));

// ── Notification preferences ────────────────────────────────────────────────

router.get('/notifications', wrap(async (req, res) => {
  res.json({ success: true, ...(await getPrefs(req.user.id)) });
}));

router.put('/notifications', wrap(async (req, res) => {
  res.json({ success: true, ...(await savePrefs(req.user.id, req.body || {})) });
}));

router.post('/notifications/test', wrap(async (req, res) => {
  // Test messages go to whatever contact the profile holds, so they are
  // rationed: the portal's senders must not become a spam cannon.
  const allowed = takeTestSend(req.user.id);
  if (!allowed.ok) {
    res.setHeader('Retry-After', String(allowed.retryAfter));
    res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Too many test notifications. Try again later.', retryAfter: allowed.retryAfter });
    return;
  }
  res.json({ success: true, ...(await sendTest(req.user.id, { channel: req.body?.channel })) });
}));

router.get('/notifications/history', wrap(async (req, res) => {
  res.json({ success: true, items: await deliveryHistory(req.user.id, req.query.limit) });
}));

/** Can the person (still) see what a subscription points at? */
async function canFollow(req, type, id) {
  if (!Number.isInteger(Number(id))) return false;
  if (type === 'tasks.project') {
    const { rows } = await query(`SELECT is_personal FROM task_projects WHERE id = $1`, [Number(id)]);
    return Boolean(rows[0]) && !rows[0].is_personal && (await levelOn('task_acl', Number(id), contextFromRequest(req, 'tasks.admin'))) > 0;
  }
  if (type === 'calendar.calendar') return canViewCalendar(contextFromRequest(req, 'calendar.admin'), Number(id));
  return false;
}

router.get('/notifications/subscriptions', wrap(async (req, res) => {
  const list = await listSubscriptions(req.user.id);
  const visible = [];
  for (const item of list) if (await canFollow(req, item.type, item.id)) visible.push(item);
  res.json({ success: true, subscriptions: visible });
}));

router.put('/notifications/subscriptions', wrap(async (req, res) => {
  const { type, id, on } = req.body || {};
  // Only things the person can see may be followed.
  if (on && !(await canFollow(req, type, id))) {
    res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Not found' });
    return;
  }
  res.json({ success: true, subscribed: await setSubscription(req.user.id, type, id, Boolean(on)) });
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
