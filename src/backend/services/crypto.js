import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import config from '../config/app.js';

/*
 * Sealing for credentials the product keeps on behalf of users (OAuth refresh
 * tokens). AES-256-GCM with a key from ENCRYPTION_KEY, or derived from
 * JWT_SECRET when it is not set. Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 *
 * Rotating the key makes stored tokens unreadable; users then reconnect.
 */

function key() {
  const source = process.env.ENCRYPTION_KEY || `${config.auth.jwtSecret || 'dev-secret'}:seal`;
  return createHash('sha256').update(source).digest();
}

export function seal(plain) {
  if (plain == null || plain === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Returns '' for empty input and null when the value cannot be opened. */
export function unseal(sealed) {
  if (!sealed) return '';
  const [version, iv, tag, data] = String(sealed).split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
