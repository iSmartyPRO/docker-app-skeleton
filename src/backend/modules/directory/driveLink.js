import { modules } from '../../platform/registry.js';
import { httpError } from './logic.js';

/*
 * The AD directory works on the File server's Active Directory connection and
 * the people's stored AD credentials (modules/drive/api.js). Drive is an
 * optional link (a separate package): these wrappers look it up at call time;
 * without it the real directory answers 409 DRIVE_MISSING (the demo directory
 * needs none of it). What does not need the File server works without it: the
 * «sign in as» check is the core session's own, and marking File server sessions
 * stale after a membership change has nothing to mark.
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
// The same check as the File server's (drive/access/credentials.js): a «sign in as» session.
export const isImpersonation = (req) => Boolean(req?.auth?.imp || req?.impersonator);
export const parkCredential = (...args) => drive().parkCredential(...args);
export const savePassword = (...args) => drive().savePassword(...args);
export const markAllStale = (...args) => modules.loaded('drive')?.api?.markAllStale?.(...args);
export const markLoginsStale = (...args) => modules.loaded('drive')?.api?.markLoginsStale?.(...args);
