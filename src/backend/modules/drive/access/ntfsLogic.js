import { httpError } from '../../shared/acl.js';
import {
  ACE_FLAGS,
  APPLIES_TO,
  PRESETS,
  effectiveRights,
  flagsOf,
  flagsToAppliesTo,
  isInherited,
  mapGeneric,
  normalizePreset,
  presetOf,
  stripAce,
  wellKnownName,
} from '../acl.js';

/*
 * NTFS permissions of «Доступ» — the pure part (no I/O): checking a draft the
 * browser sends, what a change does in words, which journal rows can be
 * undone, and the mismatch report between the sg_ groups and the folders'
 * actual permissions.
 */

export const NTFS_ACTIONS = ['ntfs_set', 'ntfs_restore', 'ntfs_attach', 'ntfs_propagate'];
// Journal rows whose `before` holds a descriptor that can be written back.
export const NTFS_UNDOABLE = ['ntfs_set', 'ntfs_restore', 'ntfs_attach'];

const { OI, CI, INHERITED } = ACE_FLAGS;
const SID_RE = /^S-1-\d+(-\d+){1,14}$/;
const MAX_ACES = 300;

export const isSid = (value) => SID_RE.test(String(value || ''));

/**
 * The explicit ACEs of a draft as the engine takes them. Refuses inherited
 * entries, bad SIDs, masks and flags. "other" ACEs (types the editor cannot
 * show) pass through untouched, as they were read.
 */
export function cleanDraftAces(aces) {
  if (!Array.isArray(aces)) throw httpError(400, 'The permission list is missing', 'BAD_ACL');
  if (aces.length > MAX_ACES) throw httpError(400, 'Too many permission entries', 'BAD_ACL');
  return aces.map((ace) => {
    if (!ace || typeof ace !== 'object') throw httpError(400, 'A permission entry is malformed', 'BAD_ACL');
    const flags = flagsOf(ace.flags ?? 0);
    if (flags & INHERITED || ace.inherited) throw httpError(400, 'Inherited entries cannot be edited', 'BAD_ACL');
    if (ace.type === 'other') {
      if (typeof ace.raw !== 'string' || !/^[A-Za-z0-9+/=]{0,8000}$/.test(ace.raw)) throw httpError(400, 'A permission entry is malformed', 'BAD_ACL');
      return stripAce({ ...ace, flags });
    }
    if (ace.type !== 'allow' && ace.type !== 'deny') throw httpError(400, 'A permission entry is malformed', 'BAD_ACL');
    if (!isSid(ace.sid)) throw httpError(400, 'A permission entry has no valid SID', 'BAD_SID');
    const mask = Number(ace.mask);
    if (!Number.isInteger(mask) || mask <= 0 || mask > 0xffffffff) throw httpError(400, 'A permission entry has no rights', 'BAD_ACL');
    return stripAce({ type: ace.type, sid: ace.sid, mask, flags });
  });
}

/** A change body for previewAcl / setAcl from what the browser sent. */
export function cleanChange(body = {}) {
  const inherit = ['auto', 'keep', 'parent'].includes(body.inherit) ? body.inherit : 'auto';
  return {
    revision: typeof body.revision === 'string' ? body.revision.slice(0, 200) : null,
    aces: cleanDraftAces(body.aces),
    protected: Boolean(body.protected),
    inherit,
  };
}

