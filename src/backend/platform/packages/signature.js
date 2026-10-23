import { KeyObject, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Package signatures (docs/module-packages.md «Signing»).
 *
 * The signed text is a canonical listing of every file of the package except
 * SIGNATURE itself, sorted by path (byte order of the UTF-8 path):
 *
 *   <sha256 hex>  <path>\n
 *
 * SIGNATURE is JSON: { "format": 1, "algorithm": "ed25519", "keyId": "…",
 * "signature": "<base64>" }. keyId is the first 16 hex characters of the
 * SHA-256 of the raw 32-byte public key. The portal trusts the public keys in
 * src/backend/platform/trusted-keys.json (MODULE_TRUSTED_KEYS_FILE overrides
 * the path, for tests); the private key never lives in the repository.
 */

export const SIGNATURE_FILE = 'SIGNATURE';
const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TRUSTED_KEYS_FILE = resolve(here, '../trusted-keys.json');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The canonical text that is signed, from [{ name, sha256 }] (SIGNATURE itself left out). */
export function listingOf(entries) {
  return entries
    .filter((entry) => entry.name !== SIGNATURE_FILE)
    .map((entry) => [Buffer.from(entry.name, 'utf8'), `${entry.sha256}  ${entry.name}\n`])
    .sort((a, b) => Buffer.compare(a[0], b[0]))
    .map(([, line]) => line)
    .join('');
}

/** The canonical text that is signed: files = [{ name, data }]. */
export function canonicalListing(files) {
  return listingOf(files.filter((file) => file.name !== SIGNATURE_FILE).map((file) => ({ name: file.name, sha256: sha256(file.data) })));
}

/** SHA-256 of a canonical listing: what installed_modules.listing_sha256 keeps. */
export const listingDigest = (listing) => sha256(Buffer.from(listing, 'utf8'));

/** Raw 32-byte Ed25519 public key of a KeyObject / PEM. */
function rawPublicKey(key) {
  const object = key instanceof KeyObject ? (key.type === 'public' ? key : createPublicKey(key)) : createPublicKey(key);
  const der = object.export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 32);
}

export function keyIdOf(publicKey) {
  return sha256(rawPublicKey(publicKey)).slice(0, 16);
}

/**
 * A new Ed25519 key pair as PEM strings with its keyId. With `passphrase` the private key is
 * an encrypted PKCS#8 PEM (AES-256-CBC): a copy of the file alone cannot sign.
 */
export function generateSigningKey({ passphrase = null } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  return {
    publicKey: publicPem,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem', ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}) }),
    keyId: keyIdOf(publicPem),
    encrypted: Boolean(passphrase),
  };
}

/** The private key of a PEM (encrypted ones need `passphrase`). */
export function readSigningKey(privateKeyPem, { passphrase = null } = {}) {
  const encrypted = /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(String(privateKeyPem));
  if (encrypted && !passphrase) throw new Error('The signing key is protected by a passphrase: set MODULE_SIGNING_KEY_PASSPHRASE');
  try {
    return createPrivateKey(encrypted ? { key: privateKeyPem, format: 'pem', passphrase } : privateKeyPem);
  } catch (err) {
    if (encrypted) throw new Error(`The signing key cannot be opened (wrong MODULE_SIGNING_KEY_PASSPHRASE?): ${err.message}`);
    throw err;
  }
}

/** The SIGNATURE file contents (a Buffer) for these files. */
export function signFiles(files, privateKeyPem, { passphrase = null } = {}) {
  const privateKey = readSigningKey(privateKeyPem, { passphrase });
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The signing key must be an Ed25519 key');
  const publicKey = createPublicKey(privateKey);
  const signature = sign(null, Buffer.from(canonicalListing(files), 'utf8'), privateKey).toString('base64');
  return Buffer.from(`${JSON.stringify({ format: 1, algorithm: 'ed25519', keyId: keyIdOf(publicKey), signature }, null, 2)}\n`);
}

/** Trusted keys: [{ id, publicKey, comment }] from trusted-keys.json (missing file = none). */
export function loadTrustedKeys(file = process.env.MODULE_TRUSTED_KEYS_FILE || DEFAULT_TRUSTED_KEYS_FILE) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return (parsed.keys || []).filter((key) => key && key.publicKey).map((key) => ({ ...key, id: keyIdOf(key.publicKey) }));
}

/**
 * Checks the SIGNATURE of a package's files. Returns
 *   { ok: true, keyId, signed: true }            valid signature by a trusted key
 *   { ok: true, signed: false }                  no SIGNATURE and allowUnsigned
 *   { ok: false, reason }                        anything else
 * A SIGNATURE that is present but wrong is refused even when unsigned packages are allowed.
 */
export function verifyFiles(files, { trustedKeys = loadTrustedKeys(), allowUnsigned = false } = {}) {
  const entry = files.find((file) => file.name === SIGNATURE_FILE);
  return verifyListing(canonicalListing(files), entry ? entry.data : null, { trustedKeys, allowUnsigned });
}

/** verifyFiles for a listing already computed (the files on disk, platform/packages/integrity.js). `signatureData`: the SIGNATURE file or null. */
export function verifyListing(listing, signatureData, { trustedKeys = loadTrustedKeys(), allowUnsigned = false } = {}) {
  if (!signatureData) return allowUnsigned ? { ok: true, signed: false } : { ok: false, reason: 'unsigned' };
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(signatureData).toString('utf8'));
  } catch {
    return { ok: false, reason: 'signature file is not valid JSON' };
  }
  if (parsed?.algorithm !== 'ed25519' || typeof parsed.signature !== 'string' || typeof parsed.keyId !== 'string') return { ok: false, reason: 'unsupported signature format' };
  const key = trustedKeys.find((item) => item.id === parsed.keyId);
  if (!key) return { ok: false, reason: `unknown signing key ${parsed.keyId}` };
  let good = false;
  try {
    good = verify(null, Buffer.from(listing, 'utf8'), createPublicKey(key.publicKey), Buffer.from(parsed.signature, 'base64'));
  } catch {
    good = false;
  }
  return good ? { ok: true, signed: true, keyId: parsed.keyId } : { ok: false, reason: 'signature does not match the files' };
}
