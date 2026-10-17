import { createSecretKey } from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/app.js';
import { markLogin } from './users.js';
import { createSession, newSessionId, requestDetails } from './sessions.js';

function requireJwtSecret() {
  if (!config.auth.jwtSecret) {
    const error = new Error('JWT_SECRET is not configured');
    error.statusCode = 500;
    throw error;
  }
  return config.auth.jwtSecret;
}

function sessionDaysFrom(options = {}) {
  const days = Number(options.sessionDays);
  return days > 0 && days <= 90 ? days : 7;
}

export function signToken(user, options = {}) {
  const days = sessionDaysFrom(options);
  return jwt.sign(
    {
      sub: String(user.id),
      tv: Number(user.token_version || 0),
      // e.g. { imp: <administrator id> } for "sign in as the user"
      ...(options.claims || {}),
    },
    requireJwtSecret(),
    { expiresIn: `${days}d` }
  );
}

/*
 * Given a plain string, jsonwebtoken first tries it as a PEM public key (and
 * throws), then makes a secret key — on every request. The key object is
 * made once per secret; only HMAC algorithms are accepted, as before.
 */
let verifyKey = null;
let verifyKeyFor = null;
function secretKey() {
  const secret = requireJwtSecret();
  if (verifyKeyFor !== secret) {
    verifyKey = createSecretKey(Buffer.from(secret));
    verifyKeyFor = secret;
  }
  return verifyKey;
}

export function verifyToken(token) {
  return jwt.verify(token, secretKey(), { algorithms: ['HS256', 'HS384', 'HS512'] });
}

export function cookieOptions(req, options = {}) {
  const days = sessionDaysFrom(options);
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '');
  const secure =
    String(config.frontend.url).startsWith('https://') ||
    forwarded.split(',')[0].trim() === 'https' ||
    process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

/** Cookie keeping the administrator's own session while they act as someone else. */
export const IMPERSONATOR_COOKIE = 'da_impersonator';

/**
 * Creates a session row (device details for Account → Security → Sessions)
 * and returns the cookie token naming it in its `sid` claim.
 */
export async function issueSessionToken(req, user, { method, sessionDays, impersonatedBy = null } = {}) {
  const sid = newSessionId();
  const claims = { sid, ...(impersonatedBy ? { imp: impersonatedBy } : {}) };
  const token = signToken(user, { sessionDays, claims });
  const { exp } = verifyToken(token);
  await createSession({
    id: sid,
    userId: user.id,
    expiresAt: new Date(exp * 1000),
    method,
    impersonatedBy,
    tokenVersion: user.token_version,
    ...requestDetails(req),
  });
  return token;
}

/** Records the sign-in and sets the session cookie. Shared by every sign-in method. */
export async function startSession(req, res, user, { method, sessionDays }) {
  await markLogin(user.id, method);
  const token = await issueSessionToken(req, user, { method, sessionDays });
  res.cookie(config.auth.cookieName, token, cookieOptions(req, { sessionDays }));
}
