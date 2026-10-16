import { randomUUID } from 'crypto';
import { query } from '../../../config/database.js';
import * as engine from '../acl.js';
import { directoryDomain } from '../credentials.js';
import { cleanPath } from '../paths.js';
import { httpError, intId } from '../../shared/acl.js';
import { actorCredential, isImpersonation, parkCredential } from './credentials.js';
import { actorOf, journalEntry, recordChange, securityEvent } from './journal.js';
import { buildPairs, folderKeyOf, pairKey, pathKey, userPaths } from './naming.js';
import { actorSidsOf, lookupSids, searchSubjects } from './ntfsDirectory.js';
import { NTFS_DEFINITE_FAILURES, NTFS_REFUSALS, completeChange, folderRef, recordPropagation } from './ntfsJournal.js';
import { cleanChange, computeMismatches, confirmMatches, confirmNameOf, diffAces, expectedPreset, folderDisplay, folderTargetKey, ntfsUndoRefusal } from './ntfsLogic.js';
import { requireNtfs, requireSuperadmin } from './policy.js';
import { accessSettings, adConfig, loadGroups, searchBases } from './service.js';

/*
 * NTFS permissions in the File server's «Доступ» (superadministrators): browse the File server
 * folders, read a folder's permissions with names, draft → preview → apply,
 * inheritance, propagation jobs, undo from the journal, and the mismatch
 * report between the sg_ groups and the folders' actual permissions.
 *
 * Every call to the file server runs with the acting administrator's OWN
 * domain account (the password the access section keeps, credentials.js); the
 * portal service account only reads the directory (SID → name). Windows has
 * the last word: no "Change permissions" right → ACCESS_DENIED.
 *
 * Folders are addressed as { shareId (drive_shares.id), path inside it }.
 */

const REPORT_CONCURRENCY = 2;
const ANCESTOR_LEVELS = 12;
const REFUSALS = NTFS_REFUSALS;
const DEFINITE_FAILURES = NTFS_DEFINITE_FAILURES;

async function loadShares() {
  const { rows } = await query(
    `SELECT sh.id, sh.title, sh.share, sh.root_path, sh.server_id, sh.path_prefixes, s.name AS server_name, s.host
       FROM drive_shares sh JOIN drive_servers s ON s.id = sh.server_id ORDER BY sh.sort, sh.id`
  );
  return rows;
}

const DEFAULT_DEPS = {
  acl: {
    getAcl: engine.getAcl,
    previewAcl: engine.previewAcl,
    setAcl: engine.setAcl,
    restoreAcl: engine.restoreAcl,
    previewRestore: engine.previewRestore,
    startPropagation: engine.startPropagation,
    getJob: engine.getJob,
    listJobs: engine.listJobs,
    cancelJob: engine.cancelJob,
    refuseWhileJobRuns: engine.refuseWhileJobRuns,
    resolveDriveFolder: engine.resolveDriveFolder,
  },
  loadShares,
  actorCredential,
  parkCredential,
  directoryDomain,
  adConfig,
  accessSettings,
  loadGroups,
  lookupSids,
  searchSubjects,
  actorSidsOf,
  recordChange,
  completeChange,
  journalEntry,
  securityEvent,
};

let deps = DEFAULT_DEPS;

/** Tests replace the engine, the directory and the journal. Returns a restore function. */
export function _setNtfsDeps(next) {
  const previous = deps;
  deps = { ...deps, ...next, acl: { ...deps.acl, ...(next.acl || {}) } };
  return () => {
    deps = previous;
  };
}

// ── who and where ────────────────────────────────────────────────────────────

/** The acting administrator: their AD credential for the file server, and the journal identity. */
async function ntfsActor(req) {
  const credential = await deps.actorCredential(req.user.id);
  const login = String(credential.login || '');
  const domain = /[\\@]/.test(login) ? '' : await deps.directoryDomain();
  return {
    credential,
    engine: { userId: req.user.id, credential: { username: login, domain, password: credential.password } },
    journal: actorOf(req, login),
    // "Sign in as" only reads: it never parks the other person's saved password.
    impersonating: isImpersonation(req),
  };
}

