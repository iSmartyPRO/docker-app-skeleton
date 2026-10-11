import { query } from '../../config/database.js';
import { seal, unseal } from '../../services/crypto.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError } from '../shared/acl.js';
import { gateCall } from './gate.js';

/*
 * Which account opens a file server for a person:
 *   1. credentials the person saved for that server ("Connect as…");
 *   2. their Active Directory sign-in (server.auth = 'user', use_login), kept
 *      sealed from the last directory sign-in;
 *   3. the server's service account (server.auth = 'service').
 *
 * A credential the server rejects is parked (status != 'ok') and not tried
 * again until it is replaced: retrying a stale password would lock the
 * person's AD account.
 */

const FAILURES = new Set(['AUTH_FAILED', 'ACCOUNT_DISABLED', 'ACCOUNT_LOCKED', 'PASSWORD_EXPIRED', 'ACCOUNT_RESTRICTED']);

export async function driveSettings() {
  const parsed = parseSettings(await getSettings());
  return { enabled: Boolean(parsed.modules.drive?.enabled), ...parsed.modules.drive.settings };
}

/** "DC=corp,DC=example,DC=com" → "corp.example.com" (the default NTLM domain). */
export async function directoryDomain() {
  const ad = parseSettings(await getSettings()).integrations.activeDirectory || {};
  const parts = [...String(ad.baseDn || '').matchAll(/DC=([^,]+)/gi)].map((match) => match[1].trim());
  return parts.length ? parts.join('.') : '';
}

export function serverParams(server) {
  return { host: server.host, port: server.port || 445, encrypt: Boolean(server.encrypt) };
}

/** Called after every successful Active Directory sign-in. */
export async function rememberLoginCredential({ user, profile, password }) {
  if (!user?.id || !password) return;
  const settings = await driveSettings();
  if (!settings.enabled || !settings.rememberLogin) return;
  await query(
    `INSERT INTO drive_credentials (user_id, server_id, username, domain, secret, source, status, verified_at, updated_at)
     VALUES ($1, NULL, $2, NULL, $3, 'login', 'ok', NOW(), NOW())
     ON CONFLICT (user_id, COALESCE(server_id, 0))
     DO UPDATE SET username = EXCLUDED.username, secret = EXCLUDED.secret, status = 'ok', verified_at = NOW(), updated_at = NOW()`,
    [user.id, String(profile?.username || user.username).slice(0, 255), seal(password)]
  );
}

/** Hourly: drop secrets of people who can no longer sign in, and login secrets when the feature is off. */
export async function cleanupCredentials() {
  await query(
    `DELETE FROM drive_credentials c USING users u
     WHERE u.id = c.user_id AND (u.is_active = FALSE OR u.is_blocked = TRUE)`
  );
  const settings = await driveSettings();
  if (!settings.enabled || !settings.rememberLogin) {
    await query(`DELETE FROM drive_credentials WHERE server_id IS NULL AND source = 'login'`);
  }
}

async function rowsFor(userId, serverId) {
  const { rows } = await query(
    `SELECT * FROM drive_credentials WHERE user_id = $1 AND (server_id = $2 OR server_id IS NULL)`,
    [userId, serverId]
  );
  return { manual: rows.find((row) => row.server_id === serverId) || null, login: rows.find((row) => row.server_id === null) || null };
}

function credentialError(server, reason, code = 'CREDENTIALS_REQUIRED') {
  // 403, not 401: a missing or rejected file-server login is not a portal
  // session problem, and the browser treats 401 as "signed out".
  const error = httpError(403, code === 'CREDENTIALS_REQUIRED' ? 'Sign in to the file server' : 'The file server rejected the saved credentials', code);
  error.details = { serverId: server.id, serverName: server.name, reason };
  return error;
}

/**
 * The credential to use for `userId` on `server`, as
 * `{ cred: { username, domain, password }, row, source }`.
 * Throws 403 CREDENTIALS_REQUIRED / CREDENTIALS_FAILED otherwise.
 */
