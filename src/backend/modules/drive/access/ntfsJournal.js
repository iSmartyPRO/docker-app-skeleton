import { query } from '../../../config/database.js';
import { recordChange } from './journal.js';

/*
 * Journal rows of the NTFS mode (kind 'ntfs'). The folder is kept in
 * `group_name` (its display path, so the journal's "group" filter finds it)
 * and in before.folder: { shareId, path, serverId, share, serverPath, display }.
 * Writes keep the previous descriptor: before = { folder, sddl, sd (base64, the
 * exact undo blob), revision }, after = { sddl, revision, summary }.
 */

const MAX_FAILED = 50;

// Refusals before anything is written: shown to the person, not journalled.
export const NTFS_REFUSALS = new Set(['STALE', 'CONFIRM_SELF_REMOVAL', 'PROTECTED_PRINCIPAL', 'REVISION_REQUIRED', 'BAD_ACL', 'BAD_SID', 'BAD_PRESET', 'FA_CREDENTIALS_FAILED', 'FA_CREDENTIALS_REQUIRED', 'FA_NOT_LINKED', 'INVALID_PATH', 'NOT_FOUND', 'FA_CONFIRM', 'EMPTY_DACL', 'UNSAFE_SOURCE', 'JOB_RUNNING', 'FA_JOURNAL_FAILED']);
// The write surely did not happen: the journal row says "failed" (anything else may have reached the server).
export const NTFS_DEFINITE_FAILURES = new Set(['ACCESS_DENIED']);

/**
 * Second half of a write journalled in two steps: the row was inserted with
 * outcome 'pending' and the undo copy BEFORE the write (journal down → nothing
 * is written); this records how the write ended. `patch`: { after, ok, outcome,
 * errorCode, error, undoOf }, or null to drop the row (the write was refused
 * before anything happened). Undo of a row still 'pending' goes through the
 * "changed since" diff.
 */
export async function completeChange(id, patch, run = query) {
  if (!patch) {
    await run(`DELETE FROM drive_access_journal WHERE id = $1 AND outcome = 'pending'`, [id]);
    return;
  }
  const ok = patch.ok !== false;
  await run(
    `UPDATE drive_access_journal SET after = $2, ok = $3, outcome = $4, error_code = $5, error = $6, undo_of = $7 WHERE id = $1`,
    [
      id,
      patch.after == null ? null : JSON.stringify(patch.after),
      ok,
      patch.outcome || (ok ? 'changed' : 'failed'),
      patch.errorCode ? String(patch.errorCode).slice(0, 40) : null,
      patch.error ? String(patch.error).slice(0, 500) : null,
      patch.undoOf || null,
    ]
  );
  if (patch.undoOf && ok) await run(`UPDATE drive_access_journal SET undone_by = $2 WHERE id = $1 AND undone_by IS NULL`, [patch.undoOf, id]);
}

/** The folder of a journal row: drive entry + path, and where it is on the server (undo uses the latter). */
export function folderRef(folder, server = {}) {
  return {
    shareId: folder.shareId ?? null,
    path: folder.path ?? '',
    display: folder.display || null,
    serverId: server.id ?? folder.serverId ?? null,
    share: server.share ?? folder.share ?? null,
    serverPath: server.path ?? folder.serverPath ?? null,
  };
}

const attachBase = (batch, ref) => ({ action: 'ntfs_attach', via: 'hook', batch, group: { dn: null, name: ref.display || ref.path } });
const attachNames = (groups) => (groups || []).map((group) => group.name);
const attachUndoCopy = (ref, previous) => ({ folder: ref, sddl: previous?.sddl || null, sd: previous?.sd || null, revision: previous?.revision || null });

/** The applied hook result as a journal row's after / outcome / error. */
function attachApplied(ntfs, names) {
  return {
    after: { sddl: ntfs.sddlAfter || null, revision: ntfs.revisionAfter || null, groups: names, jobId: ntfs.jobId || null, propagationError: ntfs.propagationError || null },
    ok: true,
    outcome: ntfs.changed === false ? 'unchanged' : 'changed',
    // The folder changed but its children were not updated (e.g. UNSAFE_SOURCE): kept as the row's error code.
    errorCode: ntfs.propagationError?.code || null,
    error: ntfs.propagationError?.message || null,
  };
}

