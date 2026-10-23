/*
 * Public API of the File server (Drive) for other modules (docs/drive.md).
 * The AD directory reuses its Active Directory connection and the people's
 * stored AD credentials. Drive is an optional link for it (manifest
 * `enhances`): reach it at run time with `modules.loaded('drive')?.api`.
 * Everything else in this folder is internal.
 */

// LDAP helpers on the File server's AD connection (service account or the person's own credential).
export { addMember, newClient, rangedValues, removeMember, withActor, withService } from './access/directory.js';
// The people's stored AD passwords.
export { actorCredential, credentialStatus, isImpersonation, parkCredential, savePassword } from './access/credentials.js';
// File server sessions that must re-authenticate after a password change.
export { markAllStale, markLoginsStale } from './sessions.js';
