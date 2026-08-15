import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config/app.js';
import { findUserByUsername, markLogin, toPublicUser } from './users.js';

const DUMMY_HASH = bcrypt.hashSync('__dummy_not_a_password__', 12);

function authError(eventKind = 'login_failed') {
  const error = new Error('Invalid username or password');
  error.statusCode = 401;
  error.eventKind = eventKind;
  return error;
}

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

export async function loginWithPassword(username, password, options = {}) {
  const user = await findUserByUsername(String(username || '').trim());
  const ok = await bcrypt.compare(String(password || ''), user?.password_hash || DUMMY_HASH);
  if (!user || !ok) {
    throw authError('login_failed');
  }

  if (user.is_active === false) {
    throw authError('account_disabled');
  }
  if (user.is_blocked === true) {
    throw authError('account_blocked');
  }

  await markLogin(user.id);

  return {
    token: signToken(user, options),
    user: toPublicUser(user),
  };
}
