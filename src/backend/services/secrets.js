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
