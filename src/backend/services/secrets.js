import jwt from 'jsonwebtoken';
import config from '../config/app.js';
import { BUILTIN_MODULE_IDS } from '../modules/catalog.js';

/*
 * Stored secrets of modules (passwords of remote computers, Passbolt keys, the Portal VNC
 * client key…): seal before storing, unseal to use. The same AES-256-GCM sealing as the
 * core's own secrets (services/crypto.js), without its key handling — module packages reach
 * it as `seal` / `unseal` of @portal/sdk (docs/module-packages.md «Server SDK»), so values a
 * module sealed while it was built into the core open unchanged after it became a package.
 *
 * Not a security boundary: a signed package runs with the portal's privileges anyway
 * (docs/module-packages.md «SIGNATURE»); this keeps honest code off the key material.
 */
export { seal, unseal, openSealed } from './crypto.js';


/*
 * Signed tokens of a module package (the File server's link visitor sessions and file read
 * tokens): an HS256 JWT keyed by the portal secret and the token's purpose — the module never
 * sees the key. A module signs only its OWN purposes (docs/module-packages.md «Server SDK»):
 *   - `pkg-<id>` or `pkg-<id>-<name>` (ids have no "-", so `pkg-a-x` can only belong to `a`);
 *   - the purposes it used while built into the core, listed here per module (LEGACY_TOKEN_PURPOSES:
 *     the File server's "drive-link" — the same key as then, so links and visitor sessions issued
 *     then stay valid).
 * Never a purpose of the core (files-link, kb-share, google-state, seal…: their keys are derived the
 * same way, so allowing them would let a package forge Files or KB visitor sessions), and never for
 * an id of a module built into the core. `moduleTokens(id)` binds the module once (module scope or
 * register(ctx): ctx.tokens); every sign / verify checks the purpose against it.
 */
const PURPOSE = /^[a-z][a-z0-9_-]{1,72}$/;
const MODULE_ID = /^[a-z][a-z0-9_]{1,31}$/;

/** Purposes a module used while it was built into the core: kept on their old key. */
export const LEGACY_TOKEN_PURPOSES = Object.freeze({ drive: Object.freeze(['drive-link']) });

/** Purposes of the core itself (keys `<secret>:<purpose>` or digests of them): never a module's. */
export const CORE_TOKEN_PURPOSES = Object.freeze(['files-link', 'kb-share', 'google-state', 'seal', 'wopi-access-token', 'session', 'auth']);

const BUILTIN = new Set(BUILTIN_MODULE_IDS);

/** May module `id` use `purpose`? (`builtin`: ids of the modules built into the core) */
export function tokenPurposeAllowed(id, purpose, builtin = BUILTIN) {
  if (!MODULE_ID.test(String(id || '')) || builtin.has(id)) return false;
  const text = String(purpose || '');
  if (!PURPOSE.test(text) || CORE_TOKEN_PURPOSES.includes(text)) return false;
  return text === `pkg-${id}` || text.startsWith(`pkg-${id}-`) || Boolean(LEGACY_TOKEN_PURPOSES[id]?.includes(text));
}

const keyOf = (purpose) => `${config.auth.jwtSecret || 'dev-secret'}:${purpose}`;

/**
 * Token signing for module `id`: { sign(purpose, payload, options), verify(purpose, token, options) } —
 * jwt.sign / jwt.verify with the key <portal secret>:<purpose>. A purpose the module does not own throws
 * (TOKEN_PURPOSE_DENIED); so does an id of a module built into the core.
 */
export function moduleTokens(id) {
  if (!MODULE_ID.test(String(id || ''))) throw Object.assign(new Error('moduleTokens(id): the id of the module package'), { code: 'TOKEN_PURPOSE_DENIED' });
  if (BUILTIN.has(id)) throw Object.assign(new Error(`moduleTokens(${id}): a module built into the core has its own keys`), { code: 'TOKEN_PURPOSE_DENIED' });
  const key = (purpose) => {
    if (!tokenPurposeAllowed(id, purpose)) throw Object.assign(new Error(`Module ${id} may not use the token purpose "${purpose}" (its own are pkg-${id}-…)`), { code: 'TOKEN_PURPOSE_DENIED' });
    return keyOf(purpose);
  };
  return Object.freeze({
    id,
    sign: (purpose, payload, options = {}) => jwt.sign(payload, key(purpose), options),
    verify: (purpose, token, options = {}) => jwt.verify(String(token), key(purpose), options),
  });
}
