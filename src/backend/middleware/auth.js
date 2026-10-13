import config from '../config/app.js';
import { verifyToken } from '../services/auth.js';
import { hasAnyPermission } from '../services/permissions.js';
import { findUserById, getSessionUser, toPublicUser } from '../services/users.js';
import { localeFor } from '../services/settings.js';
import { isSessionRevoked } from '../services/security.js';

/**
 * Resolves the session cookie into:
 *   req.userRow — database row
 *   req.access  — { roles, groups, permissions, ... }
 *   req.user    — public user shape (includes roles and permissions)
 *   req.actor   — { id, permissions } for service-level authorization checks
 */
async function loadSessionUser(req) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return null;

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }

  // Signed out on this device (the token is still cryptographically valid).
  if (await isSessionRevoked(token)) return null;

  const session = await getSessionUser(Number(payload.sub));
  if (!session) return null;
  const { row, access } = session;
  if (Number(payload.tv || 0) !== Number(row.token_version || 0)) return null;
  req.auth = payload;
  req.userRow = row;
  req.access = access;
  req.user = toPublicUser(row, access);
  // Language for server-made texts: the person's choice, else the portal default.
  req.locale = await localeFor(row);
  req.actor = { id: row.id, permissions: new Set(access.permissions) };
  // A superadministrator acting as this person ("sign in as"): who, for the banner and audit.
  if (payload.imp) {
    const admin = await findUserById(Number(payload.imp));
    req.impersonator = admin ? { id: admin.id, username: admin.username, displayName: admin.display_name || admin.username } : { id: Number(payload.imp) };
    req.user = { ...req.user, impersonator: req.impersonator };
  }
  return row;
}

const IMPERSONATION_LOCKED = /^\/api(\/v1)?\/(account\/(password|sessions|telegram|google|api)|auth\/(telegram|google)|admin\/users\/\d+\/impersonate)(\/|$)/;

export async function requireAuth(req, res, next) {
  try {
    // Already resolved by an outer guard on the same request.
    const user = req.userRow || (await loadSessionUser(req));
    if (!user) {
      return res.status(401).json({ success: false, code: 'SESSION_REQUIRED', error: 'Authentication required' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ success: false, error: 'Account is disabled' });
    }
    if (user.is_blocked === true) {
      return res.status(403).json({ success: false, error: 'Account is blocked' });
    }
    // Acting as someone else ("sign in as"): look and work, but never change how
    // the person signs in — password, sessions, linked accounts, API tokens.
    if (req.auth?.imp && req.method !== 'GET' && IMPERSONATION_LOCKED.test(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ success: false, code: 'IMPERSONATION_LIMIT', error: 'Not available while signed in as another user' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Resolves the session when there is one; never rejects. */
export async function optionalAuth(req, res, next) {
  try {
    if (!req.userRow) await loadSessionUser(req);
  } catch {
    /* anonymous */
  }
  next();
}

/** Allows the request when the user holds at least one of `permissions`. */
export function requirePermission(...permissions) {
  return (req, res, next) =>
    requireAuth(req, res, () => {
      if (!hasAnyPermission(req.access.permissions, permissions)) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission for this action',
          code: 'FORBIDDEN',
        });
      }
      return next();
    });
}

/** Admin console entry point. */
export const requireConsole = requirePermission('console.access');
