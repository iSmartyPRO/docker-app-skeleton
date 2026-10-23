import { query, withTransaction } from '../config/database.js';
import { getSettings, parseSettings } from './settings.js';
import { authenticateDirectory, directoryEntry, searchDirectory } from './ldap.js';
import { directoryCredentialInfo, emitDirectoryCredential } from './hooks.js';
import { disconnectGoogle, getGoogleAccount } from './google.js';
import { linkTelegram, unlinkTelegram } from './users.js';

/*
 * A person's links to integrations, managed by administrators from Users:
 *   - the Active Directory account (users.external_id = DN, auth_source 'ldap'),
 *     so a manually created person signs in with their domain login;
 *   - the domain password a superadministrator may set, checked against the
 *     directory and stored for file servers (Drive) — useful when the person
 *     signs in by a WhatsApp/e-mail code and the portal never sees it;
 *   - Telegram and Google (view, link by Telegram id, unlink).
 */

function httpError(statusCode, message, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

async function directoryConfig() {
  const parsed = parseSettings(await getSettings());
  const cfg = parsed.integrations.activeDirectory;
  if (!cfg?.enabled || !cfg.host || !cfg.baseDn) throw httpError(400, 'Active Directory is not set up', 'DIRECTORY_OFF');
  return cfg;
}

async function directoryReady() {
  const cfg = parseSettings(await getSettings()).integrations.activeDirectory;
  return Boolean(cfg?.enabled && cfg.host && cfg.baseDn);
}

async function userRow(userId) {
  const { rows } = await query(`SELECT id, username, auth_source, external_id, telegram_id, telegram_username, mattermost, phone FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) throw httpError(404, 'User not found', 'NOT_FOUND');
  return rows[0];
}

/** Portal accounts already linked to these DNs (to warn before linking twice). */
async function linkedTo(dns, exceptId = 0) {
  if (!dns.length) return new Map();
  const { rows } = await query(
    `SELECT id, username, LOWER(external_id) AS dn FROM users WHERE auth_source = 'ldap' AND LOWER(external_id) = ANY($1) AND id <> $2`,
    [dns.map((dn) => dn.toLowerCase()), exceptId]
  );
  return new Map(rows.map((row) => [row.dn, { id: row.id, username: row.username }]));
}

// The stored domain password lives in the File server module (a package): it answers through a hook.
const driveLogin = (userId) => directoryCredentialInfo(userId);

/** Everything the Users page shows about a person's links. */
export async function userLinks(userId) {
  const row = await userRow(userId);
  const ready = await directoryReady();
  let directory = null;
  if (row.auth_source === 'ldap' && row.external_id) {
    directory = { dn: row.external_id, found: null };
    if (ready) {
      try {
        const entry = await directoryEntry(await directoryConfig(), row.external_id);
        directory = entry ? { ...entry, memberOf: undefined, found: true } : { dn: row.external_id, found: false };
      } catch {
        directory = { dn: row.external_id, found: null, unreachable: true };
      }
    }
  }
  const google = await getGoogleAccount(userId).catch(() => null);
  return {
    directory,
    directoryReady: ready,
    authSource: row.auth_source || 'local',
    domainPassword: await driveLogin(userId),
    telegram: row.telegram_id ? { id: String(row.telegram_id), username: row.telegram_username || null } : null,
    google: google ? { email: google.email, name: google.name, status: google.status || 'ok' } : null,
    mattermost: row.mattermost || null,
    phone: row.phone || null,
  };
}

/** Directory people matching `text`, each with the portal account already linked to it (if any). */
export async function findDirectoryPeople(text, forUserId) {
  const people = await searchDirectory(await directoryConfig(), text, 15);
  const taken = await linkedTo(people.map((person) => person.dn), forUserId);
  return people.map(({ memberOf, ...person }) => ({ ...person, linkedTo: taken.get(person.dn.toLowerCase()) || null }));
}

async function assertFreeDn(dn, userId) {
  const taken = (await linkedTo([dn], userId)).get(dn.toLowerCase());
  if (taken) throw httpError(409, `This directory account is already linked to @${taken.username}`, 'DIRECTORY_TAKEN', { username: taken.username });
}

/** Stores the DN and the directory object id (taken over from a stale link elsewhere). */
async function setDirectoryLink(userId, entry) {
  const guid = entry.guid ? String(entry.guid).toLowerCase() : null;
  await withTransaction(async (client) => {
    if (guid) await client.query(`UPDATE users SET directory_guid = NULL WHERE directory_guid = $1 AND id <> $2`, [guid, userId]);
    await client.query(
      `UPDATE users SET external_id = $2, directory_guid = $3, auth_source = 'ldap', updated_at = NOW() WHERE id = $1`,
      [userId, entry.dn, guid]
    );
  });
}

/** Links a portal account to a directory account (by DN); sign-in with the domain login follows. */
export async function linkDirectory(userId, dn) {
  await userRow(userId);
  const entry = await directoryEntry(await directoryConfig(), dn);
  if (!entry) throw httpError(404, 'The directory account was not found', 'DIRECTORY_NOT_FOUND');
  await assertFreeDn(entry.dn, userId);
  await setDirectoryLink(userId, entry);
  return entry;
}

/** Back to a portal account: no directory sign-in (codes, Telegram etc. keep working). */
export async function unlinkDirectory(userId) {
  await userRow(userId);
  await query(`UPDATE users SET external_id = NULL, directory_guid = NULL, auth_source = 'local', updated_at = NOW() WHERE id = $1 AND auth_source = 'ldap'`, [userId]);
}

/** Checks a domain login and password against the directory; returns the profile. */
export async function testDirectoryLogin(login, password) {
  const profile = await authenticateDirectory(await directoryConfig(), String(login || '').trim(), String(password || ''));
  if (!profile) throw httpError(400, 'The directory did not accept this login and password', 'DIRECTORY_LOGIN_FAILED');
  const { memberOf, ...rest } = profile;
  return rest;
}

/**
 * Stores a person's domain password (superadministrators only): checked first,
 * links the person to that directory account when not linked yet, refuses an
 * account that belongs to someone else.
 */
export async function setDirectoryPassword(userId, login, password) {
  const row = await userRow(userId);
  const profile = await testDirectoryLogin(login, password);
  if (row.auth_source === 'ldap' && row.external_id && row.external_id.toLowerCase() !== profile.dn.toLowerCase()) {
    throw httpError(409, 'This login belongs to another directory account than the one linked', 'DIRECTORY_MISMATCH', { dn: profile.dn });
  }
  if (!(row.auth_source === 'ldap' && row.external_id)) {
    await assertFreeDn(profile.dn, userId);
    await setDirectoryLink(userId, profile);
  }
  const stored = await emitDirectoryCredential({ userId, username: profile.username, password: String(password) });
  return { profile, stored };
}

export async function forgetDirectoryPassword(userId) {
  await userRow(userId);
  await emitDirectoryCredential({ userId, forget: true });
}

/** Links Telegram by its numeric user id (the person can also link it themselves). */
export async function linkTelegramId(userId, telegramId, username) {
  const id = String(telegramId || '').trim();
  if (!/^\d{4,15}$/.test(id)) throw httpError(400, 'A Telegram user id is a number', 'TELEGRAM_ID');
  await userRow(userId);
  await linkTelegram(userId, { id, username: String(username || '').replace(/^@/, '').trim().slice(0, 64) || null });
}

export { unlinkTelegram, disconnectGoogle };