/** An engine error in this module's words: a rejected password is parked and asked for again. */
async function engineError(actor, err) {
  if (err?.code === 'AUTH') {
    const reason = err.details?.reason || 'AUTH_FAILED';
    try {
      // Not in a "sign in as" session (parkCredential skips it then).
      await deps.parkCredential(actor.credential, reason, { impersonating: actor.impersonating });
    } catch {
      /* best effort */
    }
    const error = httpError(403, 'The file server did not accept your domain password', 'FA_CREDENTIALS_FAILED');
    error.details = { reason };
    return error;
  }
  if (err?.code === 'CREDENTIALS_REQUIRED') return httpError(403, 'Enter your domain password', 'FA_CREDENTIALS_REQUIRED');
  return err;
}

async function engineCall(actor, fn) {
  try {
    return await fn();
  } catch (err) {
    throw await engineError(actor, err);
  }
}

/** The shares with their path prefixes ("W:", "G:\\ОБЪЕКТ-2\\_DocArch"); the first one is how folders are shown. */
async function sharesWithPrefixes() {
  const rows = await deps.loadShares();
  return rows.map((row) => ({ ...row, prefixes: row.path_prefixes || [], prefix: (row.path_prefixes || [])[0] || null }));
}

/** { shareId, path } → the folder with its display path and where it is on the server. */
async function folderOf(shareId, rawPath) {
  const path = cleanPath(rawPath || '');
  const id = intId(shareId);
  const row = (await sharesWithPrefixes()).find((item) => Number(item.id) === id);
  if (!row) throw httpError(404, 'Folder not found', 'NOT_FOUND');
  const target = await deps.acl.resolveDriveFolder(id, path);
  return {
    shareId: id,
    path,
    title: row.title,
    share: row.share,
    prefix: row.prefix,
    prefixes: row.prefixes,
    host: row.host,
    rootPath: row.root_path || '',
    display: folderDisplay({ prefix: row.prefix, host: row.host, share: row.share, rootPath: row.root_path, path }),
    target,
  };
}

const publicFolder = (folder) => ({
  shareId: folder.shareId,
  path: folder.path,
  title: folder.title,
  prefix: folder.prefix,
  display: folder.display,
  name: confirmNameOf(folder),
  parent: folder.path ? folder.path.split('/').slice(0, -1).join('/') : null,
});

const refOf = (folder) => folderRef(folder, { id: folder.target.server?.id ?? null, share: folder.target.share, path: folder.target.path });

async function subjectsBase() {
  const cfg = await deps.adConfig({ optional: true });
  if (!cfg) return null;
  return { cfg, base: searchBases(cfg, await deps.accessSettings()).subjects };
}

/** A search base that is the domain itself (only DC= parts): every account and group is under it. */
export const isDomainRoot = (base) => /^\s*DC=[^,]+(\s*,\s*DC=[^,]+)*\s*$/i.test(String(base || ''));

/**
 * SID → directory subject (service account): a Map with two flags,
 *   lookupFailed  the directory could not be asked (not set up, LDAP error): names are
 *                 unavailable and no SID may be called unknown;
 *   wholeDomain   the search covered the whole domain, so a SID it did not find is really unknown.
 * Never fails the view.
 */
async function sidInfo(sids) {
  const unavailable = () => Object.assign(new Map(), { lookupFailed: true, wholeDomain: false });
  try {
    const where = await subjectsBase();
    if (!where) return unavailable();
    const found = await deps.lookupSids(where.cfg, where.base, sids);
    return Object.assign(found instanceof Map ? found : new Map(), { lookupFailed: false, wholeDomain: isDomainRoot(where.base) });
  } catch (err) {
    console.warn('Drive access: SID lookup failed:', err?.message);
    return unavailable();
  }
}

/** sg_ groups by SID → { name, type, folderKey, shareId, relPath, pathKey } (for links to folder cards). */
async function groupIndex() {
  try {
    const groups = await deps.loadGroups({});
    return new Map(groups.filter((group) => group.sid).map((group) => [group.sid, { sid: group.sid, name: group.name, dn: group.dn, type: group.type, kind: group.kind, folderKey: group.pathKey ? `p:${group.pathKey}` : `n:${pairKey(group)}`, shareId: group.shareId, relPath: group.relPath, pathKey: group.pathKey }]));
  } catch {
    return new Map();
  }
}

