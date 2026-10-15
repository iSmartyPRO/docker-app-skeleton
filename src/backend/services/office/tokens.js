import { createHmac, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';

/*
 * WOPI access tokens: what the Collabora server presents on every call back
 * to the portal (?access_token=…). They are JWTs signed with a key derived
 * from JWT_SECRET for this purpose only, with their own audience and a
 * purpose claim, so a session cookie is never a WOPI token and a WOPI token
 * is never a session (verifyToken() of services/auth.js rejects it: wrong key).
 *
 * Claims: pur 'wopi' · fid the WOPI file id · sub user id · sid the portal
 * session it was issued from · tv the user's token version · perm 'edit' |
 * 'view' · o the browser origin (PostMessageOrigin) · e Drive entry id ·
 * jti random. Every call re-checks the session and the person's current
 * access to the file (services/office/wopi.js), so signing out, a password
 * change or a withdrawn share ends editing at once.
 */

export const PURPOSE = 'wopi';
const AUDIENCE = 'portal-wopi';
const ISSUER = 'portal';

function key() {
  if (!config.auth.jwtSecret) {
    const error = new Error('JWT_SECRET is not configured');
    error.statusCode = 500;
    throw error;
  }
  return createHmac('sha256', config.auth.jwtSecret).update('wopi-access-token/v1').digest();
}

/** → { token, expiresAt (ms since epoch, WOPI access_token_ttl) } */
export function signWopiToken({ fileId, userId, sessionId, tokenVersion = 0, permission, origin = '', entryId = null, hours = 10 }) {
  const ttlSeconds = Math.round(Math.min(24, Math.max(0.0003, Number(hours) || 10)) * 3600);
  const token = jwt.sign(
    {
      pur: PURPOSE,
      fid: String(fileId),
      sid: String(sessionId || ''),
      tv: Number(tokenVersion || 0),
      perm: permission === 'edit' ? 'edit' : 'view',
      ...(origin ? { o: String(origin) } : {}),
      ...(entryId ? { e: Number(entryId) } : {}),
      jti: randomBytes(9).toString('base64url'),
    },
    key(),
    { subject: String(userId), audience: AUDIENCE, issuer: ISSUER, expiresIn: ttlSeconds, algorithm: 'HS256' }
  );
  const { exp } = jwt.decode(token);
  return { token, expiresAt: exp * 1000 };
}

/** Verified claims, or throws (any problem → the caller answers 401). */
export function verifyWopiToken(token, fileId) {
  const claims = jwt.verify(String(token || ''), key(), { audience: AUDIENCE, issuer: ISSUER, algorithms: ['HS256'] });
  if (claims.pur !== PURPOSE) throw new Error('wrong purpose');
  if (fileId !== undefined && claims.fid !== String(fileId)) throw new Error('token is for another file');
  if (!['edit', 'view'].includes(claims.perm)) throw new Error('bad permission');
  return claims;
}

/** Hides access tokens in a URL (logs). */
export function maskToken(url) {
  return String(url || '').replace(/([?&](?:access_token|t)=)[^&#\s]*/gi, '$1***');
}
