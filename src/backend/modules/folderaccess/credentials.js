import { query } from '../../config/database.js';
import { seal, unseal } from '../../services/crypto.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError } from '../shared/acl.js';
import { findAccount, otherAccountError, verifyBind } from './directory.js';

/*
 * Whose account makes a change: always the acting administrator's own AD
 * account, never the portal service account.
 *
 *   1. The portal account must be linked to AD (users.auth_source = 'ldap',
 *      external_id = the DN). Not linked → the section is read-only.
 *   2. The password is the person's domain password the File server module
 *      keeps (drive_credentials, server_id NULL): remembered at AD sign-in,
 *      set by a superadministrator, or entered here. It is sealed
 *      (services/crypto.js), never shown and never logged.
 *   3. Missing, unreadable or parked (rejected earlier) → the person is asked
 *      for the password; it is checked with a bind before it is saved.
 *
 * A password AD rejects is parked (status != 'ok') so it is not tried again:
 * retrying a stale password would lock the account. The File server module
 * honours the same status.
 *
 * Which AD account binds: the DN is looked up fresh with the service account
 * (by users.directory_guid, else the stored DN), so a person moved to another OU
 * or who signs in another way (code, Google) still binds as themselves. The
 * saved password's user name must name that same account; a password saved for
 * another account is never used here (the person is asked for their own).
 * When the account cannot be found by the service account but its objectGUID is
 * known, the bind uses the saved user name (UPN or DOMAIN\login) and the account
 * is then checked by its objectGUID with the person's own connection.
 */

// A password entered in Folder access. The File server uses it like the
// remembered sign-in password; its hourly clean-up (which removes 'login'
// rows when remembering is off) leaves it, since the person saved it on purpose.
export const SOURCE = 'self';

/**
 * Pure: what the section can do for this person.
 * `user` = users row (auth_source, external_id), `row` = drive_credentials row or null.
 * → { state: 'not_linked' | 'missing' | 'failed' | 'unreadable' | 'ok', dn, password?, row }
 */
export function resolveCredential(user, row, open = unseal) {
  if (!user || user.auth_source !== 'ldap' || !user.external_id) return { state: 'not_linked', dn: null, row: null };
  const dn = user.external_id;
  if (!row) return { state: 'missing', dn, row: null };
  if (row.status !== 'ok') return { state: 'failed', dn, row, reason: row.status };
  const password = open(row.secret);
  if (!password) return { state: 'unreadable', dn, row };
  return { state: 'ok', dn, password, row };
}

/** Pure: the error for a credential that cannot be used (null when it can). */
export function credentialProblem(resolved) {
  switch (resolved.state) {
    case 'ok':
      return null;
    case 'not_linked':
      return httpError(403, 'Your portal account is not linked to an Active Directory account', 'FA_NOT_LINKED');
    case 'failed': {
      const error = httpError(403, 'Active Directory rejected your saved password. Enter it again', 'FA_CREDENTIALS_FAILED');
      error.details = { reason: resolved.reason };
      return error;
    }
    default:
      return httpError(403, 'Enter your domain password to make changes', 'FA_CREDENTIALS_REQUIRED');
  }
}