function subjectFor(sid, info, groups) {
  if (!sid) return null;
  const found = info.get(sid);
  const group = groups.get(sid);
  const known = engine.wellKnownName(sid);
  const unresolved = !found && !group && !known;
  return {
    sid,
    name: found?.name || group?.name || known || null,
    login: found?.login || null,
    kind: found?.kind || (group ? 'group' : known ? 'wellknown' : info.lookupFailed ? null : 'unknown'),
    // Only when the directory was asked: a lookup failure is not "unknown".
    unknown: unresolved && !info.lookupFailed,
    unavailable: unresolved && Boolean(info.lookupFailed),
    group: group && group.kind === 'sg' ? { name: group.name, type: group.type, folderKey: group.folderKey } : null,
  };
}

const sidsOf = (...acls) => [...new Set(acls.filter(Boolean).flatMap((acl) => [acl.owner, ...(acl.aces || []).map((ace) => ace.sid)]).filter(Boolean))];

/** An ACL as the UI shows it: subjects with names and links, no raw descriptor. */
function annotate(acl, info, groups) {
  if (!acl) return acl;
  const { sd: _blob, ...rest } = acl;
  return {
    ...rest,
    ownerSubject: subjectFor(acl.owner, info, groups),
    aces: (acl.aces || []).map((ace, index) => {
      const subject = subjectFor(ace.sid, info, groups);
      return { ...ace, index, subject, name: subject?.name || ace.name || null };
    }),
  };
}

const namesOf = (info, groups, sids) => Object.fromEntries(sids.map((sid) => [sid, subjectFor(sid, info, groups)?.name]).filter(([, name]) => name));
const kindsOf = (info, groups, sids) => Object.fromEntries(sids.map((sid) => [sid, subjectFor(sid, info, groups)?.kind]).filter(([, kind]) => kind));

/** Guard entries with names, and the kind of principal (a deny on a group: "members of X lose …"). */
function namedGuards(guards, names, kinds = {}) {
  if (!guards) return guards;
  const name = (entry) => ({ ...entry, name: entry.name || names[entry.sid] || engine.wellKnownName(entry.sid) || null, kind: entry.sid ? kinds[entry.sid] || null : null });
  return { ok: guards.ok, errors: guards.errors.map(name), warnings: guards.warnings.map(name), loss: guards.loss.map(name) };
}

async function actorSids(actor) {
  const where = await subjectsBase();
  if (!where) throw httpError(400, 'Active Directory is not set up (Settings → Integrations)', 'FA_AD_OFF');
  const sids = await deps.actorSidsOf(where.cfg, actor.credential.dn);
  if (!sids.length) throw httpError(404, 'Your account was not found in Active Directory', 'FA_MEMBER_NOT_FOUND');
  return sids;
}

async function safeRecord(actor, entry) {
  try {
    return await deps.recordChange(actor, entry);
  } catch (err) {
    console.warn('Drive access: journalling an NTFS change failed:', err.message);
    return null;
  }
}

/**
 * First half of a journalled write, called right before the write: the row
 * with the undo copy (outcome 'pending'). No journal → no write.
 */
async function startPending(actor, entry) {
  try {
    return await deps.recordChange(actor, { ...entry, ok: true, outcome: 'pending' });
  } catch (err) {
    console.warn('Drive access: journalling an NTFS change failed:', err.message);
    throw httpError(503, 'The change could not be journalled (no undo copy); nothing was written', 'FA_JOURNAL_FAILED');
  }
}

/** Second half: how the write ended. false when that could not be recorded (the row stays 'pending'). */
async function finishPending(id, patch) {
  if (!id) return false;
  try {
    await deps.completeChange(id, patch);
    return true;
  } catch (err) {
    console.warn('Drive access: completing an NTFS journal row failed:', err.message);
    return false;
  }
}

/** A write that threw: drop / fail / keep the pending row, or journal the failure. */
async function journalFailure(actor, pendingId, entry, err) {
  const failure = { errorCode: err.code || 'ERROR', error: err.message };
  if (pendingId) {
    if (REFUSALS.has(err.code)) await finishPending(pendingId, null);
    else if (DEFINITE_FAILURES.has(err.code)) await finishPending(pendingId, { after: null, ok: false, outcome: 'failed', ...failure });
    // Unknown whether the server applied it (timeout, gateway down…): kept 'pending', undo stays possible.
    else await finishPending(pendingId, { after: null, ok: true, outcome: 'pending', ...failure });
    return;
  }
  if (!REFUSALS.has(err.code)) await safeRecord(actor, { ...entry, ok: false, outcome: 'failed', ...failure });
}

