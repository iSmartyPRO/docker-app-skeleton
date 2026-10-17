import config from '../config/app.js';
import { verifyToken } from '../services/auth.js';
import { hasAnyPermission } from '../services/permissions.js';
import { getSessionUser, tokenLockedChanges, toPublicUser } from '../services/users.js';
import { isReadMethod, requestPath } from '../api/scopes.js';
import { localeFor, rememberRequestLocale } from '../services/settings.js';
import { isSessionRevoked } from '../services/security.js';
import { createSession, getSession, legacySessionId, requestDetails, sessionState, touchSession } from '../services/sessions.js';

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

  // Every cookie names a session row (`sid`); tokens issued before sessions
  // existed are named by their hash and get a row on first use.
  const sid = payload.sid || legacySessionId(token);
  let sessionRow = await getSession(sid);
  if (sessionRow && (sessionState(sessionRow) !== 'active' || Number(sessionRow.user_id) !== Number(payload.sub))) return null;
  if (!sessionRow && payload.sid) return null;
  // Signed out on this device before sessions had rows (the token is still cryptographically valid).
  if (!payload.sid && (await isSessionRevoked(token))) return null;

  const session = await getSessionUser(Number(payload.sub));
  if (!session) return null;
  const { row, access } = session;
  if (Number(payload.tv || 0) !== Number(row.token_version || 0)) return null;
  // "Sign in as" lives only as long as the administrator who started it may
  // still do so: active, not blocked, still a superadministrator.
  let impersonator = null;
  if (payload.imp) {
    impersonator = await getSessionUser(Number(payload.imp));
    if (!impersonatorAllowed(impersonator)) return null;
  }
  const details = requestDetails(req);
  if (!sessionRow) {
    sessionRow = await createSession({
      id: sid,
      userId: row.id,
      createdAt: payload.iat ? new Date(payload.iat * 1000) : null,
      expiresAt: new Date(Number(payload.exp) * 1000),
      method: payload.imp ? 'impersonation' : 'legacy',
      impersonatedBy: payload.imp ? Number(payload.imp) : null,
      tokenVersion: payload.tv,
      ...details,
    });
  }
  // Last activity: at most once a minute, never in the way of the request.
  touchSession(sid, details).catch(() => {});
  req.sessionId = sid;
  req.auth = payload;
  req.userRow = row;
  req.access = access;
  req.user = toPublicUser(row, access);
  // Language for server-made texts: the person's choice, else the portal default.
  req.locale = await localeFor(row, { acceptLanguage: req.headers['accept-language'] });
  // For messages sent later outside a request; not from "sign in as" (the administrator's browser).
  if (!payload.imp) rememberRequestLocale(row, req.locale);
  req.actor = { id: row.id, permissions: new Set(access.permissions) };
  // A superadministrator acting as this person ("sign in as"): who, for the banner and audit.
  if (impersonator) {
    const admin = impersonator.row;
    req.impersonator = { id: admin.id, username: admin.username, displayName: admin.display_name || admin.username };
    req.user = { ...req.user, impersonator: req.impersonator };
  }
  return row;
}

/** True while the administrator behind an `imp` claim may keep acting as someone. */
export function impersonatorAllowed(session) {
  if (!session?.row) return false;
  if (session.row.is_active === false || session.row.is_blocked === true) return false;
  return (session.access?.permissions || []).includes('*');
}

/*
 * What a "sign in as" session may not change: how the person signs in
 * (password, sessions, Telegram/Google links, API tokens, the contacts that
 * receive sign-in codes), their push devices, the API console, and starting
 * another impersonation. Paths are judged normalised (lower case, collapsed
 * slashes, /api/v1 folded) exactly like the token gate, because Express routes
 * ignore case.
 */
const IMPERSONATION_LOCKED = [
  /^\/account\/(password|sessions|telegram|google|api)(\/|$)/,
  /^\/auth\/(telegram|google)(\/|$)/,
  /^\/admin\/users\/[^/]+\/impersonate$/,
  /^\/admin\/api(\/|$)/,
  /^\/pwa\/push(\/|$)/,
];

/**
 * Whether an impersonation session must be refused this request.
 * `current` is the person's row (for the profile contact check).
 * → null | { fields? }
 */
export function impersonationLock(method, originalUrl, body, current) {
  if (isReadMethod(method)) return null;
  const path = requestPath(originalUrl);
  if (path === null) return {};
  if (IMPERSONATION_LOCKED.some((re) => re.test(path))) return {};
  if (path === '/account/profile') {
    const fields = tokenLockedChanges(body, current, true);
    if (fields.length) return { fields };
  }
  return null;
}

const impersonationRefusal = (res, lock) =>
  res.status(403).json({
    success: false,
    code: 'IMPERSONATION_LIMIT',
    error: 'Not available while signed in as another user',
    ...(lock?.fields ? { fields: lock.fields } : {}),
  });

/** Explicit guard (after requireAuth) for routers whose changes a "sign in as" session may not make; reads pass. */
export function refuseImpersonation(req, res, next) {
  if (req.auth?.imp && !isReadMethod(req.method)) return impersonationRefusal(res);
  return next();
}

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
    if (req.auth?.imp) {
      const lock = impersonationLock(req.method, req.originalUrl, req.body, user);
      if (lock) return impersonationRefusal(res, lock);
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
