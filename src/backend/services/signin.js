import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../config/app.js';
import { query, withTransaction } from '../config/database.js';
import { authAvailability, getSettings, localeFor, parseSettings } from './settings.js';
import { authenticateDirectory, mapDirectoryGroups } from './ldap.js';
import { emitDirectorySignIn } from './hooks.js';
import { sendEmail, sendMattermostDirect, sendTelegram, sendWhatsapp } from './integrations.js';
import { getUserAccess, hasLocalPassword, isDemoSeedAccount } from './rbac.js';
import { recordSecurityEvent } from './security.js';
import { allowedDomains, domainAllowed, findGoogleAccountBySub, saveGoogleAccount } from './google.js';
import {
  findUserByEmail,
  findUserByDirectoryGuid,
  findUserByExternalId,
  findUserById,
  findUserByPhone,
  findUserByTelegramId,
  findUserByMattermost,
  findUserByTelegramUsername,
  findUserByUsername,
  provisionExternalUser,
  refreshTelegramUsername,
  syncExternalProfile,
} from './users.js';
import { translator } from './i18n/index.js';

/*
 * Sign-in methods. Every function returns `{ user, method }` on success and
 * throws `authError()` otherwise, so the route can treat all methods alike
 * (lockouts, security events, identical error text).
 */

const DUMMY_HASH = bcrypt.hashSync('__dummy_not_a_password__', 12);
const CODE_TTL_MINUTES = 5;
const CODE_RESEND_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;

/** `code` lets the UI show a translated message. */
export function authError(eventKind = 'login_failed', message = 'Invalid username or password', code = 'INVALID_CREDENTIALS') {
  const error = new Error(message);
  error.statusCode = 401;
  error.eventKind = eventKind;
  error.code = code;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  // Safe to show: depends only on configuration, never on whether an account exists.
  error.expose = true;
  return error;
}

async function loadSettings() {
  const parsed = parseSettings(await getSettings());
  return { parsed, available: authAvailability(parsed) };
}