/** "Create folder group pair" → the NTFS hook's result (applied / failed). Returns the journal id or null. */
export async function recordNtfsAttach(actor, { batch, folder, ntfs, groups }, record = recordChange) {
  if (!ntfs || (ntfs.status !== 'applied' && ntfs.status !== 'failed')) return null;
  const ref = folderRef(folder, ntfs.server || {});
  const base = attachBase(batch, ref);
  const names = attachNames(groups);
  if (ntfs.status === 'failed') {
    return record(actor, { ...base, before: { folder: ref }, after: { groups: names }, ok: false, outcome: 'failed', errorCode: ntfs.code || 'FA_NTFS_FAILED', error: ntfs.message || null });
  }
  return record(actor, { ...base, before: attachUndoCopy(ref, { sddl: ntfs.sddlBefore, sd: ntfs.sdBefore, revision: ntfs.revisionBefore }), ...attachApplied(ntfs, names) });
}

/**
 * First half of "create folder group pair" → NTFS, called by the hook's
 * onBeforeWrite right before the folder is written: the 'pending' row with
 * the undo copy. Throws FA_JOURNAL_FAILED when it cannot be recorded (then
 * the engine writes nothing). Returns the row id.
 */
export async function startNtfsAttach(actor, { batch, folder, groups }, previous, server = {}, record = recordChange) {
  const ref = folderRef(folder, server || {});
  try {
    return await record(actor, { ...attachBase(batch, ref), before: attachUndoCopy(ref, previous), after: { groups: attachNames(groups) }, ok: true, outcome: 'pending' });
  } catch (err) {
    console.warn('Drive access: journalling the NTFS change failed:', err.message);
    throw Object.assign(new Error('The change could not be journalled (no undo copy); nothing was written'), { code: 'FA_JOURNAL_FAILED', status: 503 });
  }
}

/**
 * Second half: how the hook ended. With no pending row (nothing was written,
 * or the hook refused before the write) the result is journalled in one step.
 * Returns the journal id (null when nothing could be recorded); never throws.
 */
export async function finishNtfsAttach(actor, pendingId, { batch, folder, ntfs, groups }, { record = recordChange, complete = completeChange } = {}) {
  try {
    if (!pendingId) {
      if (ntfs?.code === 'FA_JOURNAL_FAILED') return null;
      return await recordNtfsAttach(actor, { batch, folder, ntfs, groups }, record);
    }
    const names = attachNames(groups);
    if (ntfs?.status === 'applied') {
      await complete(pendingId, attachApplied(ntfs, names));
    } else {
      const failure = { after: { groups: names }, errorCode: ntfs?.code || 'FA_NTFS_FAILED', error: ntfs?.message || null };
      // Refused or denied: nothing was written. Otherwise (timeout, gateway down…) it may have been: kept 'pending', undo stays possible.
      const definite = NTFS_REFUSALS.has(failure.errorCode) || NTFS_DEFINITE_FAILURES.has(failure.errorCode);
      await complete(pendingId, definite ? { ...failure, ok: false, outcome: 'failed' } : { ...failure, ok: true, outcome: 'pending' });
    }
    return pendingId;
  } catch (err) {
    console.warn('Drive access: journalling the NTFS change failed:', err.message);
    return pendingId || null;
  }
}

/** A finished propagation job (counters, failed objects, where it stopped). */
export async function recordPropagation(actor, ref, job, { via = 'single', batch = null, confirmCount = null } = {}, record = recordChange) {
  const failedCount = job.progress?.failed || job.failedList?.length || 0;
  const ok = job.state === 'done';
  return record(actor, {
    action: 'ntfs_propagate',
    via,
    batch,
    group: { dn: null, name: ref.display || ref.path },
    // confirmCount: in "replace" mode, how many objects with own entries the person was shown and confirmed.
    before: { folder: ref, mode: job.mode, ...(confirmCount != null ? { confirmCount } : {}) },
    after: {
      jobId: job.id,
      state: job.state,
      progress: job.progress,
      failedList: (job.failedList || []).slice(0, MAX_FAILED),
      failedCount,
      protectedCount: job.progress?.protected || job.protectedList?.length || 0,
      marker: job.marker || null,
    },
    ok,
    outcome: !ok ? 'failed' : job.progress?.changed ? 'changed' : 'unchanged',
    errorCode: job.error?.code || (job.state === 'cancelled' ? 'CANCELLED' : ok && failedCount ? 'PARTIAL' : null),
    error: job.error?.message || null,
  });
}