export async function credentialFor(userId, server, { settings } = {}) {
  const config = settings || (await driveSettings());
  const { manual, login } = await rowsFor(userId, server.id);
  const domainDefault = server.domain || (await directoryDomain());

  for (const row of [manual, server.auth === 'user' && server.use_login && config.rememberLogin ? login : null]) {
    if (!row) continue;
    if (row.status !== 'ok') {
      // A parked manual credential blocks the login fallback too: the person decides.
      throw credentialError(server, row.status, 'CREDENTIALS_FAILED');
    }
    const password = unseal(row.secret);
    if (!password) continue;
    return {
      cred: { username: row.username, domain: row.server_id ? row.domain ?? domainDefault : domainDefault, password },
      row,
      source: row.source,
    };
  }

  if (server.auth === 'service' && server.service_user) {
    const password = unseal(server.service_secret);
    if (password) {
      return { cred: { username: server.service_user, domain: domainDefault, password }, row: null, source: 'service' };
    }
  }
  throw credentialError(server, manual || login ? 'unusable' : 'missing');
}

/** After the server refused a credential: park it so it is not retried. */
export async function parkCredential(resolved, code) {
  if (!FAILURES.has(code)) return false;
  if (!resolved.row) return true;
  await query(`UPDATE drive_credentials SET status = $2, updated_at = NOW() WHERE id = $1`, [resolved.row.id, code]);
  return true;
}

export const isAuthFailure = (code) => FAILURES.has(code);

/** Saves (after checking with the server) credentials a person entered for a server. */
export async function saveCredential(userId, server, input = {}) {
  const username = String(input.username || '').trim().slice(0, 255);
  const password = String(input.password || '');
  let domain = input.domain === undefined ? null : String(input.domain || '').trim().slice(0, 120) || null;
  if (!username || !password) throw httpError(400, 'Enter the user name and password', 'CREDENTIALS_EMPTY');
  if (/[\\@]/.test(username)) domain = null;
  try {
    await gateCall('auth', { server: serverParams(server), cred: { username, domain: domain ?? (server.domain || (await directoryDomain())), password } });
  } catch (err) {
    if (isAuthFailure(err.code)) {
      const error = httpError(400, 'The file server did not accept these credentials', err.code);
      throw error;
    }
    throw err;
  }
  await query(
    `INSERT INTO drive_credentials (user_id, server_id, username, domain, secret, source, status, verified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'manual', 'ok', NOW(), NOW())
     ON CONFLICT (user_id, COALESCE(server_id, 0))
     DO UPDATE SET username = EXCLUDED.username, domain = EXCLUDED.domain, secret = EXCLUDED.secret,
                   source = 'manual', status = 'ok', verified_at = NOW(), updated_at = NOW()`,
    [userId, server.id, username, domain, seal(password)]
  );
}

export async function forgetCredential(userId, serverId) {
  await query(`DELETE FROM drive_credentials WHERE user_id = $1 AND server_id = $2`, [userId, serverId]);
}

/** What the person sees under "Connections": how each server is opened for them. */
export async function connectionStatus(userId, servers) {
  const settings = await driveSettings();
  const { rows } = await query(`SELECT * FROM drive_credentials WHERE user_id = $1`, [userId]);
  const login = rows.find((row) => row.server_id === null);
  return servers.map((server) => {
    const manual = rows.find((row) => row.server_id === server.id);
    const useLogin = server.auth === 'user' && server.use_login && settings.rememberLogin;
    let state;
    if (manual) state = { source: 'manual', username: manual.username, domain: manual.domain, status: manual.status, since: manual.verified_at };
    else if (useLogin && login) state = { source: 'login', username: login.username, status: login.status, since: login.verified_at };
    else if (server.auth === 'service') state = { source: 'service', status: 'ok' };
    else state = { source: null, status: 'missing' };
    return { serverId: server.id, serverName: server.name, host: server.host, auth: server.auth, useLogin, ...state };
  });
}
