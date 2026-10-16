/*
 * HOOK FOR STAGE 3 — "add the new folder groups to the folder's NTFS ACL".
 *
 * Creating a folder group pair (superadministrators) makes the two AD groups
 * here; granting them on the folder is the NTFS engine's job (SMB gateway,
 * modules/drive/acl*.js). The engine registers its implementation once at
 * start-up:
 *
 *   import { registerNtfsAttach } from './access/ntfsHook.js';
 *   registerNtfsAttach(async (input) => { … return { status: 'applied' }; });
 *
 * `input`:
 *   actor:   { userId, dn, login, credential: { username, domain, password } }
 *            — the acting administrator's own account (never the service account)
 *   folder:  { shareId, path, description }   — shareId from the shares' path prefixes,
 *            path relative to that share ('06-HR'), description path ('W:\06-HR')
 *   groups:  [{ type: 'full' | 'read', dn, name, sid }]
 *   rights:  { full: 'modify', read: 'read_execute' }  — access setting typeMap
 *   journal: { batch }  — to tie the NTFS journal rows to the group creation
 *   onBeforeWrite(previous, preview, where) — optional; awaited after the guards, right
 *            before the folder is written (previous = undo blob { sd, sddl, revision },
 *            where = { id, share, path } on the server). A throw writes nothing.
 *   onPropagationFinish(job) — optional; the propagation to the subfolders ended
 *
 * It resolves to { status: 'applied' | 'failed' | 'skipped', code?, message?, sddlBefore? }
 * and must not throw for an NTFS refusal (return status 'failed' instead).
 * Until an engine is registered the result is { status: 'pending', code: 'FA_NTFS_NOT_AVAILABLE' }
 * and the UI says the groups still have to be added to the folder by hand.
 */

let attach = null;

export function registerNtfsAttach(fn) {
  attach = typeof fn === 'function' ? fn : null;
}

export const ntfsAttachAvailable = () => Boolean(attach);

export async function attachGroupsToNtfs(input) {
  if (!attach) return { status: 'pending', code: 'FA_NTFS_NOT_AVAILABLE' };
  try {
    const result = await attach(input);
    return result && typeof result === 'object' ? result : { status: 'applied' };
  } catch (err) {
    return { status: 'failed', code: err?.code && typeof err.code === 'string' ? err.code : 'FA_NTFS_FAILED', message: String(err?.message || '').slice(0, 300) };
  }
}
