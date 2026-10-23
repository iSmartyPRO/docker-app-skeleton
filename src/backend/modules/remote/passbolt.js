import * as openpgp from 'openpgp';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { seal, unseal } from '../../services/secrets.js';
import { httpError } from '../shared/acl.js';

/*
 * Passbolt integration (docs/specs/remote-access.ru.md «Passbolt»).
 *
 * Each person connects their own Passbolt with their OpenPGP private key.
 * Authentication is GPGAuth: the server encrypts a token to the person's public
 * key, the portal decrypts it with their (sealed) private key and passphrase and
 * posts it back for a session cookie. Secrets are then read and decrypted the
 * same way. The private key and passphrase never leave the server unsealed and
 * are never shown to the browser.
 */

const FETCH_TIMEOUT = 12000;

export async function passboltEnabled() {
  const parsed = parseSettings(await getSettings());
  return Boolean(parsed.modules?.remote?.settings?.passbolt);
}

function cleanUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw httpError(400, 'Passbolt URL must start with https://', 'PASSBOLT_URL');
  return url;
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

/** Opens the stored key for this person → { url, privateKey (decrypted), fingerprint }. */
async function openAccount(ctx) {
  const { rows } = await query(`SELECT * FROM remote_passbolt WHERE user_id = $1`, [ctx.userId]);
  const row = rows[0];
  if (!row) throw httpError(409, 'Connect your Passbolt first', 'PASSBOLT_NOT_SET');
  const armoredKey = unseal(row.private_key, { label: 'passbolt private key' });
  const passphrase = unseal(row.passphrase, { label: 'passbolt passphrase' }) || '';
  if (!armoredKey) throw httpError(409, 'Your Passbolt key could not be read', 'PASSBOLT_KEY');
  const privateKey = await decryptKey(armoredKey, passphrase);
  return { url: row.url, privateKey, fingerprint: row.fingerprint };
}

async function decryptKey(armoredKey, passphrase) {
  try {
    const key = await openpgp.readPrivateKey({ armoredKey });
    return passphrase ? await openpgp.decryptKey({ privateKey: key, passphrase }) : key;
  } catch {
    throw httpError(400, 'The private key or passphrase is not valid', 'PASSBOLT_KEY');
  }
}

