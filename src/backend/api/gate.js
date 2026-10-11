import crypto from 'node:crypto';
import { getSessionUser, toPublicUser } from '../services/users.js';
import { localeFor } from '../services/settings.js';
import { apiConfig } from './config.js';
import { classify, decide, normalizePath } from './scopes.js';
import { authenticate, takeRate, tokenFromRequest, touchToken } from './tokens.js';
import { logRequest } from './log.js';

/*
 * Token requests.
 *
 *   /api/v1/<path>  is the stable address of every endpoint for integrations
 *                   (the same handlers as /api/<path>).
 *
 * A request carrying `Authorization: Bearer pat_…` (or `X-API-Key`) is
 * authenticated here, before the routes: the token must be valid, allowed from
 * this address, within its rate limit and its scopes; then the request runs as
 * the token's owner, exactly as if they were signed in, with the token's
 * resource limits attached (req.apiLimits). Session cookies are ignored on
 * such requests.
 */

/** Rewrites /api/v1/* to /api/*; mount before everything else. */
export function versionPrefix(req, res, next) {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/') || req.url.startsWith('/api/v1?')) {
    req.url = `/api${req.url.slice(7) || '/'}`;
    req.apiVersion = 1;
  }
  next();
}

function fail(res, status, code, error, extra = {}) {
  res.status(status).json({ success: false, code, error, ...extra });
}

export async function tokenGate(req, res, next) {
  const raw = tokenFromRequest(req);
  if (!raw) return next();
  const started = Date.now();
  const path = normalizePath(req.originalUrl);
  const where = classify(path);
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;
  let logged = { method: req.method, path, area: where.area || null, ip: req.ip, userAgent: req.headers['user-agent'] };
  res.on('finish', () => logRequest({ ...logged, status: res.statusCode, code: res.locals.apiCode, ms: Date.now() - started }));

  try {
    const config = await apiConfig();
    if (!config.enabled) {
      res.locals.apiCode = 'API_DISABLED';
      return fail(res, 503, 'API_DISABLED', 'The API is turned off by the administrator');
    }
    let auth;
    try {
      auth = await authenticate(raw, req.ip);
    } catch (err) {
      res.locals.apiCode = err.code;
      return fail(res, err.statusCode || 401, err.code || 'TOKEN_INVALID', err.message);
    }
    const { row, policy, limits } = auth;
    logged = { ...logged, tokenId: row.id, userId: row.user_id };

    touchToken(row, req.ip);
    const rate = takeRate(row.id, row.rate_limit || config.defaultRateLimit);
    res.setHeader('X-RateLimit-Limit', String(row.rate_limit || config.defaultRateLimit));
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.reset));
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.reset));
      res.locals.apiCode = 'RATE_LIMITED';
      return fail(res, 429, 'RATE_LIMITED', 'Too many requests for this token', { retryAfter: rate.reset });
    }

    const verdict = decide(policy, req.method, path);
    if (!verdict.ok) {
      res.locals.apiCode = verdict.code;
      return verdict.code === 'ROUTE_NOT_AVAILABLE'
        ? fail(res, 403, verdict.code, 'This endpoint is not available to API tokens')
        : fail(res, 403, verdict.code, verdict.scope ? `The token lacks the ${verdict.scope} scope` : 'A rule of the token denies this request', {
            scope: verdict.scope,
            rule: verdict.rule,
          });
    }

    const session = await getSessionUser(row.user_id);
    if (!session || session.row.is_active === false || session.row.is_blocked === true) {
      res.locals.apiCode = 'OWNER_INACTIVE';
      return fail(res, 403, 'OWNER_INACTIVE', 'The account of the token is disabled');
    }
    req.apiToken = { id: row.id, name: row.name, prefix: row.prefix, policy };
    req.apiLimits = limits;
    req.userRow = session.row;
    req.access = session.access;
    req.user = toPublicUser(session.row, session.access);
    req.locale = await localeFor(session.row);
    req.actor = { id: session.row.id, permissions: new Set(session.access.permissions) };
    // Cookies never mix with a token.
    req.cookies = {};
    return next();
  } catch (err) {
    return next(err);
  }
}
