import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import config from '../config/app.js';

/*
 * Sealing for credentials the product keeps on behalf of users and the portal
 * (OAuth refresh tokens, webhook secrets, the Web Push key, …). AES-256-GCM.
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 *
 * Key: ENCRYPTION_KEY, or derived from JWT_SECRET when it is not set.
 *
 * Key rotation without losing stored secrets: values are always sealed with
 * the current key, but opened with any of
 *   1. the current key,
 *   2. ENCRYPTION_KEY_PREVIOUS   (comma-separated list of former ENCRYPTION_KEY values),
 *   3. JWT_SECRET_PREVIOUS       (comma-separated list of former JWT_SECRET values,
 *                                 for installs that never set ENCRYPTION_KEY),
 *   4. the key derived from the current JWT_SECRET (when ENCRYPTION_KEY was
 *      introduced later, values sealed before it still open).
 * Callers that can store (services/google.js, push.js, api/webhooks.js)
 * re-seal a value opened with an older key, so the old entries can be removed
 * from .env once everything has been read once.
 *
 * A value that opens with none of them is reported to administrators
 * (security event "secret_unreadable") and treated as unavailable — never as
 * revoked: the caller keeps it, so restoring the old key brings it back.
 */

const digest = (source) => createHash('sha256').update(source).digest();
const derived = (jwtSecret) => digest(`${jwtSecret || 'dev-secret'}:seal`);
const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function currentKey() {
  return process.env.ENCRYPTION_KEY ? digest(process.env.ENCRYPTION_KEY) : derived(config.auth.jwtSecret);
}

/** Keys to try when opening, current first, without duplicates. */
export function decryptionKeys() {
  const keys = [currentKey()];
  for (const value of list(process.env.ENCRYPTION_KEY_PREVIOUS)) keys.push(digest(value));
  for (const value of list(process.env.JWT_SECRET_PREVIOUS)) keys.push(derived(value));
  if (process.env.ENCRYPTION_KEY) keys.push(derived(config.auth.jwtSecret));
  const seen = new Set();
  return keys.filter((key) => {
    const hex = key.toString('hex');
    if (seen.has(hex)) return false;
    seen.add(hex);
    return true;
  });
}

export function seal(plain) {
  if (plain == null || plain === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', currentKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function openWith(key, iv, tag, data) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const reported = new Map();
const REPORT_EVERY_MS = 60 * 60 * 1000;

/** Tells administrators (Activity → security events, Mattermost) at most once an hour per label. */
export function reportUnreadableSecret(label = 'secret', detail = '') {
  const last = reported.get(label) || 0;
  if (Date.now() - last < REPORT_EVERY_MS) return;
  reported.set(label, Date.now());
  console.warn(`Stored ${label} cannot be decrypted: the encryption key changed. Restore it or list the old one in ENCRYPTION_KEY_PREVIOUS / JWT_SECRET_PREVIOUS.`);
  // Loaded lazily: security.js pulls in settings and the database.
  import('./security.js')
    .then(({ recordSecurityEvent }) =>
      recordSecurityEvent({
        kind: 'secret_unreadable',
        severity: 'danger',
        detail: `${label} cannot be decrypted (encryption key changed; see docs/security.md)${detail ? ` · ${detail}` : ''}`,
        code: 'secret_unreadable',
        params: { label, detail: detail || '' },
        debounceMinutes: 60,
      })
    )
    .catch(() => {});
}

/**
 * Opens a sealed value → { value, stale, failed }.
 *   value   '' for empty input, the plain text, or null when it cannot be opened
 *   stale   opened with an older key: re-seal and store it when convenient
 *   failed  sealed, but no known key opens it (already reported)
 */
export function openSealed(sealed, { label } = {}) {
  if (!sealed) return { value: '', stale: false, failed: false };
  const [version, iv, tag, data] = String(sealed).split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) {
    if (label) reportUnreadableSecret(label, 'malformed value');
    return { value: null, stale: false, failed: true };
  }
  const keys = decryptionKeys();
  for (let i = 0; i < keys.length; i += 1) {
    const value = openWith(keys[i], iv, tag, data);
    if (value !== null) return { value, stale: i > 0, failed: false };
  }
  if (label) reportUnreadableSecret(label);
  return { value: null, stale: false, failed: true };
}

/** Returns '' for empty input and null when the value cannot be opened. */
export function unseal(sealed, options) {
  return openSealed(sealed, options).value;
}
