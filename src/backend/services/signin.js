import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../config/app.js';
import { query, withTransaction } from '../config/database.js';
import { authAvailability, getSettings, parseSettings } from './settings.js';
import { authenticateDirectory, mapDirectoryGroups } from './ldap.js';
import { sendEmail, sendMattermostDirect, sendTelegram, sendWhatsapp } from './integrations.js';
import { getUserAccess, hasLocalPassword } from './rbac.js';
import { recordSecurityEvent } from './security.js';
import { allowedDomains, domainAllowed, findGoogleAccountBySub, saveGoogleAccount } from './google.js';
import {
  findUserByEmail,
  findUserByExternalId,
  findUserById,
  findUserByPhone,
  findUserByTelegramId,
  findUserByMattermost,
  findUserByTelegramUsername,
  findUserByUsername,
  provisionExternalUser,
  syncExternalProfile,
} from './users.js';

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
    return { user: await resolveDirectoryUser(profile, parsed.auth.ldap), method: 'ldap' };
  }

  await bcrypt.compare(String(password || ''), DUMMY_HASH);
  throw authError();
}

async function resolveDirectoryUser(profile, options) {
  const mapped = mapDirectoryGroups(options.groupMap, profile.memberOf);
  let user =
    (await findUserByExternalId('ldap', profile.dn)) ||
    (await findUserByUsername(profile.username).then((found) =>
      found && (found.auth_source === 'ldap' || !hasLocalPassword(found.password_hash)) ? found : null
    ));

  if (!user) {
    if (!options.autoProvision) throw authError('login_failed');
    user = await withTransaction((client) =>
      provisionExternalUser(client, {
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        source: 'ldap',
        externalId: profile.dn,
        groupIds: mapped,
      })
    );
    return user;
  }

  assertActive(user);
  await syncExternalProfile(user.id, profile);
  await query(`UPDATE users SET external_id = $2, auth_source = 'ldap' WHERE id = $1`, [user.id, profile.dn]);
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
  await saveGoogleAccount(user.id, claims);
  return { user, method: 'google' };
}

// ── One-time codes and magic links (email / WhatsApp / Telegram) ───────────
//
// Protection:
//  - 6-digit codes live 5 minutes, links 15 minutes; both are single-use
//  - stored only as HMAC/SHA-256 hashes, compared in constant time
//  - 5 wrong guesses burn the code; a new request invalidates older ones
//  - one send per 60 s and at most 5 per hour per account and channel
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

function codeHash(userId, code) {
  return createHmac('sha256', config.auth.jwtSecret || 'dev-secret').update(`${userId}:${code}`).digest('hex');
}

function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function signInMessage(user, appName, { code, link }) {
  const ru = user.locale === 'ru';
  if (link) {
    return {
      subject: ru ? `Вход в ${appName}` : `Sign in to ${appName}`,
      text: ru
        ? `${appName}: ссылка для входа (действует ${LINK_TTL_MINUTES} минут, одноразовая):\n${link}\n\nЕсли вы не запрашивали вход — просто проигнорируйте это сообщение.`
        : `${appName}: your sign-in link (valid for ${LINK_TTL_MINUTES} minutes, single use):\n${link}\n\nIf you did not request it, ignore this message.`,
    };
  }
  return {
    subject: ru ? `Код для входа: ${code}` : `Your sign-in code: ${code}`,
    text: ru
      ? `${appName}: код для входа ${code}. Действует ${CODE_TTL_MINUTES} минут. Никому не сообщайте его.`
      : `${appName}: your sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Do not share it.`,
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
      debounceMinutes: 5,
    });
    return;
  }

  const recent = await query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - ($3 || ' seconds')::interval)::int AS last_minute,
       COUNT(*)::int AS last_hour
     FROM auth_codes
     WHERE user_id = $1 AND channel = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [user.id, channel, String(CODE_RESEND_SECONDS)]
  );
  const { last_minute: lastMinute, last_hour: lastHour } = recent.rows[0];
  if (lastMinute > 0 || lastHour >= SENDS_PER_HOUR) return;

  await query(
    `UPDATE auth_codes SET consumed_at = NOW()
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL`,
    [user.id, channel]
  );
  await query(`DELETE FROM auth_codes WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => {});

  let message;
  if (kind === 'link') {
    const token = randomBytes(32).toString('base64url');
    await query(
      `INSERT INTO auth_codes (user_id, channel, kind, code_hash, expires_at)
       VALUES ($1, $2, 'link', $3, NOW() + ($4 || ' minutes')::interval)`,
      [user.id, channel, tokenHash(token), String(LINK_TTL_MINUTES)]
    );
    const origin = String(config.frontend.url).replace(/\/$/, '');
    message = signInMessage(user, parsed.appName, { link: `${origin}/auth/magic#${token}` });
  } else {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await query(
      `INSERT INTO auth_codes (user_id, channel, kind, code_hash, expires_at)
       VALUES ($1, $2, 'code', $3, NOW() + ($4 || ' minutes')::interval)`,
      [user.id, channel, codeHash(user.id, code), String(CODE_TTL_MINUTES)]
    );
    message = signInMessage(user, parsed.appName, { code });
  }
  try {
    await deliver(channel, user, message);
  } catch (err) {
    await recordSecurityEvent({
      kind: 'code_delivery_failed',
      severity: 'danger',
      username: user.username,
      ip,
      detail: `${channel}: ${String(err.message || err).slice(0, 160)}`,
      debounceMinutes: 1,
    });
    throw err;
  }
}

export async function signInWithCode(channel, identifier, code) {
  const spec = CHANNELS[channel];
  if (!spec) throw badRequest('Unknown channel');
  const { available } = await loadSettings();
  if (!available[spec.method]) throw authError('login_failed', 'This sign-in method is disabled', 'METHOD_DISABLED');

  const invalid = () => authError('login_failed', 'The code is invalid or has expired', 'CODE_INVALID');
  const user = await spec.find(identifier);
  if (!user || !/^\d{6}$/.test(String(code || ''))) throw invalid();

  const result = await query(
    `SELECT id, code_hash, attempts FROM auth_codes
     WHERE user_id = $1 AND channel = $2 AND kind = 'code' AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, channel]
  );
  const row = result.rows[0];
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) throw invalid();

  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(codeHash(user.id, String(code)), 'hex');
  if (!timingSafeEqual(expected, actual)) {
    await query(
      `UPDATE auth_codes SET attempts = attempts + 1,
         consumed_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE NULL END
       WHERE id = $1`,
      [row.id, CODE_MAX_ATTEMPTS]
    );
    throw invalid();
  }
  // Single use, even under concurrent requests.
  const claimed = await query(
    `UPDATE auth_codes SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
    [row.id]
  );
  if (!claimed.rows.length) throw invalid();
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