/** GPGAuth login; returns the session cookie string for further GET requests. */
async function login(url, privateKey, fingerprint) {
  const body = (data) => JSON.stringify({ gpg_auth: data });
  const headers = { 'Content-Type': 'application/json' };

  // Stage 1: receive the encrypted user auth token in the response headers.
  const stage1 = await timedFetch(`${url}/auth/login.json?api-version=v2`, { method: 'POST', headers, body: body({ keyid: fingerprint }) });
  const encoded = stage1.headers.get('x-gpgauth-user-auth-token');
  if (stage1.headers.get('x-gpgauth-error')) throw httpError(502, stage1.headers.get('x-gpgauth-debug') || 'Passbolt rejected the key', 'PASSBOLT_AUTH');
  if (!encoded) throw httpError(502, 'Passbolt did not return an auth token (is the key registered?)', 'PASSBOLT_AUTH');

  // The header is URL-encoded with escaped spaces; restore the PGP message.
  const armoredMessage = decodeURIComponent(encoded).replace(/\\\+/g, ' ').replace(/\\n/g, '\n');
  const { data: token } = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage }), decryptionKeys: privateKey });

  // Stage 2: post the decrypted token back → authenticated session cookie.
  const stage2 = await timedFetch(`${url}/auth/login.json?api-version=v2`, { method: 'POST', headers, body: body({ keyid: fingerprint, user_token_result: token }) });
  if (stage2.headers.get('x-gpgauth-authenticated') !== 'true') throw httpError(502, 'Passbolt did not accept the token', 'PASSBOLT_AUTH');
  const cookie = (stage2.headers.get('set-cookie') || '').split(/,(?=[^;]+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
  if (!cookie) throw httpError(502, 'Passbolt returned no session', 'PASSBOLT_AUTH');
  return cookie;
}

async function authed(ctx) {
  const account = await openAccount(ctx);
  const cookie = await login(account.url, account.privateKey, account.fingerprint);
  return { ...account, cookie };
}

/* ── Public operations ─────────────────────────────────────────────────── */

export async function savePassbolt(ctx, input = {}) {
  if (!(await passboltEnabled())) throw httpError(409, 'Passbolt integration is off', 'PASSBOLT_OFF');
  const url = cleanUrl(input.url);
  const armoredKey = String(input.privateKey || '').trim();
  if (!/BEGIN PGP PRIVATE KEY/.test(armoredKey)) throw httpError(400, 'Paste your armored private key', 'PASSBOLT_KEY');
  const passphrase = String(input.passphrase || '');
  const privateKey = await decryptKey(armoredKey, passphrase);
  const fingerprint = privateKey.getFingerprint().toUpperCase();
  await query(
    `INSERT INTO remote_passbolt (user_id, url, fingerprint, private_key, passphrase, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (user_id) DO UPDATE SET url=$2, fingerprint=$3, private_key=$4, passphrase=$5, verified_at=NULL, updated_at=NOW()`,
    [ctx.userId, url, fingerprint, seal(armoredKey), seal(passphrase)]
  );
  return getPassbolt(ctx);
}

export async function getPassbolt(ctx) {
  const { rows } = await query(`SELECT url, fingerprint, verified_at FROM remote_passbolt WHERE user_id = $1`, [ctx.userId]);
  const row = rows[0];
  return { connected: Boolean(row), url: row?.url || '', fingerprint: row?.fingerprint || '', verifiedAt: row?.verified_at || null };
}

export async function deletePassbolt(ctx) {
  await query(`DELETE FROM remote_passbolt WHERE user_id = $1`, [ctx.userId]);
}

export async function testPassbolt(ctx) {
  await authed(ctx);
  await query(`UPDATE remote_passbolt SET verified_at = NOW() WHERE user_id = $1`, [ctx.userId]);
  return { ok: true };
}

/** Resources (password entries) this person has in Passbolt: id, name, username, uri. */
export async function listResources(ctx) {
  const account = await authed(ctx);
  const res = await timedFetch(`${account.url}/resources.json?api-version=v2`, { headers: { Cookie: account.cookie, Accept: 'application/json' } });
  if (!res.ok) throw httpError(502, 'Could not read Passbolt entries', 'PASSBOLT_READ');
  const json = await res.json();
  return (json.body || []).map((r) => ({ id: r.id, name: r.name, username: r.username || '', uri: r.uri || '' })).slice(0, 2000);
}

/** Resolves a Passbolt resource for a session → { username, domain, password }. */
export async function resolvePassbolt(ctx, resourceId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(resourceId || ''))) throw httpError(400, 'Bad Passbolt entry', 'PASSBOLT_RES');
  const account = await authed(ctx);
  const [meta, secret] = await Promise.all([
    timedFetch(`${account.url}/resources/${resourceId}.json?api-version=v2`, { headers: { Cookie: account.cookie, Accept: 'application/json' } }),
    timedFetch(`${account.url}/secrets/resource/${resourceId}.json?api-version=v2`, { headers: { Cookie: account.cookie, Accept: 'application/json' } }),
  ]);
  if (!secret.ok) throw httpError(502, 'Could not read the Passbolt secret', 'PASSBOLT_READ');
  const metaJson = meta.ok ? await meta.json() : { body: {} };
  const secretJson = await secret.json();
  const armoredMessage = secretJson.body?.data;
  if (!armoredMessage) throw httpError(502, 'Empty Passbolt secret', 'PASSBOLT_READ');
  const { data: plain } = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage }), decryptionKeys: account.privateKey });

  // Modern resources store JSON { password, description }; legacy ones a raw string.
  let password = plain;
  try {
    const parsed = JSON.parse(plain);
    if (parsed && typeof parsed === 'object' && 'password' in parsed) password = parsed.password;
  } catch {
    /* raw password string */
  }
  const rawUser = metaJson.body?.username || '';
  const [domain, user] = rawUser.includes('\\') ? rawUser.split('\\') : ['', rawUser];
  return { username: user || rawUser, domain, password: String(password || '') };
}
