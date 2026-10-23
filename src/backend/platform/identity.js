import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { query } from '../config/database.js';
import { seal, unseal } from '../services/crypto.js';
import { keyIdOf } from './packages/signature.js';

/*
 * Identity of this portal for the future module store (spec §6 stage 6,
 * docs/module-packages.md «Store preparation»): a UUID and an Ed25519 key pair,
 * made once on first use and kept in the portal_identity table. The private
 * key is sealed with the portal's encryption key (services/crypto.js) and
 * never leaves the server: the API shows the id and the public key only;
 * signInventory() signs the inventory so the store can tell portals apart.
 */

let cached = null;

export async function ensureIdentityTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS portal_identity (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      portal_id UUID NOT NULL,
      public_key TEXT NOT NULL,
      private_key_sealed TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** { id, publicKey, keyId, createdAt } — created on the first call. */
export async function portalIdentity() {
  if (cached) return cached.public;
  await ensureIdentityTable();
  let row = (await query(`SELECT * FROM portal_identity WHERE singleton`)).rows[0];
  if (!row) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    await query(`INSERT INTO portal_identity (singleton, portal_id, public_key, private_key_sealed) VALUES (TRUE, $1, $2, $3) ON CONFLICT (singleton) DO NOTHING`, [randomUUID(), publicPem, seal(privatePem)]);
    row = (await query(`SELECT * FROM portal_identity WHERE singleton`)).rows[0];
  }
  cached = {
    public: { id: row.portal_id, publicKey: row.public_key, keyId: keyIdOf(row.public_key), createdAt: row.created_at },
    sealed: row.private_key_sealed,
  };
  return cached.public;
}

/** Ed25519 signature (base64) of `text` with the portal key. */
export async function signWithPortalKey(text) {
  await portalIdentity();
  const pem = unseal(cached.sealed, { label: 'portal identity key' });
  if (!pem) throw new Error('The portal identity key cannot be decrypted (encryption key changed)');
  const key = createPrivateKey(pem);
  if (createPublicKey(key).export({ type: 'spki', format: 'pem' }) !== cached.public.publicKey) throw new Error('The portal identity key does not match its public key');
  return sign(null, Buffer.from(text, 'utf8'), key).toString('base64');
}

/** Tests: forget the cached identity. */
export function resetIdentityCache() {
  cached = null;
}
