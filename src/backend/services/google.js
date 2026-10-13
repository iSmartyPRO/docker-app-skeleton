import { createHash, createPublicKey, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/app.js';
import { query } from '../config/database.js';
import { openSealed, seal, unseal } from './crypto.js';
import { authAvailability, getSettings, parseSettings, setGoogleSender } from './settings.js';

/*
 * Google integration (OAuth 2.0 / OpenID Connect, no SDK).
 *
 *  - Sign-in:  identity scopes only; finds the user by Google `sub`, then by a
 *              verified email; optional auto-provisioning; domain allow-list.
 *  - Connect:  a signed-in user links Google and grants Calendar access
 *              (offline; the refresh token is sealed with AES-256-GCM).
 *  - Gmail:    an administrator connects the sender account (gmail.send) used
 *              for notification and sign-in emails instead of SMTP.
 *
 * One callback for everything: {PUBLIC_URL}/api/auth/google/callback.
 * The flow is bound to the browser by a signed, httpOnly state cookie with a
 * nonce and a PKCE verifier.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

export const SCOPES = {
  identity: ['openid', 'email', 'profile'],
  calendar: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  ],
  gmail: ['https://www.googleapis.com/auth/gmail.send'],
};

export const STATE_COOKIE = 'da_google';
const STATE_TTL_SECONDS = 600;

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function publicBase() {
  return String(process.env.PUBLIC_URL || config.frontend.url || '').replace(/\/+$/, '');
}

export function redirectUri() {
  return `${publicBase()}/api/auth/google/callback`;
}

export async function googleConfig() {
  const parsed = parseSettings(await getSettings());
  return { parsed, cfg: parsed.integrations.google, ready: authAvailability(parsed).ready, auth: parsed.auth };
}

export async function ensureGoogleTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS google_accounts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      sub TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      picture TEXT,
      refresh_token TEXT,
      scopes TEXT NOT NULL DEFAULT '',
      calendars JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ── Authorization request ───────────────────────────────────────────────────

function stateSecret() {
  return `${config.auth.jwtSecret || 'dev-secret'}:google-state`;
}

export function allowedDomains(cfg) {
  return String(cfg.allowedDomains || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

function safeReturnTo(value, fallback) {
  const path = String(value || '');
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path.slice(0, 300) : fallback;
}

/**
 * Builds the Google consent URL and the state cookie for one flow.
 * purpose: 'signin' | 'connect' | 'gmail'.
 */
export async function beginAuthorization({ purpose, userId = null, returnTo, loginHint }) {
  const { cfg, ready, auth } = await googleConfig();
  if (!ready.google) throw httpError(400, 'Google integration is not configured', 'GOOGLE_DISABLED');
  if (purpose === 'signin' && !auth.google?.enabled) throw httpError(400, 'Google sign-in is disabled', 'METHOD_DISABLED');
  if ((purpose === 'connect' || purpose === 'gmail') && !userId) throw httpError(401, 'Sign in first', 'AUTH_REQUIRED');

  const scopes = [...SCOPES.identity];
  if (purpose === 'connect' && cfg.calendar) scopes.push(...SCOPES.calendar);
  if (purpose === 'gmail') scopes.push(...SCOPES.gmail);
  const offline = purpose !== 'signin';

  const nonce = randomBytes(16).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const domains = allowedDomains(cfg);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: scopes.join(' '),
    state: nonce,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    include_granted_scopes: 'true',
    prompt: offline ? 'consent' : 'select_account',
  });
  if (offline) params.set('access_type', 'offline');
  if (domains.length === 1) params.set('hd', domains[0]);
  if (loginHint) params.set('login_hint', String(loginHint).slice(0, 200));

  const fallback = { signin: '/', connect: '/account/connections', gmail: '/admin/settings/google' }[purpose] || '/';
  const state = jwt.sign(
    { n: nonce, p: purpose, u: userId, v: verifier, r: safeReturnTo(returnTo, fallback) },
    stateSecret(),
    { expiresIn: STATE_TTL_SECONDS }
  );
  return { url: `${AUTH_URL}?${params}`, state };
}

export function readState(cookieValue, nonce) {
  let state;
  try {
    state = jwt.verify(String(cookieValue || ''), stateSecret());
  } catch {
    throw httpError(400, 'The Google sign-in session has expired. Try again.', 'GOOGLE_STATE');
  }
  if (!nonce || state.n !== nonce) throw httpError(400, 'Google sign-in state mismatch. Try again.', 'GOOGLE_STATE');
  return state;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = httpError(
      res.status === 400 || res.status === 401 ? 400 : 502,
      data.error_description || data.error || `Google token endpoint returned HTTP ${res.status}`,
      data.error === 'invalid_grant' ? 'GOOGLE_REVOKED' : 'GOOGLE_TOKEN'
    );
    error.googleError = data.error;
    throw error;
  }
  return data;
}

