import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/app.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { hasPermission } from '../services/permissions.js';
import {
  STATE_COOKIE,
  allowedDomains,
  beginAuthorization,
  connectGmailSender,
  domainAllowed,
  exchangeCode,
  googleConfig,
  readState,
  saveGoogleAccount,
  verifyIdToken,
} from '../services/google.js';
import { clientIp } from '../middleware/ipGuard.js';
import { cookieOptions, startSession } from '../services/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { isLockedOut, recordLoginAttempt, recordSecurityEvent } from '../services/security.js';
import {
  requestSignInCode,
  signInWithCode,
  signInWithMagicLink,
  signInWithPassword,
  signInWithGoogle,
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
    await requestSignInCode(channel, identifier, mode, { ip: clientIp(req) }).catch((err) => {
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

// ── Google OAuth (sign-in, account connection, Gmail sender) ────────────────

const googleLimiter = limiter(40, 'Google sign-in rate limit exceeded');
const GOOGLE_PURPOSES = ['signin', 'connect', 'gmail'];

function googleFailure(purpose, code) {
  const safe = encodeURIComponent(String(code || 'GOOGLE_ERROR').replace(/[^A-Z_]/g, '').slice(0, 32) || 'GOOGLE_ERROR');
  if (purpose === 'connect') return `/account/connections?google_error=${safe}`;
  if (purpose === 'gmail') return `/admin/settings/google?google_error=${safe}`;
  return `/login?error=${safe}`;
}

function stateCookieOptions(req) {
  const { maxAge, ...base } = cookieOptions(req);
  return { ...base, path: '/api/auth/google', maxAge: 10 * 60 * 1000 };
}

function withQuery(path, key, value) {
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${value}`;
}

router.get('/google/start', googleLimiter, optionalAuth, async (req, res) => {
  const purpose = GOOGLE_PURPOSES.includes(req.query.purpose) ? req.query.purpose : 'signin';
  try {
    if (purpose === 'gmail' && !hasPermission(req.access?.permissions || [], 'settings.integrations')) {
      return res.redirect(googleFailure(purpose, 'FORBIDDEN'));
    }
    const { url, state } = await beginAuthorization({
      purpose,
      userId: req.userRow?.id || null,
      returnTo: req.query.returnTo,
      loginHint: purpose === 'signin' ? undefined : req.userRow?.email,
    });
    res.cookie(STATE_COOKIE, state, stateCookieOptions(req));
    return res.redirect(url);
  } catch (err) {
    return res.redirect(googleFailure(purpose, err.code));
  }
});

router.get('/google/callback', googleLimiter, optionalAuth, async (req, res) => {
  const ip = clientIp(req);
  const { maxAge, ...clearOptions } = stateCookieOptions(req);
  const raw = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, clearOptions);
  let state;
  try {
    state = readState(raw, String(req.query.state || ''));
  } catch (err) {
    return res.redirect(googleFailure('signin', err.code));
  }
  const purpose = state.p;
  if (req.query.error) {
    return res.redirect(googleFailure(purpose, req.query.error === 'access_denied' ? 'GOOGLE_DENIED' : 'GOOGLE_ERROR'));
  }

  let claims = null;
  try {
    const tokens = await exchangeCode(String(req.query.code || ''), state.v);
    const { cfg } = await googleConfig();
    claims = await verifyIdToken(tokens.id_token, { clientId: cfg.clientId, nonce: state.n });

    if (purpose === 'signin') {
      if (await isLockedOut(claims.email || '', ip)) return res.redirect(googleFailure(purpose, 'LOCKED'));
      const { user, method } = await signInWithGoogle(claims);
      await recordLoginAttempt({ username: user.username, ip, success: true });
      await startSession(req, res, user, { method, sessionDays: await sessionDays() });
      return res.redirect(state.r);
    }

    // Connecting must finish in the same signed-in session that started it.
    if (!req.userRow || req.userRow.id !== state.u) return res.redirect(googleFailure(purpose, 'AUTH_REQUIRED'));
    if (purpose === 'connect') {
      if (!domainAllowed(claims, allowedDomains(cfg))) return res.redirect(googleFailure(purpose, 'GOOGLE_DOMAIN'));
      await saveGoogleAccount(req.userRow.id, claims, tokens);
      return res.redirect(withQuery(state.r, 'google', 'connected'));
    }
    if (!hasPermission(req.access.permissions, 'settings.integrations')) return res.redirect(googleFailure(purpose, 'FORBIDDEN'));
    await connectGmailSender(claims, tokens);
    return res.redirect(withQuery(state.r, 'gmail', 'connected'));
  } catch (err) {
    if (purpose === 'signin') {
      const login = String(claims?.email || 'google').slice(0, 64);
      await recordLoginAttempt({ username: login, ip, success: false }).catch(() => {});
      await recordSecurityEvent({
        kind: err.eventKind || 'login_failed',
        severity: err.eventKind && err.eventKind !== 'login_failed' ? 'danger' : 'warning',
        username: login,
        ip,
        detail: `Google sign-in failed: ${err.code || err.message}`.slice(0, 200),
        debounceMinutes: 1,
      }).catch(() => {});
    } else if ((err.statusCode || 500) >= 500) {
      console.warn('Google connection failed:', err.message);
    }
    // Disabled / blocked accounts look like any other failure.
    const code = err.eventKind && err.eventKind !== 'login_failed' ? 'INVALID_CREDENTIALS' : err.code;
    return res.redirect(googleFailure(purpose, code));
  }
});

router.post('/logout', (req, res) => {
  const { maxAge, ...options } = cookieOptions(req);
  res.clearCookie(config.auth.cookieName, options);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