/** The undo copy of a write: what the dry run read (the write is pinned to its revision). */
const undoCopy = (ref, previous, fallback) => ({
  folder: ref,
  sddl: previous?.sddl || fallback?.sddl || null,
  sd: previous?.sd || fallback?.sd || null,
  revision: previous?.revision || fallback?.revision || null,
});

// ── reads ────────────────────────────────────────────────────────────────────

/**
 * Where inherited entries come from, like Windows' "Inherited from": the
 * nearest folder above (inside this File server folder) with a matching
 * explicit inheritable entry. Unknown ones stay null ("parent object").
 */
async function inheritanceSources(actor, folder, acl) {
  const pending = acl.aces.filter((ace) => ace.inherited && ace.sid).map((ace) => ace.index);
  const sources = {};
  if (!pending.length || !folder.path) return sources;
  const parts = folder.path.split('/');
  for (let level = parts.length - 1; level >= 0 && pending.length && parts.length - level <= ANCESTOR_LEVELS; level -= 1) {
    const path = parts.slice(0, level).join('/');
    let parent;
    try {
      const target = await deps.acl.resolveDriveFolder(folder.shareId, path);
      parent = await deps.acl.getAcl(actor.engine, target.server, target.share, target.path);
    } catch {
      break;
    }
    const display = folderDisplay({ prefix: folder.prefix, host: folder.host, share: folder.share, rootPath: folder.rootPath, path });
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const ace = acl.aces[pending[i]];
      const match = parent.aces.some(
        (item) => !item.inherited && item.type === ace.type && (item.sid === ace.sid || (item.sid === engine.SID.CREATOR_OWNER && ace.sid === acl.owner)) && engine.flagsOf(item.flags) & (engine.ACE_FLAGS.OI | engine.ACE_FLAGS.CI)
      );
      if (match) {
        sources[ace.index] = { path, display };
        pending.splice(i, 1);
      }
    }
    if (parent.protected) break;
  }
  return sources;
}

/** A folder's permissions: owner, entries with names (sg_ groups link to their folder card), the folder's own groups. */
export async function aclView(req, access, { shareId, path, sources = true }) {
  requireNtfs(access);
  const folder = await folderOf(shareId, path);
  const actor = await ntfsActor(req);
  const acl = await engineCall(actor, () => deps.acl.getAcl(actor.engine, folder.target.server, folder.target.share, folder.target.path));
  const [info, groups] = [await sidInfo(sidsOf(acl)), await groupIndex()];
  const shown = annotate(acl, info, groups);
  if (sources) {
    const found = await inheritanceSources(actor, folder, shown);
    shown.aces = shown.aces.map((ace) => (ace.inherited ? { ...ace, inheritedFrom: found[ace.index] || null } : ace));
  }
  const settings = await deps.accessSettings();
  // The folder's own groups: their description names one of the folder's user paths (any prefix of
  // the share), or maps to this very folder.
  const keys = userPaths(folder.prefixes || [], folder.path).map(pathKey);
  const own = [...groups.values()]
    .filter((group) => group.kind === 'sg' && ((group.pathKey && keys.includes(group.pathKey)) || (Number(group.shareId) === folder.shareId && String(group.relPath ?? '').toLowerCase() === folder.path.toLowerCase())))
    .map((group) => ({ ...group, expected: group.type ? expectedPreset(group.type, settings.typeMap) : null, present: acl.aces.some((ace) => ace.sid === group.sid && ace.type === 'allow') }));
  return { folder: publicFolder(folder), acl: shown, groups: own, confirmName: confirmNameOf(folder), namesUnavailable: Boolean(info.lookupFailed) };
}

/** Users, groups, computers and well-known principals for the subject picker. */
export async function findSubjects(access, q) {
  requireNtfs(access);
  const where = await subjectsBase();
  if (!where) throw httpError(400, 'Active Directory is not set up (Settings → Integrations)', 'FA_AD_OFF');
  return deps.searchSubjects(where.cfg, where.base, q);
}

// ── draft → preview → apply ──────────────────────────────────────────────────