/** The name a person types to confirm removing their own access: the folder's last segment (or the share title at the root). */
export function confirmNameOf(folder) {
  const parts = String(folder.path || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(folder.title || folder.share || '');
}

export const confirmMatches = (folder, typed) => {
  const expected = confirmNameOf(folder).trim().toLowerCase();
  return Boolean(expected) && String(typed || '').trim().toLowerCase() === expected;
};

/**
 * How a folder is shown: its share's first path prefix + the path ("G:\ПРБ-2\_DocArch\10-BUH",
 * "W:\06-HR"), else "\\host\share\path". `letter` (a bare drive letter) is the older form of `prefix`.
 */
export function folderDisplay({ prefix, letter, host, share, rootPath = '', path = '' }) {
  const inside = String(path || '').split('/').filter(Boolean).join('\\');
  const head = prefix ? String(prefix).trim().replace(/\//g, '\\').replace(/\\+$/, '') : letter ? `${letter}:` : null;
  if (head) return `${head}${inside ? `\\${inside}` : ''}`;
  const root = [String(rootPath || '').split('/').filter(Boolean).join('\\'), inside].filter(Boolean).join('\\');
  return `\\\\${host}\\${share}${root ? `\\${root}` : ''}`;
}

const aceKey = (ace) => `${ace.type}|${ace.sid || ''}|${mapGeneric(ace.mask || 0)}|${flagsOf(ace.flags) & ~INHERITED}|${ace.raw || ''}`;

function aceWords(ace, names = {}) {
  const flags = flagsOf(ace.flags);
  return {
    type: ace.type,
    sid: ace.sid || null,
    name: (ace.sid && (names[ace.sid] || wellKnownName(ace.sid))) || null,
    preset: ace.type === 'other' ? 'special' : presetOf(ace.mask, flags),
    appliesTo: flagsToAppliesTo(flags).appliesTo,
  };
}

function aceDiff(beforeList, afterList, names) {
  const count = (list) => {
    const map = new Map();
    for (const ace of list) map.set(aceKey(ace), [...(map.get(aceKey(ace)) || []), ace]);
    return map;
  };
  const was = count(beforeList);
  const now = count(afterList);
  const added = [];
  const removed = [];
  for (const [key, list] of now) {
    const extra = list.length - (was.get(key)?.length || 0);
    for (let i = 0; i < extra; i += 1) added.push(aceWords(list[i], names));
  }
  for (const [key, list] of was) {
    const extra = list.length - (now.get(key)?.length || 0);
    for (let i = 0; i < extra; i += 1) removed.push(aceWords(list[i], names));
  }
  return { added, removed };
}

/**
 * What a change does, in words for the journal and the confirmation:
 * { added, removed (explicit entries), inheritedAdded, inheritedRemoved
 *   (inherited entries, e.g. recomputed from the parent), protectedBefore, protectedAfter, changed }.
 */
export function diffAces(before, after, names = {}) {
  const pick = (acl, inherited) => (acl?.aces || []).filter((ace) => isInherited(ace) === inherited);
  const { added, removed } = aceDiff(pick(before, false), pick(after, false), names);
  const inherited = aceDiff(pick(before, true), pick(after, true), names);
  const protectedBefore = Boolean(before?.protected);
  const protectedAfter = Boolean(after?.protected);
  return {
    added,
    removed,
    inheritedAdded: inherited.added,
    inheritedRemoved: inherited.removed,
    protectedBefore,
    protectedAfter,
    changed: added.length > 0 || removed.length > 0 || inherited.added.length > 0 || inherited.removed.length > 0 || protectedBefore !== protectedAfter,
  };
}

/** Why a journal row cannot be undone in the NTFS mode (null = it can). Superadministrators only. */
export function ntfsUndoRefusal(role, entry) {
  if (!entry) return 'NOT_FOUND';
  if (role !== 'superadmin') return 'FORBIDDEN';
  if (!NTFS_UNDOABLE.includes(entry.action)) return 'FA_UNDO_UNSUPPORTED';
  // 'pending': the undo copy was journalled but the write's outcome was never recorded
  // (the change may or may not have happened): undo goes through the "changed since" diff.
  if (!entry.ok || (entry.outcome !== 'changed' && entry.outcome !== 'pending')) return 'FA_UNDO_NOTHING';
  if (entry.undone_by) return 'FA_UNDO_DONE';
  const before = entry.before || {};
  if (!before.folder || !(before.sd || before.sddl)) return 'FA_UNDO_UNSUPPORTED';
  return null;
}

/** Removes the raw descriptor (base64) from a journal JSON for lists and CSV; it stays in the table for undo. */
export function withoutBlob(value) {
  if (!value || typeof value !== 'object' || !('sd' in value)) return value;
  const { sd, ...rest } = value;
  return { ...rest, hasSd: Boolean(sd) };
}

// ── Mismatch report ──────────────────────────────────────────────────────────

const SCOPES = ['this', 'subfolders', 'files'];

/** The preset an access type should have on its folder: typeMap { full: 'modify', read: 'read_execute' }. */
export function expectedPreset(type, typeMap = {}) {
  const fallback = type === 'full' ? 'modify' : 'readExecute';
  try {
    return normalizePreset(typeMap[type] || fallback);
  } catch {
    return fallback;
  }
}

/**
 * How one group's entries on a folder compare to the preset it should have.
 * → null when they match, else { issue, actual, missingScopes, extraMask, inherited, explicit,
 *   explicitCovers (rights_too_high: the excess comes from explicit entries only),
 *   explicitDenyOnly (deny_ace: every deny is explicit) }.
 */
export function checkGroupAces(aces, sid, preset) {
  const mine = (aces || []).filter((ace) => ace.sid === sid && (ace.type === 'allow' || ace.type === 'deny'));
  const allows = mine.filter((ace) => ace.type === 'allow');
  const denies = mine.filter((ace) => ace.type === 'deny');
  const explicit = mine.some((ace) => !isInherited(ace));
  if (!allows.length) return { issue: 'missing_ace', explicit, inherited: false, deny: denies.length > 0 };
  const expected = PRESETS[preset];
  const rights = effectiveRights(allows).get(sid);
  const union = SCOPES.reduce((acc, scope) => (acc | rights[scope].allow) >>> 0, 0);
  const extraMask = (union & ~expected.mask) >>> 0;
  // Every scope the preset reaches ("this folder, subfolders and files" for OI|CI) must have all its rights.
  const wanted = expected.flags & OI && expected.flags & CI ? SCOPES : expected.flags & CI ? ['this', 'subfolders'] : ['this'];
  const missingScopes = wanted.filter((scope) => (expected.mask & ~rights[scope].allow) >>> 0);
  const inherited = allows.every((ace) => isInherited(ace));
  const actual = presetOf(union, OI | CI);
  if (denies.length) {
    return { issue: 'deny_ace', actual, explicit: denies.some((ace) => !isInherited(ace)), inherited: denies.every((ace) => isInherited(ace)), explicitDenyOnly: denies.every((ace) => !isInherited(ace)) };
  }
  if (extraMask) {
    // Replacing the explicit allows fixes it only when the inherited ones give nothing beyond the preset.
    const inheritedAllows = allows.filter((ace) => isInherited(ace));
    const inheritedRights = inheritedAllows.length ? effectiveRights(inheritedAllows).get(sid) : null;
    const inheritedUnion = inheritedRights ? SCOPES.reduce((acc, scope) => (acc | inheritedRights[scope].allow) >>> 0, 0) : 0;
    const explicitCovers = allows.some((ace) => !isInherited(ace)) && !((inheritedUnion & ~expected.mask) >>> 0);
    return { issue: 'rights_too_high', actual, extraMask, missingScopes, explicit, inherited, explicitCovers };
  }
  if (missingScopes.length) return { issue: 'rights_too_low', actual, missingScopes, explicit, inherited };
  return null;
}

const ROW_ORDER = ['folder_not_found', 'unreadable', 'path_unmapped', 'no_sid', 'missing_ace', 'rights_too_high', 'deny_ace', 'rights_too_low', 'user_ace', 'unknown_sid'];

export const folderTargetKey = (shareId, path) => `${shareId}:${String(path || '').toLowerCase()}`;

/**
 * The mismatch report (pure).
 *   folders  sg_ group pairs (naming.buildPairs) with shareId / relPath / path and groups { full, read };
 *            `folderKey` (the folder card's key) when set, else `key`
 *   results  Map folderTargetKey(shareId, relPath) → { acl } | { error: { code, message } }
 *   sidInfo  Map sid → { name, kind } for SIDs the directory knows (users, groups, computers)
 *   typeMap  access type → preset (module setting)
 *   lookup   { ok, wholeDomain }: did the SID lookup work, and did it search the whole
 *            domain? Without ok no SID is called unknown (the names are just unavailable);
 *            without wholeDomain an unknown SID gets no "remove" fix (it may live outside the search base).
 * Rows: { key, issue, folder: { key, shareId, path, display }, group?, subject?, expected?, actual?, inherited?, fix? }.
 * `fix` is a draft step the NTFS editor applies (never applied here):
 *   { op: 'add', sid, preset, appliesTo } | { op: 'set', sid, preset } | { op: 'remove', sid } | { op: 'removeDeny', sid }
 * A row gets no fix when no draft step would make it right (e.g. the excess or the deny is inherited).
 */
export function computeMismatches({ folders = [], results = new Map(), sidInfo = new Map(), typeMap = {}, lookup = { ok: true, wholeDomain: true } } = {}) {
  const rows = [];
  const seenTargets = new Set();
  // Every folder group is a known directory object, whether or not the SID lookup returned it.
  const groupSids = new Set(folders.flatMap((folder) => Object.values(folder.groups || {}).map((group) => group?.sid)).filter(Boolean));
  const nameOf = (sid) => sidInfo.get(sid)?.name || wellKnownName(sid) || null;
  for (const folder of folders) {
    if (folder.kind !== 'sg') continue;
    const groups = ['full', 'read'].map((type) => folder.groups?.[type] && { ...folder.groups[type], type }).filter(Boolean);
    const where = { key: folder.folderKey || folder.key, shareId: folder.shareId ?? null, path: folder.relPath ?? null, display: folder.path || null, project: folder.project || null };
    const push = (row) => rows.push({ key: `${folder.key}|${row.issue}|${row.group?.name || row.subject?.sid || ''}`, folder: where, ...row });
    const groupRef = (group) => ({ name: group.name, dn: group.dn, sid: group.sid || null, type: group.type });
    if (!folder.shareId || folder.relPath == null) {
      if (folder.path) push({ issue: 'path_unmapped' });
      continue;
    }
    const target = folderTargetKey(folder.shareId, folder.relPath);
    const result = results.get(target);
    if (!result) continue;
    if (result.error) {
      push({ issue: result.error.code === 'NOT_FOUND' ? 'folder_not_found' : 'unreadable', errorCode: result.error.code || null });
      continue;
    }
    const aces = result.acl?.aces || [];
    for (const group of groups) {
      if (!group.sid) {
        push({ issue: 'no_sid', group: groupRef(group) });
        continue;
      }
      const preset = expectedPreset(group.type, typeMap);
      const found = checkGroupAces(aces, group.sid, preset);
      if (!found) continue;
      let fix = null;
      if (found.issue === 'missing_ace') fix = { op: 'add', sid: group.sid, preset, appliesTo: 'thisSubfoldersFiles', name: group.name };
      else if (found.issue === 'deny_ace') fix = found.explicitDenyOnly ? { op: 'removeDeny', sid: group.sid, name: group.name } : null;
      else if (found.issue === 'rights_too_high') fix = found.explicitCovers ? { op: 'set', sid: group.sid, preset, name: group.name } : null;
      else if (found.issue === 'rights_too_low') fix = { op: 'set', sid: group.sid, preset, name: group.name };
      push({ issue: found.issue, group: groupRef(group), expected: preset, actual: found.actual || null, inherited: Boolean(found.inherited), missingScopes: found.missingScopes || [], fix });
    }
    // Folder-level checks once per folder (two folder entries may name the same path).
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    const subjects = new Map();
    for (const ace of aces) {
      if (isInherited(ace) || !ace.sid || subjects.has(ace.sid)) continue;
      subjects.set(ace.sid, ace);
    }
    for (const sid of subjects.keys()) {
      const info = sidInfo.get(sid);
      if (info?.kind === 'user') push({ issue: 'user_ace', subject: { sid, name: info.name, login: info.login || null }, fix: { op: 'remove', sid, name: info.name } });
      else if (lookup.ok && !info && !groupSids.has(sid) && !wellKnownName(sid)) {
        push({ issue: 'unknown_sid', subject: { sid, name: null }, fix: lookup.wholeDomain ? { op: 'remove', sid, name: sid } : null });
      }
    }
  }
  return rows
    .map((row) => (row.subject && !row.subject.name ? { ...row, subject: { ...row.subject, name: nameOf(row.subject.sid) } } : row))
    .sort((a, b) => String(a.folder.display || '').localeCompare(String(b.folder.display || '')) || ROW_ORDER.indexOf(a.issue) - ROW_ORDER.indexOf(b.issue));
}

/**
 * A fix step applied to a list of explicit ACEs (the editor uses the same logic in the browser):
 * add → an allow entry with the preset; set → the SID's explicit allow entries replaced by one;
 * remove → every explicit entry of the SID gone; removeDeny → the SID's explicit deny entries gone.
 */
export function applyFix(explicitAces, fix) {
  const list = (explicitAces || []).filter((ace) => !isInherited(ace)).map(stripAce);
  if (!fix || !isSid(fix.sid)) return list;
  if (fix.op === 'remove') return list.filter((ace) => ace.sid !== fix.sid);
  if (fix.op === 'removeDeny') return list.filter((ace) => !(ace.sid === fix.sid && ace.type === 'deny'));
  const preset = PRESETS[normalizePreset(fix.preset)];
  const flags = fix.appliesTo ? APPLIES_TO[fix.appliesTo] ?? preset.flags : preset.flags;
  const entry = { type: 'allow', sid: fix.sid, mask: preset.mask, flags };
  if (fix.op === 'set') {
    const at = list.findIndex((ace) => ace.sid === fix.sid && ace.type === 'allow');
    const rest = list.filter((ace) => !(ace.sid === fix.sid && ace.type === 'allow'));
    rest.splice(at < 0 ? rest.length : Math.min(at, rest.length), 0, entry);
    return rest;
  }
  if (fix.op === 'add') return [...list, entry];
  return list;
}
