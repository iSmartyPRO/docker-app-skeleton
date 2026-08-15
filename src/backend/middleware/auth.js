import config from '../config/app.js';
import { verifyToken } from '../services/auth.js';
import { findUserById, toPublicUser } from '../services/users.js';

export function optionalAuth(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.auth = verifyToken(token);
  } catch {
    req.user = null;
    req.auth = null;
  }
  return next();
}

async function loadSessionUser(req) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return null;

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }

  const user = await findUserById(Number(payload.sub));
  if (!user) return null;
  if (Number(payload.tv || 0) !== Number(user.token_version || 0)) return null;
  req.auth = payload;
  req.userRow = user;
  req.user = toPublicUser(user);
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    const user = await loadSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ success: false, error: 'Account is disabled' });
    }
    if (user.is_blocked === true) {
      return res.status(403).json({ success: false, error: 'Account is blocked' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Administrator access required',
      });
    }
    return next();
  });
}