async function previewShape(folder, out, change) {
  const [info, groups] = [await sidInfo(sidsOf(out.before, out.after)), await groupIndex()];
  const names = namesOf(info, groups, sidsOf(out.before, out.after));
  const guards = namedGuards(out.guards, names, kindsOf(info, groups, sidsOf(out.before, out.after)));
  return {
    folder: publicFolder(folder),
    before: annotate(out.before, info, groups),
    after: annotate(out.after, info, groups),
    summary: diffAces(out.before, out.after, names),
    guards,
    selfRemoval: guards.warnings.length > 0,
    confirmName: confirmNameOf(folder),
    inheritableChanged: Boolean(out.inheritableChanged),
    stale: Boolean(change?.revision && out.before?.revision && change.revision !== out.before.revision),
  };
}

/** What a draft would do (before / after, guards, who loses access). Writes nothing. */
export async function previewChange(req, access, body = {}) {
  requireSuperadmin(access);
  const change = cleanChange(body);
  const folder = await folderOf(body.shareId, body.path);
  const actor = await ntfsActor(req);
  const sids = await actorSids(actor);
  const out = await engineCall(actor, () => deps.acl.previewAcl(actor.engine, folder.target.server, folder.target.share, folder.target.path, change, { actorSids: sids }));
  return previewShape(folder, out, change);
}

/**
 * Writes a draft (explicit entries + protection). Needs the revision the draft
 * was made on (STALE when the folder changed since). Removing one's own access
 * needs `confirmName` = the folder's name. Refused (JOB_RUNNING) while a
 * propagation runs on this folder, above or below it. The previous descriptor
 * (undo copy) is journalled BEFORE the write (journal down → nothing written)
 * and the row completed after; `journalWarning` when completing it failed.
 * Children are not touched: start a propagation when `inheritableChanged`.
 */
export async function applyChange(req, access, body = {}) {
  requireSuperadmin(access);
  const change = cleanChange(body);
  if (!change.revision) throw httpError(400, 'The revision the change was made on is required', 'REVISION_REQUIRED');
  const folder = await folderOf(body.shareId, body.path);
  const actor = await ntfsActor(req);
  const sids = await actorSids(actor);
  const via = body.via === 'fix' ? 'fix' : 'single';
  const ref = refOf(folder);
  const where = [folder.target.server, folder.target.share, folder.target.path];
  const entry = { action: 'ntfs_set', via, group: { dn: null, name: folder.display } };
  let before;
  let result;
  let pendingId = null;
  try {
    deps.acl.refuseWhileJobRuns(...where);
    before = await engineCall(actor, () => deps.acl.getAcl(actor.engine, ...where));
    if (before.revision !== change.revision) throw httpError(409, 'The permissions changed since they were read', 'STALE');
    result = await engineCall(actor, () =>
      deps.acl.setAcl(actor.engine, ...where, change, {
        actorSids: sids,
        confirmSelfRemoval: confirmMatches(folder, body.confirmName),
        onBeforeWrite: async (previous) => {
          pendingId = await startPending(actor.journal, { ...entry, before: undoCopy(ref, previous, before) });
        },
      })
    );
  } catch (err) {
    await journalFailure(actor.journal, pendingId, { ...entry, before: { folder: ref } }, err);
    throw err;
  }
  const [info, groups] = [await sidInfo(sidsOf(before, result.acl)), await groupIndex()];
  const summary = diffAces(before, result.acl, namesOf(info, groups, sidsOf(before, result.acl)));
  const journalled = await finishPending(pendingId, {
    after: { sddl: result.acl?.sddl || null, revision: result.acl?.revision || null, protected: Boolean(result.acl?.protected), summary },
    ok: true,
    outcome: summary.changed ? 'changed' : 'unchanged',
  });
  deps.securityEvent(req, 'folder_ntfs_changed', `${folder.display}: +${summary.added.length} −${summary.removed.length}${summary.protectedBefore !== summary.protectedAfter ? (summary.protectedAfter ? ', inheritance off' : ', inheritance on') : ''}`.slice(0, 200), 'warning');
  return { folder: publicFolder(folder), acl: annotate(result.acl, info, groups), summary, inheritableChanged: Boolean(result.inheritableChanged), journalId: pendingId, journalWarning: !journalled };
}

// ── undo ─────────────────────────────────────────────────────────────────────

const UNDO_MESSAGES = {
  NOT_FOUND: [404, 'Not found'],
  FORBIDDEN: [403, 'Only a superadministrator can do this'],
  FA_UNDO_UNSUPPORTED: [400, 'This change cannot be undone here'],
  FA_UNDO_NOTHING: [400, 'This change did not change anything'],
  FA_UNDO_DONE: [409, 'This change has already been undone'],
};