export async function ensureAuthTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel VARCHAR(16) NOT NULL,
      kind VARCHAR(8) NOT NULL DEFAULT 'code',
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'code'`);
  await query(`CREATE INDEX IF NOT EXISTS auth_codes_user_idx ON auth_codes (user_id, channel, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS auth_codes_hash_idx ON auth_codes (code_hash)`);
  // Requesting address, for the per-address send quota.
  await query(`ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS ip TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS auth_codes_ip_idx ON auth_codes (ip, created_at DESC)`);
}

function assertActive(user) {
  if (user.is_active === false) throw authError('account_disabled');
  if (user.is_blocked === true) throw authError('account_blocked');
}

async function isSuperadmin(userId) {
  const access = await getUserAccess(userId);
  return access.permissions.includes('*');
}

// ── Password (local, with Active Directory fallback) ───────────────────────

/**
 * Local accounts are checked with bcrypt. When the password method is turned
 * off, super administrators can still use it — a break-glass path so a broken
 * directory never locks everyone out. Directory accounts (and unknown logins,
 * if auto-provisioning is on) are checked against Active Directory.
 */
export async function signInWithPassword(username, password) {
  const { parsed, available } = await loadSettings();
  const login = String(username || '').trim();
  const user = await findUserByUsername(login);

  if (user && hasLocalPassword(user.password_hash) && user.auth_source !== 'ldap') {
    const ok = await bcrypt.compare(String(password || ''), user.password_hash);
    if (!ok) throw authError();
    if (!available.password && !(await isSuperadmin(user.id))) throw authError();
    assertActive(user);
    return { user, method: 'password' };
  }

  // Directory accounts, unknown logins, and pre-created accounts without a
  // local password (e.g. invited by an admin) go to Active Directory.
  if (available.ldap && (!user || user.auth_source === 'ldap' || !hasLocalPassword(user.password_hash))) {
    const profile = await authenticateDirectory(parsed.integrations.activeDirectory, login, password);
    if (!profile) throw authError();
    const resolved = await resolveDirectoryUser(profile, parsed.auth.ldap);
    // Lets modules reuse the directory password (e.g. Drive for file servers).
    await emitDirectorySignIn({ user: resolved, profile, password: String(password) });
    return { user: resolved, method: 'ldap' };
  }

  await bcrypt.compare(String(password || ''), DUMMY_HASH);
  throw authError();
}

/**
 * Whether a directory sign-in may take over an existing account found only by
 * its username. Directory accounts may (the DN can change after a move in AD),
 * and so may accounts an administrator created without a password (invited
 * people). Accounts that created themselves through Telegram or Google never
 * do: anyone can pick such a username first and would then receive the
 * directory person's groups and data on their first AD sign-in. Neither do the
 * wizard's sample accounts (one of them is in the administrators group).
 */
export function directoryMayLink(user) {
  if (!user) return false;
  if (isDemoSeedAccount(user)) return false;
  if (user.auth_source === 'ldap') return true;
  const local = user.auth_source == null || user.auth_source === '' || user.auth_source === 'local';
  return local && !hasLocalPassword(user.password_hash);
}

/*
 * Finds the portal account of a directory person: by DN (the current link),
 * then by directory object id (the person moved to another OU, so the DN
 * changed), then by username where a takeover is allowed. The stored DN and
 * object id are refreshed on every sign-in.
 *
 * First sign-ins are serialized per directory person (advisory lock on the
 * object id, else the DN) and re-checked inside the lock, so two parallel
 * first sign-ins create one account, not two.
 */
async function findDirectoryUser(profile, client) {
  const byDn = await findUserByExternalId('ldap', profile.dn, client);
  if (byDn) return byDn;
  return findUserByDirectoryGuid(profile.guid, client);
}

export function directoryLockKey(profile) {
  return `directory:${profile.guid ? `guid:${String(profile.guid).toLowerCase()}` : `dn:${String(profile.dn).toLowerCase()}`}`;
}

async function resolveDirectoryUser(profile, options) {
  const mapped = mapDirectoryGroups(options.groupMap, profile.memberOf);
  let user =
    (await findDirectoryUser(profile, { query })) ||
    (await findUserByUsername(profile.username).then((found) => (directoryMayLink(found) ? found : null)));

  if (!user) {
    if (!options.autoProvision) throw authError('login_failed');
    let created = false;
    user = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [directoryLockKey(profile)]);
      // A parallel first sign-in may have created the account meanwhile.
      const existing = await findDirectoryUser(profile, client);
      if (existing) return existing;
      created = true;
      return provisionExternalUser(client, {
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        source: 'ldap',
        externalId: profile.dn,
        directoryGuid: profile.guid,
        groupIds: mapped,
      });
    });
    if (created) return user;
  }

  assertActive(user);
  await syncExternalProfile(user.id, profile);
  await withTransaction(async (client) => {
    if (profile.guid) {
      // The object id belongs to this account now (a stale copy elsewhere would block it).
      await client.query(`UPDATE users SET directory_guid = NULL WHERE directory_guid = $1 AND id <> $2`, [String(profile.guid).toLowerCase(), user.id]);
    }
    await client.query(
      `UPDATE users SET external_id = $2, auth_source = 'ldap', directory_guid = COALESCE($3, directory_guid) WHERE id = $1`,
      [user.id, profile.dn, profile.guid ? String(profile.guid).toLowerCase() : null]
    );
  });
  // Mapped directory groups are added on every sign-in; manual memberships stay.
  for (const groupId of mapped) {
    await query(
      `INSERT INTO user_group_members (user_id, group_id)
       SELECT $1, id FROM app_groups WHERE id = $2 ON CONFLICT DO NOTHING`,
      [user.id, groupId]
    );
  }
  return findUserById(user.id);
}

// ── Telegram Login Widget ───────────────────────────────────────────────────

const TELEGRAM_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];

/**
 * Verifies a Telegram Login Widget payload:
 * HMAC-SHA256(data_check_string, SHA256(bot_token)) must equal `hash`,
 * and the authorization must be less than a day old.
 */
export function verifyTelegramPayload(payload, botToken, now = Date.now()) {
  if (!payload || !botToken) return null;
  const data = {};
  for (const key of TELEGRAM_FIELDS) {
    if (payload[key] != null && payload[key] !== '') data[key] = String(payload[key]);
  }
  const hash = String(payload.hash || '');
  if (!data.id || !data.auth_date || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const checkString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const age = now / 1000 - Number(data.auth_date);
  if (!(age >= -60 && age < 86400)) return null;

  return {
    id: data.id,
    username: data.username || null,
    displayName: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || `tg${data.id}`,
  };
}

export async function verifyTelegramForLinking(payload) {
  const { parsed, available } = await loadSettings();
  if (!available.ready.telegram) throw badRequest('Telegram integration is not configured');
  const telegram = verifyTelegramPayload(payload, parsed.integrations.telegram.botToken);
  if (!telegram) throw badRequest('Telegram authorization could not be verified');
  return telegram;
}

export async function signInWithTelegram(payload) {
  const { parsed, available } = await loadSettings();
  if (!available.telegram) throw authError('login_failed', 'Telegram sign-in is disabled', 'METHOD_DISABLED');
  const telegram = verifyTelegramPayload(payload, parsed.integrations.telegram.botToken);
  if (!telegram) throw authError('login_failed', 'Telegram authorization could not be verified', 'TELEGRAM_INVALID');

  let user = await findUserByTelegramId(telegram.id);
  if (!user) {
    if (!parsed.auth.telegram.autoProvision) {
      throw authError('login_failed', 'This Telegram account is not linked to any user', 'TELEGRAM_NOT_LINKED');
    }
    user = await withTransaction((client) =>
      provisionExternalUser(client, {
        username: telegram.username || `tg${telegram.id}`,
        displayName: telegram.displayName,
        source: 'telegram',
        externalId: telegram.id,
        telegram,
      })
    );
  }
  assertActive(user);
  // Telegram usernames change; sign-in codes by @username must reach the right account.
  if ((user.telegram_username || null) !== (telegram.username || null)) {
    await refreshTelegramUsername(user.id, telegram).catch((err) => console.warn('Telegram username not refreshed:', err.message));
  }
  return { user, method: 'telegram' };
}

// ── Google (OpenID Connect) ──────────────────────────────────────────────────

/**
 * `claims` come from a verified Google ID token (services/google.js).
 * Lookup order: linked Google account → the single user with that verified
 * email (then linked) → a new account when auto-provisioning is on.
 */
export async function signInWithGoogle(claims) {
  const { parsed, available } = await loadSettings();
  if (!available.google) throw authError('login_failed', 'Google sign-in is disabled', 'METHOD_DISABLED');
  const domains = allowedDomains(parsed.integrations.google);
  if (!domainAllowed(claims, domains)) {
    throw authError('login_failed', 'This Google account is not from an allowed domain', 'GOOGLE_DOMAIN');
  }

  const linked = await findGoogleAccountBySub(claims.sub);
  let user = linked ? await findUserById(linked.user_id) : null;
  if (!user && claims.email && claims.email_verified) {
    // Only addresses we trust: a self-typed email must not capture someone's Google sign-in.
    const candidate = await findUserByEmail(claims.email);
    if (candidate?.email_trusted) user = candidate;
    else if (candidate) {
      throw authError('login_failed', 'This Google account is not linked to any user', 'GOOGLE_NOT_LINKED');
    }
  }
  if (!user) {
    if (!parsed.auth.google?.autoProvision) {
      throw authError('login_failed', 'This Google account is not linked to any user', 'GOOGLE_NOT_LINKED');
    }
    if (!claims.email_verified) throw authError('login_failed', 'Google email is not verified', 'GOOGLE_NOT_LINKED');
    user = await withTransaction((client) =>
      provisionExternalUser(client, {
        username: String(claims.email || '').split('@')[0],
        displayName: claims.name || claims.email,
        email: claims.email,
        source: 'google',
        externalId: claims.sub,
      })
    );
  }
  assertActive(user);
  await saveGoogleAccount(user.id, claims, {}, { signIn: true });
  return { user, method: 'google' };
}

// ── One-time codes and magic links (email / WhatsApp / Telegram) ───────────
//
// Protection:
//  - 6-digit codes live 5 minutes, links 15 minutes; both are single-use
//  - stored only as HMAC/SHA-256 hashes, compared in constant time
//  - 5 wrong guesses burn the code (counted atomically); a new request does not
//    void a live code, so strangers cannot cancel someone's sign-in
//  - one send per 60 s and at most 5 per hour per account and channel, and at
//    most 15 per hour per requesting address
//  - delivery runs after the answer, so timing does not reveal the account
//  - responses never reveal whether the account exists
//  - link tokens travel in the URL fragment (#), which never reaches servers or logs

const CHANNELS = {
  email: { method: 'emailCode', find: findUserByEmail },
  whatsapp: { method: 'whatsappCode', find: findUserByPhone },
  telegram: { method: 'telegramCode', find: findUserByTelegramUsername },
  mattermost: { method: 'mattermostCode', find: findUserByMattermost },
};

const LINK_TTL_MINUTES = 15;
const SENDS_PER_HOUR = 5;
const SENDS_PER_IP_PER_HOUR = 15;

function codeHash(userId, code) {
  return createHmac('sha256', config.auth.jwtSecret || 'dev-secret').update(`${userId}:${code}`).digest('hex');
}

function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function signInMessage(user, appName, { code, link }, locale = user.locale) {
  const t = translator(locale);
  if (link) {
    return {
      subject: t('core.signin.linkSubject', { app: appName }),
      text: t('core.signin.linkText', { app: appName, minutes: LINK_TTL_MINUTES, link }),
    };
  }
  return {
    subject: t('core.signin.codeSubject', { code }),
    text: t('core.signin.codeText', { app: appName, code, minutes: CODE_TTL_MINUTES }),
  };
}

async function deliver(channel, user, message) {
  if (channel === 'email') return sendEmail({ to: user.email, ...message });
  if (channel === 'whatsapp') return sendWhatsapp({ phone: user.phone, text: message.text });
  if (channel === 'mattermost') return sendMattermostDirect({ username: user.mattermost, text: message.text });
  return sendTelegram({ chatId: user.telegram_id, text: message.text });
}

/**
 * Sends a code (or a magic link) if the identifier belongs to exactly one
 * active account. The caller always gets the same answer.
 */
export async function requestSignInCode(channel, identifier, mode = 'code', { ip } = {}) {
  const spec = CHANNELS[channel];
  if (!spec) throw badRequest('Unknown channel');
  const { parsed, available } = await loadSettings();
  if (!available[spec.method]) throw badRequest('This sign-in method is disabled');
  const kind = mode === 'link' ? 'link' : 'code';
  if (kind === 'link' && !available.magicLink) throw badRequest('Sign-in links are disabled');

  const user = await spec.find(identifier);
  if (!user || user.is_active === false || user.is_blocked === true) {
    // Invisible to the requester (no enumeration), visible to admins in Activity.
    await recordSecurityEvent({
      kind: 'code_unknown',
      severity: 'warning',
      username: String(identifier).slice(0, 64),
      ip,
      detail: user ? `${channel}: account disabled or blocked` : `${channel}: no single active account matches`,
      code: user ? 'code_inactive' : 'code_no_match',
      params: { channel },
      debounceMinutes: 5,
    });
    return;
  }

  const recent = await query(
    `SELECT
       COUNT(*) FILTER (WHERE user_id = $1 AND channel = $2
                          AND created_at > NOW() - ($3 || ' seconds')::interval)::int AS last_minute,
       COUNT(*) FILTER (WHERE user_id = $1 AND channel = $2)::int AS last_hour,
       COUNT(*) FILTER (WHERE ip = $4)::int AS from_ip
     FROM auth_codes
     WHERE (user_id = $1 OR ip = $4) AND created_at > NOW() - INTERVAL '1 hour'`,
    [user.id, channel, String(CODE_RESEND_SECONDS), ip || '']
  );
  const { last_minute: lastMinute, last_hour: lastHour, from_ip: fromIp } = recent.rows[0];
  if (lastMinute > 0 || lastHour >= SENDS_PER_HOUR || (ip && fromIp >= SENDS_PER_IP_PER_HOUR)) return;

  // Older live codes stay valid until they expire: a request by a stranger
  // must not cancel the code the owner is about to type.
  await query(`DELETE FROM auth_codes WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => {});

  let message;
  if (kind === 'link') {
    const token = randomBytes(32).toString('base64url');
    await query(
      `INSERT INTO auth_codes (user_id, channel, kind, code_hash, expires_at, ip)
       VALUES ($1, $2, 'link', $3, NOW() + ($4 || ' minutes')::interval, $5)`,
      [user.id, channel, tokenHash(token), String(LINK_TTL_MINUTES), ip || null]
    );
    const origin = String(config.frontend.url).replace(/\/$/, '');
    message = signInMessage(user, parsed.appName, { link: `${origin}/auth/magic#${token}` }, await localeFor(user));
  } else {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await query(
      `INSERT INTO auth_codes (user_id, channel, kind, code_hash, expires_at, ip)
       VALUES ($1, $2, 'code', $3, NOW() + ($4 || ' minutes')::interval, $5)`,
      [user.id, channel, codeHash(user.id, code), String(CODE_TTL_MINUTES), ip || null]
    );
    message = signInMessage(user, parsed.appName, { code }, await localeFor(user));
  }
  // Not awaited: a real account would otherwise answer seconds later than an
  // unknown one (SMTP, gateways), revealing which identifiers exist.
  deliver(channel, user, message).catch(async (err) => {
    console.warn('Sign-in code delivery failed:', err.message);
    await recordSecurityEvent({
      kind: 'code_delivery_failed',
      severity: 'danger',
      username: user.username,
      ip,
      detail: `${channel}: ${String(err.message || err).slice(0, 160)}`,
      code: 'code_delivery',
      params: { channel, error: String(err.message || err).slice(0, 160) },
      debounceMinutes: 1,
    }).catch(() => {});
  });
}