async function loadRows(userId) {
  const user = (await query(`SELECT id, username, auth_source, external_id, directory_guid FROM users WHERE id = $1`, [userId])).rows[0] || null;
  const row = (await query(`SELECT id, username, secret, source, status, verified_at FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [userId])).rows[0] || null;
  return { user, row };
}

/** For the status endpoint: { state, dn, login, since } (never the password). */
export async function credentialStatus(userId) {
  const { user, row } = await loadRows(userId);
  const resolved = resolveCredential(user, row);
  return { state: resolved.state, dn: resolved.dn, login: row?.username || null, since: row?.verified_at || null, reason: resolved.reason || null };
}

async function directoryConfig() {
  const cfg = parseSettings(await getSettings()).integrations.activeDirectory;
  if (!cfg?.enabled || !cfg.host || !cfg.baseDn) throw httpError(400, 'Active Directory is not set up (Settings → Integrations)', 'FA_AD_OFF');
  return cfg;
}

/** "OU=Accounts,DC=corp,DC=kg" → "corp.kg". */
export const dnsDomain = (baseDn) => [...String(baseDn || '').matchAll(/DC=([^,]+)/gi)].map((match) => match[1].trim()).join('.');

const accountNotFound = () =>
  httpError(403, 'Your Active Directory account was not found. Sign in with your domain account once, or ask an administrator to link it again', 'FA_ACCOUNT_NOT_FOUND');

/**
 * Pure: does the saved user name (login, DOMAIN\login or UPN) name `account` ({ login, upn })?
 * Single-domain portal: the NetBIOS part of DOMAIN\login is not compared.
 */
export function loginMatches(stored, account, domain = '') {
  const name = String(stored || '').trim().toLowerCase();
  if (!name || !account) return false;
  const sam = String(account.login || '').toLowerCase();
  const upn = String(account.upn || '').toLowerCase();
  if (name.includes('\\')) return Boolean(sam) && name.slice(name.lastIndexOf('\\') + 1) === sam;
  if (name.includes('@')) {
    if (upn && name === upn) return true;
    const at = name.lastIndexOf('@');
    return Boolean(sam) && name.slice(0, at) === sam && name.slice(at + 1) === String(domain || '').toLowerCase();
  }
  return Boolean(sam) && name === sam;
}

/** Pure: the bind name for a saved user name: UPN / DOMAIN\login as is, a bare login as login@domain. */
export function bindNameFor(stored, domain = '') {
  const name = String(stored || '').trim();
  if (!name || /[\\@]/.test(name) || !domain) return name;
  return `${name}@${domain}`;
}

/**
 * Who binds for `user` with the saved credential `row`:
 * { dn, bindName, dnKnown, account (for the journal), expectGuid }.
 * Throws FA_CREDENTIALS_REQUIRED (reason OTHER_ACCOUNT) or FA_ACCOUNT_NOT_FOUND.
 */
export async function resolveIdentity(cfg, user, row, { lookup = findAccount } = {}) {
  const domain = dnsDomain(cfg.baseDn);
  const account = await lookup(cfg, { guid: user.directory_guid || null, dn: user.external_id || null });
  if (account) {
    if (!loginMatches(row?.username, account, domain)) throw otherAccountError();
    return { dn: account.dn, bindName: account.dn, dnKnown: true, account: account.login || account.upn || account.dn, expectGuid: null };
  }
  // Not found by the service account: without the objectGUID the account cannot be checked.
  if (!user.directory_guid) throw accountNotFound();
  const bindName = bindNameFor(row?.username, domain);
  return { dn: null, bindName, dnKnown: false, account: bindName, expectGuid: String(user.directory_guid).toLowerCase() };
}

/**
 * { dn, bindName, dnKnown, account, expectGuid, password, row, login } for writes, or throws
 * FA_NOT_LINKED / FA_CREDENTIALS_REQUIRED / FA_CREDENTIALS_FAILED / FA_ACCOUNT_NOT_FOUND.
 * `login` is the saved user name (the File server signs in with it); `account` is who binds to AD.
 */
export async function actorCredential(userId, { cfg, lookup } = {}) {
  const { user, row } = await loadRows(userId);
  const resolved = resolveCredential(user, row);
  const problem = credentialProblem(resolved);
  if (problem) throw problem;
  const identity = await resolveIdentity(cfg || (await directoryConfig()), user, row, lookup ? { lookup } : {});
  return { ...identity, password: resolved.password, row: resolved.row, login: row.username };
}

/** "Sign in as" session? (the request is made by another person on this account's behalf) */
export const isImpersonation = (req) => Boolean(req?.auth?.imp || req?.impersonator);

/**
 * After AD refused the saved password: park it (the File server stops using it too).
 * `impersonating`: the request is a "sign in as" session — the password belongs to the
 * impersonated person, who did not type anything wrong: never parked then.
 * Returns whether the credential was parked.
 */
export async function parkCredential(credential, reason = 'AUTH_FAILED', { impersonating = false, run = query } = {}) {
  if (impersonating || !credential?.row?.id) return false;
  await run(`UPDATE drive_credentials SET status = $2, updated_at = NOW() WHERE id = $1`, [credential.row.id, String(reason).slice(0, 24)]);
  return true;
}

/**
 * Checks the password with a bind as the person's own account (DN looked up fresh)
 * and saves it under that account's login (replacing a user name saved for another account).
 * Throws FA_NOT_LINKED, FA_ACCOUNT_NOT_FOUND, FA_PASSWORD_WRONG (400, with the reason) or a directory error.
 */
export async function savePassword(cfg, userId, password, { lookup = findAccount } = {}) {
  const secret = String(password || '');
  if (!secret || secret.length > 256) throw httpError(400, 'Enter your domain password', 'FA_PASSWORD_EMPTY');
  const { user, row } = await loadRows(userId);
  const resolved = resolveCredential(user, row);
  if (resolved.state === 'not_linked') throw credentialProblem(resolved);
  const account = await lookup(cfg, { guid: user.directory_guid || null, dn: user.external_id });
  if (!account) throw accountNotFound();
  const check = await verifyBind(cfg, account.dn, secret);
  if (!check.ok) {
    const error = httpError(400, 'Active Directory did not accept this password', 'FA_PASSWORD_WRONG');
    error.details = { reason: check.reason };
    throw error;
  }
  const login = account.login || account.upn || user.username;
  // A password set by a superadministrator keeps its origin (the File server treats it differently).
  await query(
    `INSERT INTO drive_credentials (user_id, server_id, username, domain, secret, source, status, verified_at, updated_at)
     VALUES ($1, NULL, $2, NULL, $3, $4, 'ok', NOW(), NOW())
     ON CONFLICT (user_id, COALESCE(server_id, 0))
     DO UPDATE SET username = EXCLUDED.username, secret = EXCLUDED.secret,
                   source = CASE WHEN drive_credentials.source = 'admin' THEN 'admin' ELSE EXCLUDED.source END,
                   status = 'ok', verified_at = NOW(), updated_at = NOW()`,
    [userId, String(login).slice(0, 255), seal(secret), SOURCE]
  );
  return { login };
}
