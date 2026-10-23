import { modules } from '../../platform/registry.js';
import { httpError } from './logic.js';

/*
 * The AD directory works on the File server's Active Directory connection and
 * the people's stored AD credentials (modules/drive/api.js). Drive is an
 * optional link: these wrappers look it up at call time; without it the
 * directory answers 409 DRIVE_MISSING.
 */
function drive() {
  const api = modules.loaded('drive')?.api;
  if (!api) throw httpError(409, 'The AD directory needs the File server module', 'DRIVE_MISSING');
  return api;
}

export const addMember = (...args) => drive().addMember(...args);
export const newClient = (...args) => drive().newClient(...args);
export const rangedValues = (...args) => drive().rangedValues(...args);
export const removeMember = (...args) => drive().removeMember(...args);
export const withActor = (...args) => drive().withActor(...args);
export const withService = (...args) => drive().withService(...args);
export const actorCredential = (...args) => drive().actorCredential(...args);
export const credentialStatus = (...args) => drive().credentialStatus(...args);
export const isImpersonation = (...args) => drive().isImpersonation(...args);
export const parkCredential = (...args) => drive().parkCredential(...args);
export const savePassword = (...args) => drive().savePassword(...args);
export const markAllStale = (...args) => drive().markAllStale(...args);
export const markLoginsStale = (...args) => drive().markLoginsStale(...args);
