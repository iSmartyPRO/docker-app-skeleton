import config from '../config/app.js';
import { verifyToken } from '../services/auth.js';
import { hasAnyPermission } from '../services/permissions.js';
import { getSessionUser, toPublicUser } from '../services/users.js';

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

  const session = await getSessionUser(Number(payload.sub));
  if (!session) return null;
  const { row, access } = session;
  if (Number(payload.tv || 0) !== Number(row.token_version || 0)) return null;
  req.auth = payload;
  req.userRow = row;
  req.access = access;
  req.user = toPublicUser(row, access);
  req.actor = { id: row.id, permissions: new Set(access.permissions) };
  return row;
}

export async function requireAuth(req, res, next) {
  try {
    // Already resolved by an outer guard on the same request.
    const user = req.userRow || (await loadSessionUser(req));
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
