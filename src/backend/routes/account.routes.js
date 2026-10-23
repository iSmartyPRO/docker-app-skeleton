import { Router } from 'express';
import { refuseImpersonation, requireAuth } from '../middleware/auth.js';
import { avatarUpload, verifyUploadedFile } from '../middleware/upload.js';
import { cookieOptions, signToken, verifyToken } from '../services/auth.js';
import { listUserSessions, renewSession, revokeSessionById, revokeUserSessions } from '../services/sessions.js';
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
import { canFollow as canFollowTarget } from '../platform/registry.js';
const router = Router();
router.use(requireAuth);
// "Sign in as" never changes how the person signs in (see middleware/auth.js).
router.use(['/password', '/sessions', '/telegram', '/google'], refuseImpersonation);

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

/**
 * Re-issues this device's cookie after token_version changed: same session
 * (`sid`), new token. Every other session of the person has just been cut off
 * by the bump, so their rows are ended too.
 */
async function reissue(req, res) {
  const days = await sessionDays();
  const fresh = await findUserById(req.user.id);
  const claims = req.sessionId ? { sid: req.sessionId } : {};
  const token = signToken(fresh, { sessionDays: days, claims });
  if (req.sessionId) {
    await renewSession(req.sessionId, { tokenVersion: fresh.token_version, expiresAt: new Date(verifyToken(token).exp * 1000) });
    await revokeUserSessions(req.user.id, { exceptId: req.sessionId });
  }
  res.cookie(config.auth.cookieName, token, cookieOptions(req, { sessionDays: days }));
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
    regional: req.body?.regional,
    deviceTz: req.body?.deviceTz,
  });
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

router.put('/password', wrap(async (req, res) => {
  await changePassword(req.user.id, req.body?.currentPassword, req.body?.password);
  await reissue(req, res);
  res.json({ success: true, user: await freshUser(req.user.id) });
}));

// ── Sessions: where the person is signed in ─────────────────────────────────

router.get('/sessions', wrap(async (req, res) => {
  res.json({ success: true, sessions: await listUserSessions(req.user.id, { currentId: req.sessionId }) });
}));

// Signs out every other device: ends their rows, bumps token_version (cookies
// from before sessions had rows) and re-issues this cookie.
const revokeOthers = wrap(async (req, res) => {
  await revokeSessions(req.user.id);
  await reissue(req, res);
  res.json({ success: true, sessions: await listUserSessions(req.user.id, { currentId: req.sessionId }) });
});
router.post('/sessions/revoke-others', revokeOthers);
router.post('/sessions/revoke', revokeOthers);

// Ends one other device; this one signs out with /auth/logout.
router.delete('/sessions/:id', wrap(async (req, res) => {
  if (req.params.id === req.sessionId) {
    res.status(400).json({ success: false, code: 'CURRENT_SESSION', error: 'Use sign out to end this session' });
    return;
  }
  if (!(await revokeSessionById(req.params.id, req.user.id))) {
    res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Session not found' });
    return;
  }
  res.json({ success: true, sessions: await listUserSessions(req.user.id, { currentId: req.sessionId }) });
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
// Modules register what can be followed (registerFollowable: tasks.project, calendar.calendar).
async function canFollow(req, type, id) {
  return canFollowTarget(req, type, id);
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
