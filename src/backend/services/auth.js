import jwt from 'jsonwebtoken';
import config from '../config/app.js';
import { markLogin } from './users.js';

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

export function verifyToken(token) {
  return jwt.verify(token, requireJwtSecret());
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

/** Records the sign-in and sets the session cookie. Shared by every sign-in method. */
export async function startSession(req, res, user, { method, sessionDays }) {
  await markLogin(user.id, method);
  res.cookie(config.auth.cookieName, signToken(user, { sessionDays }), cookieOptions(req, { sessionDays }));
}
