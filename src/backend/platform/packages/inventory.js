import { createHash } from 'node:crypto';
import { APP_VERSION } from '../../config/version.js';
import { portalIdentity, signWithPortalKey } from '../identity.js';
import { packageStates } from './loader.js';
import { SDK_VERSION } from '../sdk/version.js';

/*
 * «Which modules and versions are installed» (spec §6 stage 6). The store is a
 * separate project; this is the request a portal will send it, documented in
 * docs/module-packages.md «Store: inventory and updates»:
 *
 *   {
 *     "format": "portal-inventory/1",
 *     "portal": { "id": "<uuid>", "keyId": "<16 hex>", "publicKey": "-----BEGIN PUBLIC KEY-----…" },
 *     "core": { "version": "1.17.0", "sdk": "1.0.0" },
 *     "modules": [ { "id": "masterplan", "version": "1.2.0", "source": "package", "state": "enabled" }, … ],
 *     "generatedAt": "2026-10-23T10:00:00.000Z",
 *     "challenge": "<the store's nonce, when it sent one>",
 *     "digest": "<sha256 hex of the JSON above without digest/signature>",
 *     "signature": "<base64 Ed25519 signature of digest by the portal key>"
 *   }
 *
 * Replay: a signed inventory without a challenge proves only that the portal
 * produced it at some time (anyone with settings.view can fetch one and show it
 * again later). The store sends a fresh random `challenge` (8–128 characters of
 * [A-Za-z0-9_-]: GET /admin/modules/inventory?challenge=…); it is signed with
 * the rest, so an answer is good for that one request only.
 *
 * The answer of the store («updates available») uses UPDATES_FORMAT (no
 * implementation yet: the shape is fixed so the store can be built against it).
 */

export const INVENTORY_FORMAT = 'portal-inventory/1';
export const UPDATES_FORMAT = 'portal-updates/1';

/** Canonical JSON (sorted keys) so the digest does not depend on key order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

export const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** `challenge`: the store's nonce (signed with the inventory); anything else is refused (null → none). */
export async function inventory({ challenge = null } = {}) {
  if (challenge != null && !CHALLENGE_PATTERN.test(String(challenge))) throw Object.assign(new Error('challenge must be 8–128 characters of A–Z, a–z, 0–9, _ and -'), { statusCode: 400, code: 'BAD_CHALLENGE' });
  const identity = await portalIdentity();
  const modules = (await packageStates()).map((item) => ({ id: item.id, version: item.version, source: item.source, state: item.state }));
  const body = {
    format: INVENTORY_FORMAT,
    portal: { id: identity.id, keyId: identity.keyId, publicKey: identity.publicKey },
    core: { version: APP_VERSION, sdk: SDK_VERSION },
    modules,
    generatedAt: new Date().toISOString(),
    ...(challenge != null ? { challenge: String(challenge) } : {}),
  };
  const digest = createHash('sha256').update(canonicalJson(body)).digest('hex');
  try {
    return { ...body, digest, signature: await signWithPortalKey(digest) };
  } catch (err) {
    // The sealed key cannot be opened (the encryption key changed): the inventory is still
    // useful, the store just cannot trust it until the old key is restored.
    return { ...body, digest, signature: null, signatureError: err.message };
  }
}

/**
 * Example of the store's answer (documentation and tests):
 *
 *   {
 *     "format": "portal-updates/1",
 *     "portal": "<uuid>",
 *     "checkedAt": "…",
 *     "updates": [
 *       { "id": "masterplan", "installed": "1.2.0", "latest": "1.3.0", "compatible": true,
 *         "core": "1.16.0", "requires": [{ "id": "crm", "version": "1.1.0" }],
 *         "changelog": { "ru": ["…"], "en": ["…"] },
 *         "download": { "url": "https://store…/masterplan-1.3.0.zip", "sha256": "…", "bytes": 123456 } }
 *     ],
 *     "notices": [{ "level": "info", "message": { "ru": "…", "en": "…" } }]
 *   }
 *
 * The portal will download the zip and install it exactly like an uploaded
 * file (signature, checks, preview card), so the store needs no extra trust.
 */
export function validateUpdatesAnswer(value) {
  const problems = [];
  if (!value || value.format !== UPDATES_FORMAT) problems.push(`format must be ${UPDATES_FORMAT}`);
  if (!Array.isArray(value?.updates)) problems.push('updates must be a list');
  for (const item of value?.updates || []) {
    if (!item || typeof item.id !== 'string' || typeof item.latest !== 'string') problems.push('each update needs id and latest');
    if (item?.download && (typeof item.download.url !== 'string' || !/^https:\/\//.test(item.download.url) || !/^[a-f0-9]{64}$/.test(String(item.download.sha256 || '')))) problems.push(`${item.id}: download needs an https url and a sha256`);
  }
  return problems;
}
