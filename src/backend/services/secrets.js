import jwt from 'jsonwebtoken';
import config from '../config/app.js';

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
 * Signed tokens of a module (the File server's link visitor sessions and file read
 * tokens): an HS256 JWT keyed by the portal secret and the token's `purpose`
 * ("drive-link") — the same key the module used while built into the core, so tokens
 * it issued then stay valid. The module never sees the key itself.
 */
const PURPOSE = /^[a-z][a-z0-9-]{1,40}$/;
const tokenKey = (purpose) => {
  if (!PURPOSE.test(String(purpose || ''))) throw new Error('A token purpose looks like "drive-link"');
  return `${config.auth.jwtSecret || 'dev-secret'}:${purpose}`;
};

/** jwt.sign(payload, <portal secret>:<purpose>, options). */
export const signModuleToken = (purpose, payload, options = {}) => jwt.sign(payload, tokenKey(purpose), options);

/** jwt.verify(token, <portal secret>:<purpose>): the payload, or throws like jwt.verify. */
export const verifyModuleToken = (purpose, token, options = {}) => jwt.verify(String(token), tokenKey(purpose), options);