export async function signInWithCode(channel, identifier, code) {
  const spec = CHANNELS[channel];
  if (!spec) throw badRequest('Unknown channel');
  const { available } = await loadSettings();
  if (!available[spec.method]) throw authError('login_failed', 'This sign-in method is disabled', 'METHOD_DISABLED');

  const invalid = () => authError('login_failed', 'The code is invalid or has expired', 'CODE_INVALID');
  const user = await spec.find(identifier);
  if (!user || !/^\d{6}$/.test(String(code || ''))) throw invalid();

  // Every guess is charged to every live code first, in one statement, so
  // parallel requests cannot squeeze in more than CODE_MAX_ATTEMPTS checks
  // per code; only codes that still had a try left are compared. A code that
  // used up its tries is never charged again, which burns it.
  const charged = await query(
    `UPDATE auth_codes SET attempts = attempts + 1
     WHERE user_id = $1 AND channel = $2 AND kind = 'code' AND consumed_at IS NULL
       AND expires_at > NOW() AND attempts < $3
     RETURNING id, code_hash`,
    [user.id, channel, CODE_MAX_ATTEMPTS]
  );
  const actual = Buffer.from(codeHash(user.id, String(code)), 'hex');
  const match = charged.rows.find((row) => timingSafeEqual(Buffer.from(row.code_hash, 'hex'), actual));
  if (!match) throw invalid();
  // Single use, even under concurrent requests.
  const claimed = await query(
    `UPDATE auth_codes SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
    [match.id]
  );
  if (!claimed.rows.length) throw invalid();
  // The other codes sent for this sign-in are no longer needed.
  await query(
    `UPDATE auth_codes SET consumed_at = NOW()
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL`,
    [user.id, channel]
  );
  assertActive(user);
  if (channel === 'email') await query(`UPDATE users SET email_trusted = TRUE WHERE id = $1`, [user.id]);
  return { user, method: channel };
}

export async function signInWithMagicLink(token) {
  const value = String(token || '');
  const invalid = () => authError('login_failed', 'This sign-in link is invalid or has expired', 'LINK_INVALID');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) throw invalid();
  const claimed = await query(
    `UPDATE auth_codes SET consumed_at = NOW()
     WHERE code_hash = $1 AND kind = 'link' AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING user_id, channel`,
    [tokenHash(value)]
  );
  const row = claimed.rows[0];
  if (!row) throw invalid();
  const { available } = await loadSettings();
  if (!available.magicLink || !available[CHANNELS[row.channel]?.method]) throw invalid();
  const user = await findUserById(row.user_id);
  if (!user) throw invalid();
  assertActive(user);
  if (row.channel === 'email') await query(`UPDATE users SET email_trusted = TRUE WHERE id = $1`, [user.id]);
  return { user, method: 'magic_link' };
}
