import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/app.js';
import { requireAuth } from '../middleware/auth.js';
import { clientIp } from '../middleware/ipGuard.js';
import { cookieOptions, loginWithPassword } from '../services/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { isLockedOut, recordLoginAttempt, recordSecurityEvent } from '../services/security.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    const username = String(req.body?.username || '').trim().slice(0, 64);
    await recordSecurityEvent({
      kind: 'rate_limited',
      severity: 'warning',
      username,
      ip: clientIp(req),
      detail: 'Login rate limit exceeded',
      debounceMinutes: 5,
    }).catch(() => {});
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Try again later.',
    });
  },
});

async function sessionOptions() {
  try {
    const parsed = parseSettings(await getSettings());
    return { sessionDays: parsed.security?.sessionDays };
  } catch {
    return {};
  }
}

router.post('/login', loginLimiter, async (req, res, next) => {
  const username = String(req.body?.username || '').trim().slice(0, 64);
  const password = req.body?.password;
  const ip = clientIp(req);

  try {
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
      });
    }

    if (await isLockedOut(username, ip)) {
      await recordSecurityEvent({
        kind: 'lockout',
        severity: 'danger',
        username,
        ip,
        detail: 'Login locked after repeated failures',
        debounceMinutes: 10,
      });
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Try again later.',
      });
    }

    const options = await sessionOptions();
    const { token, user } = await loginWithPassword(username, password, options);
    await recordLoginAttempt({ username, ip, success: true });
    res.cookie(config.auth.cookieName, token, cookieOptions(req, options));
    res.json({ success: true, user });
  } catch (err) {
    if ((err.statusCode || err.status || 500) >= 500) {
      return next(err);
    }
    await recordLoginAttempt({ username, ip, success: false }).catch(() => {});
    const kind = err.eventKind || 'login_failed';
    await recordSecurityEvent({
      kind,
      severity: kind === 'login_failed' ? 'warning' : 'danger',
      username,
      ip,
      detail:
        kind === 'account_disabled'
          ? 'Disabled account'
          : kind === 'account_blocked'
            ? 'Blocked account'
            : 'Invalid username or password',
      debounceMinutes: kind === 'login_failed' ? 1 : 0,
    }).catch(() => {});
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(config.auth.cookieName, cookieOptions(req));
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