export async function exchangeCode(code, verifier) {
  const { cfg } = await googleConfig();
  return tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
}

let jwksCache = { keys: null, until: 0 };

async function googleKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw httpError(502, 'Could not load Google signing keys');
  const data = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
  jwksCache = { keys: data.keys || [], until: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

/** Verifies the ID token signature (Google JWKS), issuer, audience, expiry and nonce. */
export async function verifyIdToken(idToken, { clientId, nonce }) {
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw httpError(400, 'Invalid Google ID token', 'GOOGLE_TOKEN');
  let jwk = (await googleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) {
    jwksCache.until = 0;
    jwk = (await googleKeys()).find((key) => key.kid === header.kid);
  }
  if (!jwk) throw httpError(400, 'Unknown Google signing key', 'GOOGLE_TOKEN');
  let claims;
  try {
    claims = jwt.verify(idToken, createPublicKey({ key: jwk, format: 'jwk' }), {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      clockTolerance: 60,
    });
  } catch (err) {
    throw httpError(400, `Google ID token rejected: ${err.message}`, 'GOOGLE_TOKEN');
  }
  if (nonce && claims.nonce !== nonce) throw httpError(400, 'Google ID token nonce mismatch', 'GOOGLE_TOKEN');
  return claims;
}

/** Workspace domain (`hd`) or the email domain must be on the allow-list, when there is one. */
export function domainAllowed(claims, domains) {
  if (!domains.length) return true;
  const emailDomain = String(claims.email || '').split('@')[1]?.toLowerCase();
  const hosted = String(claims.hd || '').toLowerCase();
  return domains.includes(hosted) || domains.includes(emailDomain);
}

const accessCache = new Map();

/*
 * `onRevoked` runs only when Google says the grant is gone (invalid_grant) or
 * nothing is stored. A token that cannot be decrypted (the encryption key
 * changed) is not a revocation: it is kept, administrators are told
 * (security event), and restoring the old key brings it back. `onReseal`
 * receives the token sealed with the current key when it was opened with an
 * older one.
 */
async function accessTokenFor(cacheKey, sealedRefresh, onRevoked, { label = 'Google token', onReseal } = {}) {
  const cached = accessCache.get(cacheKey);
  if (cached && cached.until > Date.now() + 30_000) return cached.token;
  const opened = openSealed(sealedRefresh, { label });
  if (opened.failed) {
    throw httpError(409, 'The stored Google token cannot be decrypted (the encryption key changed). Restore the previous key or connect Google again.', 'GOOGLE_KEY');
  }
  const refreshToken = opened.value;
  if (!refreshToken) {
    await onRevoked?.();
    throw httpError(409, 'Google access is not connected', 'GOOGLE_NOT_CONNECTED');
  }
  if (opened.stale && onReseal) await Promise.resolve(onReseal(seal(refreshToken))).catch(() => {});
  const { cfg } = await googleConfig();
  try {
    const data = await tokenRequest({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    accessCache.set(cacheKey, { token: data.access_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
    return data.access_token;
  } catch (err) {
    if (err.googleError === 'invalid_grant') {
      await onRevoked?.();
      throw httpError(409, 'Google access was revoked. Connect Google again.', 'GOOGLE_REVOKED');
    }
    throw err;
  }
}

async function googleApi(token, url, { method = 'GET', body, params } = {}) {
  const target = params ? `${url}?${new URLSearchParams(params)}` : url;
  const res = await fetch(target, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Google API returned HTTP ${res.status}`;
    throw httpError(res.status === 404 ? 404 : res.status === 403 ? 403 : 502, message, 'GOOGLE_API');
  }
  return data;
}

// ── Linked accounts ─────────────────────────────────────────────────────────

export async function findGoogleAccountBySub(sub) {
  const { rows } = await query(`SELECT * FROM google_accounts WHERE sub = $1`, [String(sub)]);
  return rows[0] || null;
}

export async function getGoogleAccount(userId) {
  const { rows } = await query(`SELECT * FROM google_accounts WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}

/**
 * Links (or refreshes) a Google identity for a user. Keeps the old refresh
 * token if none came back.
 *
 * `signIn: true` (a plain Google sign-in, no tokens): only refreshes the
 * profile of the account already linked with this `sub`. A user whose
 * Calendar is connected to another Google account keeps that connection —
 * signing in with a second Google account must not swap or reset it — and a
 * revoked connection stays revoked until the person connects again.
 */
export async function saveGoogleAccount(userId, claims, tokens = {}, { signIn = false } = {}) {
  const other = await findGoogleAccountBySub(claims.sub);
  if (other && other.user_id !== userId) {
    throw httpError(409, 'This Google account is already linked to another user', 'GOOGLE_TAKEN');
  }
  if (signIn && !tokens.refresh_token) {
    const current = await getGoogleAccount(userId);
    if (current && current.sub !== String(claims.sub)) return;
  }
  await query(
    `INSERT INTO google_accounts (user_id, sub, email, name, picture, refresh_token, scopes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     ON CONFLICT (user_id) DO UPDATE SET
       sub = EXCLUDED.sub, email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture,
       -- Another Google account: the old account's token and calendars must not carry over.
       refresh_token = CASE WHEN google_accounts.sub <> EXCLUDED.sub THEN EXCLUDED.refresh_token
                            ELSE COALESCE(EXCLUDED.refresh_token, google_accounts.refresh_token) END,
       scopes = CASE WHEN google_accounts.sub <> EXCLUDED.sub OR EXCLUDED.scopes <> '' THEN EXCLUDED.scopes
                     ELSE google_accounts.scopes END,
       calendars = CASE WHEN google_accounts.sub <> EXCLUDED.sub THEN '[]'::jsonb ELSE google_accounts.calendars END,
       -- Only a new grant (or another account) clears "revoked"; a sign-in does not.
       status = CASE WHEN google_accounts.sub <> EXCLUDED.sub OR EXCLUDED.refresh_token IS NOT NULL THEN 'active'
                     ELSE google_accounts.status END,
       updated_at = NOW()`,
    [
      userId,
      String(claims.sub),
      claims.email || null,
      claims.name || null,
      claims.picture || null,
      tokens.refresh_token ? seal(tokens.refresh_token) : null,
      tokens.refresh_token ? String(tokens.scope || '') : '',
    ]
  );
  accessCache.delete(`u:${userId}`);
}

export async function googleStatus(userId) {
  const { cfg, ready } = await googleConfig();
  const account = await getGoogleAccount(userId);
  const scopes = String(account?.scopes || '').split(' ');
  return {
    available: ready.google,
    calendarFeature: Boolean(ready.google && cfg.calendar),
    connected: Boolean(account),
    email: account?.email || null,
    name: account?.name || null,
    picture: account?.picture || null,
    calendar: Boolean(account?.refresh_token && account.status === 'active' && SCOPES.calendar.every((scope) => scopes.includes(scope))),
    revoked: account?.status === 'revoked',
    calendars: account?.calendars || [],
    connectedAt: account?.connected_at || null,
  };
}

export async function disconnectGoogle(userId) {
  const account = await getGoogleAccount(userId);
  if (!account) return;
  const token = unseal(account.refresh_token);
  if (token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
  accessCache.delete(`u:${userId}`);
  await query(`DELETE FROM google_accounts WHERE user_id = $1`, [userId]);
}

async function userAccessToken(userId) {
  const account = await getGoogleAccount(userId);
  if (!account || !account.refresh_token) throw httpError(409, 'Google Calendar is not connected', 'GOOGLE_NOT_CONNECTED');
  return accessTokenFor(
    `u:${userId}`,
    account.refresh_token,
    () => query(`UPDATE google_accounts SET status = 'revoked', updated_at = NOW() WHERE user_id = $1`, [userId]),
    {
      label: 'Google Calendar token',
      onReseal: (resealed) =>
        query(`UPDATE google_accounts SET refresh_token = $2 WHERE user_id = $1 AND refresh_token = $3`, [userId, resealed, account.refresh_token]),
    }
  );
}

// ── Google Calendar ─────────────────────────────────────────────────────────

export async function listGoogleCalendars(userId) {
  const token = await userAccessToken(userId);
  const data = await googleApi(token, `${CALENDAR_API}/users/me/calendarList`, { params: { minAccessRole: 'reader', maxResults: '250' } });
  return (data.items || []).map((item) => ({
    id: item.id,
    name: item.summaryOverride || item.summary,
    color: item.backgroundColor || '#4285F4',
    primary: Boolean(item.primary),
    writable: item.accessRole === 'owner' || item.accessRole === 'writer',
  }));
}

export async function setGoogleCalendarSelection(userId, ids) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).slice(0, 300)))].slice(0, 30);
  await query(`UPDATE google_accounts SET calendars = $2, updated_at = NOW() WHERE user_id = $1`, [userId, JSON.stringify(clean)]);
  return clean;
}

export async function listGoogleEvents(userId, calendarId, { timeMin, timeMax }) {
  const token = await userAccessToken(userId);
  const items = [];
  let pageToken;
  do {
    const data = await googleApi(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      params: {
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '1000',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken && items.length < 3000);
  return items.filter((item) => item.status !== 'cancelled');
}

export async function createGoogleEvent(userId, calendarId, body) {
  const token = await userAccessToken(userId);
  return googleApi(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body });
}

export async function updateGoogleEvent(userId, calendarId, eventId, body) {
  const token = await userAccessToken(userId);
  return googleApi(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body,
  });
}

export async function deleteGoogleEvent(userId, calendarId, eventId) {
  const token = await userAccessToken(userId);
  await googleApi(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

// ── Gmail sender ────────────────────────────────────────────────────────────

export async function connectGmailSender(claims, tokens) {
  if (!tokens.refresh_token) throw httpError(400, 'Google did not return offline access. Try again.', 'GOOGLE_TOKEN');
  if (!String(tokens.scope || '').includes(SCOPES.gmail[0])) {
    throw httpError(400, 'Permission to send email was not granted', 'GOOGLE_SCOPE');
  }
  accessCache.delete('gmail');
  await setGoogleSender({ email: claims.email, sealedToken: seal(tokens.refresh_token) });
}

export async function disconnectGmailSender() {
  const { cfg } = await googleConfig();
  const token = unseal(cfg.gmailToken);
  if (token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
  accessCache.delete('gmail');
  await setGoogleSender({});
}

const encodeWord = (text) => `=?UTF-8?B?${Buffer.from(String(text), 'utf8').toString('base64')}?=`;

function wrap76(base64) {
  return base64.replace(/.{1,76}/g, (line) => `${line}\r\n`);
}

/** RFC 5322 message, text + optional HTML alternative, everything UTF-8 / base64. */
export function buildMime({ from, fromName, to, subject, text, html }) {
  const boundary = `b_${randomBytes(12).toString('hex')}`;
  const sender = fromName ? `${encodeWord(fromName)} <${from}>` : from;
  const headers = [
    `From: ${sender}`,
    `To: ${to}`,
    `Subject: ${encodeWord(subject)}`,
    'MIME-Version: 1.0',
  ];
  const textPart = wrap76(Buffer.from(String(text || ''), 'utf8').toString('base64'));
  if (!html) {
    return [...headers, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', textPart].join('\r\n');
  }
  const htmlPart = wrap76(Buffer.from(String(html), 'utf8').toString('base64'));
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    textPart,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlPart,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

const gmailTokenOptions = (cfg) => ({
  label: 'Gmail sender token',
  onReseal: (resealed) => setGoogleSender({ email: cfg.gmailSender, sealedToken: resealed }),
});

export async function sendGmail({ to, subject, text, html, fromName }) {
  const { cfg, ready } = await googleConfig();
  if (!ready.gmail) throw httpError(400, 'Gmail sending is not connected');
  const token = await accessTokenFor('gmail', cfg.gmailToken, () => setGoogleSender({}), gmailTokenOptions(cfg));
  const raw = Buffer.from(buildMime({ from: cfg.gmailSender, fromName, to, subject, text, html }), 'utf8').toString('base64url');
  await googleApi(token, `${GMAIL_API}/users/me/messages/send`, { method: 'POST', body: { raw } });
}

/** Admin "Test connection": client credentials shape + discovery reachability; Gmail token if connected. */
export async function testGoogle(override = {}) {
  const { cfg } = await googleConfig();
  const clientId = String(override.clientId || cfg.clientId || '').trim();
  const clientSecret = override.clientSecret || cfg.clientSecret;
  if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw httpError(400, 'Client ID must end with .apps.googleusercontent.com');
  }
  if (!clientSecret) throw httpError(400, 'Client secret is required');
  // An invalid client is reported by the token endpoint as invalid_client;
  // a valid one with a bogus code answers invalid_grant.
  try {
    await tokenRequest({
      code: 'connection-test',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    });
  } catch (err) {
    if (err.googleError === 'invalid_client' || err.googleError === 'unauthorized_client') {
      throw httpError(400, 'Google rejected the client ID or secret');
    }
    if (err.googleError !== 'invalid_grant') throw err;
  }
  let gmail = '';
  if (cfg.gmailToken) {
    await accessTokenFor('gmail', cfg.gmailToken, () => setGoogleSender({}), gmailTokenOptions(cfg));
    gmail = `, Gmail sender ${cfg.gmailSender} is connected`;
  }
  return { ok: true, message: `Google accepted the OAuth client${gmail}. Redirect URI: ${redirectUri()}` };
}
