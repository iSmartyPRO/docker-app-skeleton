import { registerNtfsAttach } from './access/ntfsHook.js';
import { addGroupsToFolder, resolveDriveFolder } from './acl.js';

/*
 * Plugs the NTFS engine (acl.js) into the access section: "create folder group
 * pair" grants the new groups on the folder (see access/ntfsHook.js for
 * the contract). Runs with the acting administrator's own credential.
 */

export async function attachGroups(input, { add = addGroupsToFolder, resolve = resolveDriveFolder } = {}) {
  const groups = (input?.groups || []).map((group) => ({
    sid: group.sid,
    preset: input?.rights?.[group.type] || (group.type === 'full' ? 'modify' : 'readExecute'),
  }));
  if (!groups.length) return { status: 'skipped', code: 'FA_NTFS_NO_GROUPS' };
  if (groups.some((group) => !group.sid)) return { status: 'failed', code: 'FA_NTFS_NO_SID', message: 'The group SID is not known yet' };
  try {
    const folder = await resolve(input.folder.shareId, input.folder.path || '');
    const actor = { userId: input.actor?.userId ?? null, credential: input.actor?.credential };
    const options = {};
    if (input.onPropagationFinish) options.onFinish = input.onPropagationFinish;
    // The caller may journal the undo copy before the folder is written (then a journal failure writes nothing).
    // Third argument: where the folder is on the server (the journal row's undo target).
    const where = { id: folder.server.id, share: folder.share, path: folder.path };
    if (input.onBeforeWrite) options.onBeforeWrite = (previous, preview) => input.onBeforeWrite(previous, preview, where);
    const result = await add(actor, folder.server, folder.share, folder.path, groups, options);
    return {
      status: 'applied',
      changed: result.changed,
      sddlBefore: result.previous?.sddl || null,
      sdBefore: result.previous?.sd || null,
      revisionBefore: result.previous?.revision || null,
      sddlAfter: result.acl?.sddl || null,
      revisionAfter: result.acl?.revision || null,
      jobId: result.job?.id || null,
      // The folder was changed but its children were not (e.g. UNSAFE_SOURCE): show it, keep the undo blob.
      propagationError: result.propagationError || null,
      server: where,
    };
  } catch (err) {
    return { status: 'failed', code: err?.code || 'FA_NTFS_FAILED', message: String(err?.message || '').slice(0, 300), details: err?.details };
  }
}

registerNtfsAttach((input) => attachGroups(input));