/**
 * Writes back the descriptor a journalled NTFS change replaced: its explicit
 * entries and protection; when it inherits, the inherited part is the folder's
 * current one (or recomputed from the parent), not the saved copies.
 * When the folder changed since that change, answers 409 STALE with the
 * difference (current → what the undo would write) and the current revision;
 * `force` with that `revision` then restores anyway, still refusing (STALE)
 * when the folder changed again after the difference was shown.
 * Refused (JOB_RUNNING) while a propagation runs on the folder, above or below it.
 * When the restored DACL passes something else down than before, an "inherit"
 * propagation is started (`propagate` false: not), like after Apply: the
 * subfolders and files get the restored inheritable entries.
 */
export async function undoNtfs(req, access, id, { force = false, confirmName = '', revision: expected = null, propagate = true } = {}) {
  requireSuperadmin(access);
  const entry = await deps.journalEntry(id);
  const refusal = ntfsUndoRefusal(access.role, entry);
  if (refusal) {
    const [status, message] = UNDO_MESSAGES[refusal];
    throw httpError(status, message, refusal);
  }
  if (force && !expected) throw httpError(400, 'The revision shown in the difference is required', 'REVISION_REQUIRED');
  const ref = entry.before.folder;
  const saved = entry.before.sd ? { sd: entry.before.sd } : { sddl: entry.before.sddl };
  const confirmFolder = { path: ref.path, title: ref.display };
  const actor = await ntfsActor(req);
  const sids = await actorSids(actor);
  const where = [ref.serverId, ref.share, ref.serverPath];
  // Forced: the revision the person saw in the difference; else the one right after the change.
  const revision = force ? String(expected).slice(0, 200) : entry.after?.revision || null;
  const journalEntryBase = { action: 'ntfs_restore', via: 'undo', group: { dn: null, name: ref.display || ref.path } };
  let current;
  let result;
  let pendingId = null;
  try {
    deps.acl.refuseWhileJobRuns(...where);
    current = await engineCall(actor, () => deps.acl.getAcl(actor.engine, ...where));
    if (!revision || current.revision !== revision) throw httpError(409, 'The permissions changed since this change', 'STALE');
    result = await engineCall(actor, () =>
      deps.acl.restoreAcl(actor.engine, ...where, saved, {
        revision,
        actorSids: sids,
        confirmSelfRemoval: confirmMatches(confirmFolder, confirmName),
        onBeforeWrite: async (previous) => {
          pendingId = await startPending(actor.journal, { ...journalEntryBase, before: undoCopy(ref, previous, current) });
        },
      })
    );
  } catch (err) {
    await journalFailure(actor.journal, pendingId, { ...journalEntryBase, before: { folder: ref }, undoOf: null }, err);
    if (err.code === 'STALE') {
      const preview = await engineCall(actor, () => deps.acl.previewRestore(actor.engine, ...where, saved, { actorSids: sids }));
      const [info, groups] = [await sidInfo(sidsOf(preview.before, preview.after)), await groupIndex()];
      const sidList = sidsOf(preview.before, preview.after);
      const names = namesOf(info, groups, sidList);
      const error = httpError(409, 'The permissions changed since this change', 'STALE');
      error.details = {
        current: annotate(preview.before, info, groups),
        restored: annotate(preview.after, info, groups),
        // Send it back with force: the undo is refused again if the folder changes after this was shown.
        revision: preview.before?.revision || null,
        summary: diffAces(preview.before, preview.after, names),
        guards: namedGuards(preview.guards, names, kindsOf(info, groups, sidList)),
        inheritableChanged: Boolean(preview.inheritableChanged),
        confirmName: confirmNameOf(confirmFolder),
      };
      throw error;
    }
    throw err;
  }
  const [info, groups] = [await sidInfo(sidsOf(current, result.acl)), await groupIndex()];
  const summary = diffAces(current, result.acl, namesOf(info, groups, sidsOf(current, result.acl)));
  const journalled = await finishPending(pendingId, {
    after: { sddl: result.acl?.sddl || null, revision: result.acl?.revision || null, protected: Boolean(result.acl?.protected), summary, forced: Boolean(force) },
    ok: true,
    outcome: 'changed',
    undoOf: entry.id,
  });
  deps.securityEvent(req, 'folder_ntfs_changed', `undo #${entry.id} · ${ref.display || ref.path}`.slice(0, 200), 'warning');
  const folder = { shareId: ref.shareId, path: ref.path, display: ref.display };
  let job = null;
  let propagationError = null;
  if (propagate && result.inheritableChanged && result.acl?.isDir !== false) {
    try {
      job = await deps.acl.startPropagation(actor.engine, ...where, {
        mode: 'inherit',
        sourceAcl: result.acl,
        onFinish: (finished) => recordPropagation(actor.journal, ref, finished, { via: 'undo' }, deps.recordChange),
      });
      jobFolders.set(job.id, { folder });
    } catch (err) {
      // The folder itself is restored: report it, the person can start the propagation by hand.
      propagationError = { code: err?.code || 'SMB_ERROR', message: String(err?.message || '').slice(0, 300) };
    }
  }
  return {
    acl: annotate(result.acl, info, groups),
    summary,
    inheritableChanged: Boolean(result.inheritableChanged),
    journalId: pendingId,
    journalWarning: !journalled,
    folder,
    job: job ? jobView(job) : null,
    propagationError,
  };
}

