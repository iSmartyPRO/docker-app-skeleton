import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/app.js';
import { requireAuth } from '../middleware/auth.js';
import { clientIp } from '../middleware/ipGuard.js';
import { cookieOptions, startSession } from '../services/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { isLockedOut, recordLoginAttempt, recordSecurityEvent } from '../services/security.js';
import {
  requestSignInCode,
  signInWithCode,
  signInWithMagicLink,
  signInWithPassword,
  signInWithTelegram,
} from '../services/signin.js';
import { toPublicUser } from '../services/users.js';
import { getUserAccess } from '../services/rbac.js';

const router = Router();

function limiter(max, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
      await recordSecurityEvent({
        kind: 'rate_limited',
        severity: 'warning',
        username: String(req.body?.username || req.body?.identifier || '').trim().slice(0, 64),
        ip: clientIp(req),
        detail: message,
        debounceMinutes: 5,
      }).catch(() => {});
      res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
    },
  });
}

const loginLimiter = limiter(20, 'Sign-in rate limit exceeded');
const codeLimiter = limiter(10, 'Sign-in code rate limit exceeded');

async function sessionDays() {
  try {
    return parseSettings(await getSettings()).security?.sessionDays;
  } catch {
    return undefined;
  }
}

const EVENT_DETAIL = {
  account_disabled: 'Disabled account',
  account_blocked: 'Blocked account',
  login_failed: 'Invalid credentials',
};

/**
 * Wraps every sign-in method with the same policy: lockout check, attempt
 * logging, security events, session cookie and a uniform response.
 */
function signIn(identify, attempt) {
  return async (req, res, next) => {
    const login = String(identify(req) || '').trim().slice(0, 64);
    const ip = clientIp(req);
    try {
      if (await isLockedOut(login, ip)) {
        await recordSecurityEvent({
          kind: 'lockout',
          severity: 'danger',
          username: login,
          ip,
          detail: 'Sign-in locked after repeated failures',
          debounceMinutes: 10,
        });
        return res.status(429).json({ success: false, error: 'Too many failed attempts. Try again later.', code: 'LOCKED' });
      }

      const { user, method } = await attempt(req);
      await recordLoginAttempt({ username: login || user.username, ip, success: true });
      await startSession(req, res, user, { method, sessionDays: await sessionDays() });
      const access = await getUserAccess(user.id);
      return res.json({ success: true, user: toPublicUser(user, access) });
    } catch (err) {
      if ((err.statusCode || err.status || 500) >= 500 || err.statusCode === 400) return next(err);
      await recordLoginAttempt({ username: login, ip, success: false }).catch(() => {});
      const kind = err.eventKind || 'login_failed';
      await recordSecurityEvent({
        kind,
        severity: kind === 'login_failed' ? 'warning' : 'danger',
        username: login,
        ip,
        detail: `${EVENT_DETAIL[kind] || 'Sign-in failed'} (${req.path.replace(/^\//, '') || 'login'})`,
        debounceMinutes: kind === 'login_failed' ? 1 : 0,
      }).catch(() => {});
      // Disabled and blocked accounts get the same message as a wrong password.
      const generic = kind !== 'login_failed';
      return res.status(401).json({
        success: false,
        error: generic ? 'Invalid username or password' : err.message,
        code: generic ? 'INVALID_CREDENTIALS' : err.code || 'INVALID_CREDENTIALS',
      });
    }
  };
}

router.post(
  '/login',
  loginLimiter,
  (req, res, next) => {
    if (!req.body?.username || !req.body?.password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    return next();
  },
  signIn(
    (req) => req.body.username,
    (req) => signInWithPassword(req.body.username, req.body.password)
  )
);

router.post(
  '/telegram',
  loginLimiter,
  signIn(
    (req) => (req.body?.username ? `@${req.body.username}` : `tg${req.body?.id || ''}`),
    (req) => signInWithTelegram(req.body || {})
  )
);

/** Step 1 of a one-time code sign-in. Always answers the same way. */
router.post('/code/request', codeLimiter, async (req, res, next) => {
  try {
    const channel = String(req.body?.channel || '');
    const identifier = String(req.body?.identifier || '').trim().slice(0, 255);
    if (!identifier) return res.status(400).json({ success: false, error: 'Enter your email or phone' });
    const mode = req.body?.mode === 'link' ? 'link' : 'code';
    await requestSignInCode(channel, identifier, mode).catch((err) => {
      if (err.expose) throw err;
      // Delivery problems are logged, not revealed: the answer must not leak
      // whether the account exists.
      console.warn('Sign-in code delivery failed:', err.message);
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/code/verify',
  loginLimiter,
  signIn(
    (req) => req.body?.identifier,
    (req) => signInWithCode(String(req.body?.channel || ''), req.body?.identifier, req.body?.code)
  )
);

router.post(
  '/magic',
  loginLimiter,
  signIn(
    () => 'magic-link',
    (req) => signInWithMagicLink(req.body?.token)
  )
);

router.post('/logout', (req, res) => {
  res.clearCookie(config.auth.cookieName, cookieOptions(req));
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
