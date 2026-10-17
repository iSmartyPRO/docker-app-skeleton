import rateLimit from 'express-rate-limit';
import { clientIp } from './ipGuard.js';
import { lockoutKey } from '../services/security.js';

/**
 * Sign-in rate limiters (15-minute window by default). `key` picks the
 * bucket; with `failuresOnly` a request is given back once it succeeds
 * (status < 400), so people signing in correctly never use up the budget —
 * an office behind one NAT address used to hit the limit with 20
 * *successful* sign-ins. `onLimited(req, res)` answers a refused request.
 */
export function signInLimiter({ max, key = (req) => clientIp(req), failuresOnly = false, windowMs = 15 * 60 * 1000, onLimited }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    keyGenerator: key,
    handler: (req, res) => {
      if (onLimited) return onLimited(req, res);
      return res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
    },
  });
}

/** The account a sign-in request names (lower-cased), '' when it names none. */
export function attemptAccount(req) {
  const body = req.body || {};
  const name = body.username ?? body.identifier ?? (body.id ? `tg${body.id}` : '');
  return String(name || '').trim().toLowerCase().slice(0, 128);
}

/**
 * Bucket key: the address plus the account it tries, folded like the per-account lockout of
 * directory sign-ins (lockoutKey with `directory`): `ivan`, `CORP\ivan` and `ivan@corp` share one
 * bucket, and phone numbers count by their digits.
 */
export const addressAndAccount = (req) => `${clientIp(req)}|${lockoutKey(attemptAccount(req), { directory: true })}`;

/**
 * Limiter pair for a sign-in endpoint that answers 200 on success:
 * failed attempts only — `perAccount` per address+account, `perAddress` per
 * address overall (password spraying across many names). The per-account
 * lockout in services/security.js applies on top.
 */
export function failedSignInLimiters({ perAccount = 20, perAddress = 100, onLimited } = {}) {
  return [
    signInLimiter({ max: perAddress, failuresOnly: true, onLimited }),
    signInLimiter({ max: perAccount, key: addressAndAccount, failuresOnly: true, onLimited }),
  ];
}