// ── propagation ──────────────────────────────────────────────────────────────

const jobFolders = new Map();

function jobView(job) {
  if (!job) return null;
  const known = jobFolders.get(job.id);
  return { ...job, folder: known?.folder || { shareId: null, path: job.path, display: job.path || '/' } };
}

/**
 * "Replace all child object permission entries with inheritable permission
 * entries from this folder" as a background job. mode 'inherit' keeps the
 * children's explicit entries, 'replace' removes them: it needs `confirm` and
 * `confirmCount`, the number of objects with explicit entries the person was
 * shown (a dryRun job's progress.withExplicit) — no count, no replace.
 * `marker` resumes, `retry` re-runs a previous job's failed paths.
 */
export async function startPropagationJob(req, access, body = {}) {
  requireSuperadmin(access);
  const mode = body.mode === 'replace' ? 'replace' : 'inherit';
  const dryRun = Boolean(body.dryRun);
  const confirmCount = Number.isInteger(body.confirmCount) && body.confirmCount >= 0 ? body.confirmCount : null;
  if (!dryRun && mode === 'replace' && (body.confirm !== true || confirmCount == null)) {
    throw httpError(400, 'Count the objects with their own permissions first, then confirm that those are removed', 'FA_CONFIRM');
  }
  const folder = await folderOf(body.shareId, body.path);
  const actor = await ntfsActor(req);
  const ref = refOf(folder);
  const retry = Array.isArray(body.retry) ? body.retry.slice(0, 1000).map((item) => String(typeof item === 'string' ? item : item?.path || '')) : null;
  const marker = typeof body.marker === 'string' && body.marker ? body.marker.slice(0, 2000) : null;
  const via = retry ? 'retry' : marker ? 'resume' : 'single';
  const journal = actor.journal;
  const job = await engineCall(actor, () =>
    deps.acl.startPropagation(actor.engine, folder.target.server, folder.target.share, folder.target.path, {
      mode,
      dryRun,
      marker,
      retry,
      onFinish: dryRun ? null : (finished) => recordPropagation(journal, ref, finished, { via, confirmCount }, deps.recordChange),
    })
  );
  jobFolders.set(job.id, { folder: { shareId: folder.shareId, path: folder.path, display: folder.display } });
  if (jobFolders.size > 500) jobFolders.delete(jobFolders.keys().next().value);
  if (!dryRun) deps.securityEvent(req, 'folder_ntfs_changed', `propagation (${mode}) · ${folder.display}`.slice(0, 200), 'warning');
  return jobView(job);
}

export function jobStatus(access, id) {
  requireNtfs(access);
  const job = deps.acl.getJob(String(id), { admin: true });
  if (!job) throw httpError(404, 'Job not found', 'NOT_FOUND');
  return jobView(job);
}

export function jobList(access) {
  requireNtfs(access);
  return deps.acl.listJobs({ admin: true }).map(jobView);
}

export function cancelPropagation(access, id) {
  requireSuperadmin(access);
  return jobView(deps.acl.cancelJob(String(id), { admin: true }));
}

// ── mismatch report ──────────────────────────────────────────────────────────

const reports = new Map();
let runningReport = null;

function reportView(report) {
  if (!report) return null;
  const { promise: _p, cancelled: _c, fatal: _f, ...rest } = report;
  return { ...rest, progress: { ...report.progress } };
}

async function runReport(report, actor, folders, targets, settings) {
  const results = new Map();
  try {
    const queue = [...targets];
    const worker = async () => {
      while (queue.length && !report.cancelled && !report.fatal) {
        const item = queue.shift();
        report.current = item.display;
        try {
          const target = await deps.acl.resolveDriveFolder(item.shareId, item.path);
          results.set(item.key, { acl: await deps.acl.getAcl(actor.engine, target.server, target.share, target.path) });
        } catch (err) {
          if (err?.code === 'AUTH' || err?.code === 'CREDENTIALS_REQUIRED') report.fatal = await engineError(actor, err);
          else results.set(item.key, { error: { code: err?.code || 'ERROR', message: String(err?.message || '').slice(0, 200) } });
        }
        report.progress.done += 1;
      }
    };
    await Promise.all(Array.from({ length: REPORT_CONCURRENCY }, worker));
    if (report.fatal) throw report.fatal;
    const sids = [...results.values()].flatMap((result) => (result.acl?.aces || []).filter((ace) => !ace.inherited).map((ace) => ace.sid)).filter(Boolean);
    const info = await sidInfo([...new Set(sids)]);
    // Without the directory no SID is called unknown; outside a whole-domain search no "remove" fix is offered.
    report.namesUnavailable = Boolean(info.lookupFailed);
    report.partialLookup = !info.lookupFailed && !info.wholeDomain;
    report.rows = computeMismatches({ folders, results, sidInfo: info, typeMap: settings.typeMap, lookup: { ok: !info.lookupFailed, wholeDomain: Boolean(info.wholeDomain) } });
    report.state = report.cancelled ? 'cancelled' : 'done';
  } catch (err) {
    report.state = 'failed';
    report.error = { code: err.code || 'ERROR', message: err.message };
  } finally {
    report.current = null;
    report.finishedAt = new Date().toISOString();
    if (runningReport === report) runningReport = null;
  }
}

/**
 * Starts the mismatch report (or returns the one running): every sg_ group's
 * folder is read with the administrator's own account, two at a time.
 */
export async function startReport(req, access) {
  requireSuperadmin(access);
  if (runningReport) return reportView(runningReport);
  const actor = await ntfsActor(req);
  const [settings, groups] = [await deps.accessSettings(), await deps.loadGroups({ refresh: true })];
  // One row set per group pair (two pairs may open the same folder; it is read once).
  const folders = buildPairs(groups.filter((group) => group.kind === 'sg')).map((pair) => ({ ...pair, folderKey: folderKeyOf(pair) }));
  const targets = new Map();
  for (const folder of folders) {
    if (!folder.shareId || folder.relPath == null) continue;
    const key = folderTargetKey(folder.shareId, folder.relPath);
    if (!targets.has(key)) targets.set(key, { key, shareId: folder.shareId, path: folder.relPath, display: folder.path });
  }
  const report = {
    id: randomUUID(),
    userId: req.user.id,
    state: 'running',
    progress: { done: 0, total: targets.size },
    current: null,
    rows: [],
    namesUnavailable: false,
    partialLookup: false,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelled: false,
    fatal: null,
  };
  reports.set(report.id, report);
  while (reports.size > 5) reports.delete(reports.keys().next().value);
  runningReport = report;
  report.promise = runReport(report, actor, folders, [...targets.values()], settings);
  return reportView(report);
}

/** The report by id, or the latest one. */
export function reportStatus(access, id) {
  requireNtfs(access);
  const report = id ? reports.get(String(id)) : [...reports.values()].pop();
  return reportView(report || null);
}

export function cancelReport(access, id) {
  requireSuperadmin(access); // stopping someone's report is a change: not from a read-only ("sign in as") session
  const report = reports.get(String(id));
  if (!report) throw httpError(404, 'Report not found', 'NOT_FOUND');
  if (!report.finishedAt) report.cancelled = true;
  return reportView(report);
}

/** Tests: wait for a report to finish. */
export async function _waitForReport(id) {
  await reports.get(id)?.promise;
  return reportView(reports.get(id));
}
