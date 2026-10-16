import { randomUUID } from 'crypto';
import { query } from '../../config/database.js';
import { httpError, intId } from '../shared/acl.js';
import { credentialFor, parkCredential, serverParams } from './credentials.js';
import { gateRequest } from './gate.js';
import { cleanPath, joinPath } from './paths.js';
import { loadServer } from './servers.js';

/*
 * NTFS permissions of folders on the file servers, through the SMB gateway
 * (gateway/smbgate.py: acl_get, acl_set, acl_restore, acl_propagate; the
 * descriptor logic lives in gateway/ntacl.py). See docs/ntfs-permissions.md.
 *
 * Every call runs with the acting administrator's OWN domain credentials:
 *   actor = userId              → the person's drive credential (credentialFor),
 *                                 refused when it would be the server's service account;
 *   actor = { userId, credential: { username, domain, password } }
 *                               → that credential as is (the access section passes its own).
 * Windows decides; codes the callers get:
 *   ACCESS_DENIED (403)  no right to read / change permissions (READ_CONTROL / WRITE_DAC)
 *   STALE (409)          the permissions changed since they were read (re-read, show diff)
 *   NOT_FOUND (404)      folder or share not found
 *   AUTH (403)           the server rejected the credential (details.reason = AUTH_FAILED, ACCOUNT_LOCKED…)
 *   CREDENTIALS_REQUIRED (403) no personal credential for this server
 *   PROTECTED_PRINCIPAL (422)  the change would take access away from SYSTEM / Administrators
 *   EMPTY_DACL (422)     the change would leave an empty DACL (nobody could open the folder)
 *   UNSAFE_SOURCE (422)  propagation refused: the folder has a NULL DACL or passes no
 *                        access down to SYSTEM / Administrators
 *   CONFIRM_SELF_REMOVAL (409) the change removes the actor's own access and was not confirmed
 *   JOB_RUNNING (409)    a propagation already runs on this folder (or above / below it)
 *   BAD_ACL, NO_PARENT, SERVER_UNREACHABLE, GATEWAY_DOWN … passed through
 */

// ── Pure helpers ────────────────────────────────────────────────────────────

export const ACE_FLAGS = Object.freeze({ OI: 0x01, CI: 0x02, NP: 0x04, IO: 0x08, INHERITED: 0x10 });
const { OI, CI, NP, IO, INHERITED } = ACE_FLAGS;

export const SID = Object.freeze({
  SYSTEM: 'S-1-5-18',
  ADMINISTRATORS: 'S-1-5-32-544',
  USERS: 'S-1-5-32-545',
  EVERYONE: 'S-1-1-0',
  AUTHENTICATED_USERS: 'S-1-5-11',
  CREATOR_OWNER: 'S-1-3-0',
  CREATOR_GROUP: 'S-1-3-1',
});

/** Rights presets as in the Windows "Security" tab. */
export const PRESETS = Object.freeze({
  full: { mask: 0x1f01ff, flags: OI | CI },
  modify: { mask: 0x1301bf, flags: OI | CI },
  readExecute: { mask: 0x1200a9, flags: OI | CI },
  listFolder: { mask: 0x1200a9, flags: CI }, // read & execute on folders only
  read: { mask: 0x120089, flags: OI | CI },
  write: { mask: 0x100116, flags: OI | CI },
});

const PRESET_ALIASES = {
  full_control: 'full',
  fullcontrol: 'full',
  read_execute: 'readExecute',
  readexecute: 'readExecute',
  list: 'listFolder',
  list_folder: 'listFolder',
  listfolder: 'listFolder',
};

export function normalizePreset(name) {
  const key = String(name || '').trim();
  if (PRESETS[key]) return key;
  const alias = PRESET_ALIASES[key.toLowerCase()] || Object.keys(PRESETS).find((p) => p.toLowerCase() === key.toLowerCase());
  if (!alias) throw httpError(400, `Unknown rights preset "${key}"`, 'BAD_PRESET');
  return alias;
}

export function presetMask(name) {
  return PRESETS[normalizePreset(name)].mask;
}

const GENERIC = { all: 0x10000000, execute: 0x20000000, write: 0x40000000, read: 0x80000000 };

/** Generic rights (GA/GR/GW/GX) → the specific file rights Windows maps them to. */
export function mapGeneric(mask) {
  let out = (mask & ~0xf0000000) >>> 0;
  if (mask & GENERIC.all) out |= 0x1f01ff;
  if (mask & GENERIC.read) out |= 0x120089;
  if (mask & GENERIC.write) out |= 0x120116;
  if (mask & GENERIC.execute) out |= 0x1200a0;
  return out >>> 0;
}

/** The preset an ACE corresponds to, or 'special'. */
export function presetOf(mask, flags = OI | CI) {
  const specific = mapGeneric(mask);
  const scope = flags & (OI | CI);
  if (specific === PRESETS.readExecute.mask && scope === CI) return 'listFolder';
  for (const name of ['full', 'modify', 'readExecute', 'read', 'write']) {
    if (specific === PRESETS[name].mask) return name;
  }
  return 'special';
}

/** Presets fully contained in a mask — the boxes Windows shows ticked (Modify ⇒ R&E, Read, Write). */
export function includedPresets(mask) {
  const specific = mapGeneric(mask);
  return ['full', 'modify', 'readExecute', 'read', 'write'].filter((name) => (specific & PRESETS[name].mask) === PRESETS[name].mask);
}

/** "Applies to" choices of the Windows advanced dialog. */
export const APPLIES_TO = Object.freeze({
  this: 0,
  thisSubfoldersFiles: OI | CI,
  thisSubfolders: CI,
  thisFiles: OI,
  subfoldersFiles: OI | CI | IO,
  subfolders: CI | IO,
  files: OI | IO,
});

export function appliesToFlags(appliesTo, { noPropagate = false } = {}) {
  if (!(appliesTo in APPLIES_TO)) throw httpError(400, `Unknown "applies to" value "${appliesTo}"`, 'BAD_ACL');
  const flags = APPLIES_TO[appliesTo];
  // "Only apply these permissions to objects within this container" means nothing without inheritance.
  return noPropagate && flags & (OI | CI) ? flags | NP : flags;
}

export function flagsToAppliesTo(flags) {
  const key = flags & (OI | CI | IO);
  const appliesTo = Object.keys(APPLIES_TO).find((name) => APPLIES_TO[name] === key) || (key === IO ? 'none' : 'this');
  return { appliesTo, noPropagate: Boolean(flags & NP), inherited: Boolean(flags & INHERITED) };
}

/** Flags from a number or names (OI, CI, NP, IO, INHERITED/ID). */
export function flagsOf(value) {
  if (typeof value === 'number') return value & 0xff;
  let out = 0;
  for (const name of value || []) {
    const bit = name === 'ID' ? INHERITED : ACE_FLAGS[String(name).toUpperCase()];
    if (bit === undefined) throw httpError(400, `Unknown ACE flag ${name}`, 'BAD_ACL');
    out |= bit;
  }
  return out;
}

export const isInherited = (ace) => Boolean(flagsOf(ace.flags) & INHERITED);

function rank(ace) {
  if (isInherited(ace)) return 2;
  return ace.type === 'deny' ? 0 : 1;
}

/** Canonical order: explicit deny, explicit allow, inherited (stable inside each group). */
export function canonicalize(aces) {
  return aces
    .map((ace, index) => ({ ace, index }))
    .sort((a, b) => rank(a.ace) - rank(b.ace) || a.index - b.index)
    .map((item) => item.ace);
}

export function isCanonical(aces) {
  const ranks = aces.map(rank);
  return ranks.every((value, i) => i === 0 || ranks[i - 1] <= value);
}

const WELL_KNOWN = {
  'S-1-0-0': 'Nobody',
  'S-1-1-0': 'Everyone',
  'S-1-3-0': 'CREATOR OWNER',
  'S-1-3-1': 'CREATOR GROUP',
  'S-1-3-4': 'OWNER RIGHTS',
  'S-1-5-2': 'NETWORK',
  'S-1-5-4': 'INTERACTIVE',
  'S-1-5-7': 'ANONYMOUS LOGON',
  'S-1-5-9': 'Enterprise Domain Controllers',
  'S-1-5-10': 'SELF',
  'S-1-5-11': 'Authenticated Users',
  'S-1-5-18': 'SYSTEM',
  'S-1-5-19': 'LOCAL SERVICE',
  'S-1-5-20': 'NETWORK SERVICE',
  'S-1-5-32-544': 'Administrators',
  'S-1-5-32-545': 'Users',
  'S-1-5-32-546': 'Guests',
  'S-1-5-32-547': 'Power Users',
  'S-1-5-32-548': 'Account Operators',
  'S-1-5-32-549': 'Server Operators',
  'S-1-5-32-550': 'Print Operators',
  'S-1-5-32-551': 'Backup Operators',
  'S-1-5-32-555': 'Remote Desktop Users',
  'S-1-15-2-1': 'ALL APPLICATION PACKAGES',
  'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464': 'TrustedInstaller',
};

const DOMAIN_RIDS = {
  500: 'Administrator',
  501: 'Guest',
  512: 'Domain Admins',
  513: 'Domain Users',
  514: 'Domain Guests',
  515: 'Domain Computers',
  516: 'Domain Controllers',
  518: 'Schema Admins',
  519: 'Enterprise Admins',
  520: 'Group Policy Creator Owners',
};

/** Display name of a well-known SID (built-in or a domain's well-known RID), else null. */
export function wellKnownName(sid) {
  const text = String(sid || '');
  if (WELL_KNOWN[text]) return WELL_KNOWN[text];
  const match = /^S-1-5-21-\d+-\d+-\d+-(\d+)$/.exec(text);
  return match ? DOMAIN_RIDS[match[1]] || null : null;
}

export function sidName(sid, names = {}) {
  return names[sid] || wellKnownName(sid) || null;
}

/**
 * Rights per SID and scope from a DACL:
 *   this       ACEs that apply to the folder itself (not inherit-only)
 *   subfolders ACEs that reach child folders (CI)
 *   files      ACEs that reach files (OI)
 * effective = allow & ~deny (group membership is not resolved here).
 */
export function effectiveRights(aces) {
  const out = new Map();
  for (const ace of aces || []) {
    if (ace.type !== 'allow' && ace.type !== 'deny') continue;
    const flags = flagsOf(ace.flags);
    const mask = mapGeneric(ace.mask || 0);
    const entry = out.get(ace.sid) || { this: { allow: 0, deny: 0 }, subfolders: { allow: 0, deny: 0 }, files: { allow: 0, deny: 0 } };
    const scopes = [];
    if (!(flags & IO)) scopes.push('this');
    if (flags & CI) scopes.push('subfolders');
    if (flags & OI) scopes.push('files');
    for (const scope of scopes) entry[scope][ace.type] = (entry[scope][ace.type] | mask) >>> 0;
    out.set(ace.sid, entry);
  }
  for (const entry of out.values()) {
    for (const scope of ['this', 'subfolders', 'files']) entry[scope].effective = (entry[scope].allow & ~entry[scope].deny) >>> 0;
  }
  return out;
}

const SCOPES = ['this', 'subfolders', 'files'];

/**
 * Who loses rights between two DACLs: [{ sid, name, lost: {this, subfolders, files}, before, after, losesAll, deny }].
 * losesAll = had some right on the folder itself and has none after.
 * A new or widened deny is listed too, even for a SID without an entry before
 * (deny: true): the members of that group (or that account) lose those rights
 * whatever else grants them.
 */
export function accessLoss(beforeAces, afterAces, names = {}) {
  const before = effectiveRights(beforeAces);
  const after = effectiveRights(afterAces);
  const out = [];
  for (const sid of new Set([...before.keys(), ...after.keys()])) {
    const prev = before.get(sid);
    const next = after.get(sid);
    const lost = {};
    const was = {};
    const now = {};
    let any = false;
    let denied = false;
    for (const scope of SCOPES) {
      was[scope] = prev ? prev[scope].effective : 0;
      now[scope] = next ? next[scope].effective : 0;
      const newDeny = ((next ? next[scope].deny : 0) & ~(prev ? prev[scope].deny : 0)) >>> 0;
      if (newDeny) denied = true;
      lost[scope] = ((was[scope] & ~now[scope]) | newDeny) >>> 0;
      if (lost[scope]) any = true;
    }
    if (!any) continue;
    const deniedAll = denied && (((next?.this.deny || 0) & FULL) >>> 0) === FULL;
    out.push({ sid, name: sidName(sid, names), lost, before: was, after: now, losesAll: (Boolean(was.this) && !now.this) || deniedAll, deny: denied });
  }
  return out;
}

/**
 * Rights of one person per scope from a DACL, through all their SIDs (own SID
 * and every group): everything any of them is allowed minus everything any
 * of them is denied.
 */
export function actorRights(aces, actorSids = []) {
  const mine = new Set(actorSids);
  const allow = { this: 0, subfolders: 0, files: 0 };
  const deny = { this: 0, subfolders: 0, files: 0 };
  for (const ace of aces || []) {
    if ((ace.type !== 'allow' && ace.type !== 'deny') || !mine.has(ace.sid)) continue;
    const flags = flagsOf(ace.flags);
    const mask = mapGeneric(ace.mask || 0);
    const target = ace.type === 'allow' ? allow : deny;
    if (!(flags & IO)) target.this = (target.this | mask) >>> 0;
    if (flags & CI) target.subfolders = (target.subfolders | mask) >>> 0;
    if (flags & OI) target.files = (target.files | mask) >>> 0;
  }
  return Object.fromEntries(SCOPES.map((scope) => [scope, (allow[scope] & ~deny[scope]) >>> 0]));
}

/** Did `sid` lose any right (in any scope)? */
export function losesAccess(beforeAces, afterAces, sid) {
  return accessLoss(beforeAces, afterAces).some((entry) => entry.sid === sid);
}

export const GUARDED_SIDS = Object.freeze([SID.SYSTEM, SID.ADMINISTRATORS]);

/** Groups SYSTEM and every administrator are always in: their allow ACEs count for the guarded SIDs. */
const ALLOW_UMBRELLA = new Set([SID.EVERYONE, SID.AUTHENTICATED_USERS]);
/** Groups an administrator may be in: their deny ACEs count against the guarded SIDs. */
const DENY_UMBRELLA = new Set([SID.EVERYONE, SID.AUTHENTICATED_USERS, SID.USERS]);
const DOMAIN_USERS = /^S-1-5-21-\d+-\d+-\d+-513$/;

export const isDenyUmbrella = (sid) => DENY_UMBRELLA.has(sid) || DOMAIN_USERS.test(String(sid || ''));

const FULL = 0x1f01ff;

/**
 * Rights of SYSTEM and Administrators per scope, counting what reaches them
 * through umbrella groups: allow ACEs for the SID itself, Everyone or
 * Authenticated Users; deny ACEs for the SID itself, Everyone, Authenticated
 * Users, Users or Domain Users. `nullDacl` = no DACL at all = Everyone: Full Control.
 * Same rules as ntacl.guarded_rights in the gateway.
 */
export function guardedRights(aces, { nullDacl = false } = {}) {
  const out = {};
  for (const sid of GUARDED_SIDS) {
    const allow = { this: 0, subfolders: 0, files: 0 };
    const deny = { this: 0, subfolders: 0, files: 0 };
    if (nullDacl) {
      out[sid] = { this: FULL, subfolders: FULL, files: FULL };
      continue;
    }
    for (const ace of aces || []) {
      if (ace.type === 'allow' && ace.sid !== sid && !ALLOW_UMBRELLA.has(ace.sid)) continue;
      if (ace.type === 'deny' && ace.sid !== sid && !isDenyUmbrella(ace.sid)) continue;
      if (ace.type !== 'allow' && ace.type !== 'deny') continue;
      const flags = flagsOf(ace.flags);
      const mask = mapGeneric(ace.mask || 0);
      const target = ace.type === 'allow' ? allow : deny;
      if (!(flags & IO)) target.this = (target.this | mask) >>> 0;
      if (flags & CI) target.subfolders = (target.subfolders | mask) >>> 0;
      if (flags & OI) target.files = (target.files | mask) >>> 0;
    }
    out[sid] = Object.fromEntries(SCOPES.map((scope) => [scope, (allow[scope] & ~deny[scope]) >>> 0]));
  }
  return out;
}

/**
 * Guard errors of replacing one DACL by another (same rules as
 * ntacl.guard_problems): EMPTY_DACL, or PROTECTED_PRINCIPAL when SYSTEM /
 * Administrators lose any right they had in any scope (for a file: on the
 * file itself), umbrella denies and a NULL DACL before included.
 */
export function guardErrors(beforeAces, afterAces, { beforeNull = false, afterNull = false, isDir = true, names = {} } = {}) {
  if (!afterNull && !(afterAces || []).length) return [{ code: 'EMPTY_DACL' }];
  const before = guardedRights(beforeAces, { nullDacl: beforeNull });
  const after = guardedRights(afterAces, { nullDacl: afterNull });
  const scopes = isDir === false ? ['this'] : SCOPES;
  const errors = [];
  for (const sid of GUARDED_SIDS) {
    const lost = {};
    let any = false;
    for (const scope of SCOPES) {
      lost[scope] = scopes.includes(scope) ? (before[sid][scope] & ~after[sid][scope]) >>> 0 : 0;
      if (lost[scope]) any = true;
    }
    if (any) errors.push({ code: 'PROTECTED_PRINCIPAL', sid, name: sidName(sid, names), lost });
  }
  return errors;
}

/**
 * Why a folder's DACL may not be propagated: NULL_DACL, or NOT_INHERITABLE
 * when SYSTEM or Administrators get no allow reaching child folders and files.
 */
export function propagationSourceProblems(acl) {
  if (!acl || acl.nullDacl) return [{ code: 'NULL_DACL' }];
  const rights = guardedRights(acl.aces);
  const out = [];
  for (const sid of GUARDED_SIDS) {
    for (const scope of ['subfolders', 'files']) if (!rights[sid][scope]) out.push({ code: 'NOT_INHERITABLE', sid, scope });
  }
  return out;
}

/**
 * Safety checks of a change:
 *   errors   PROTECTED_PRINCIPAL — SYSTEM or Administrators would lose rights, directly or
 *            through a deny for an umbrella group (Everyone, Authenticated Users, Users,
 *            Domain Users); a NULL DACL before counts as Everyone: Full Control (refused);
 *            EMPTY_DACL — the new DACL has no entries (refused);
 *   warnings SELF_ACCESS_REMOVED — the admin loses rights, counted over all of `actorSids`
 *            (their own SID and every group: allows minus denies), so a deny for one of their
 *            groups counts and a removed group entry does not when another one still grants it
 *            (allowed after an explicit confirmation: type the folder name).
 * options.beforeNull / afterNull: the DACL is NULL; options.isDir false: a file.
 */
export function checkGuards(beforeAces, afterAces, { actorSids = [], names = {}, beforeNull = false, afterNull = false, isDir = true } = {}) {
  const loss = accessLoss(beforeAces, afterAces, names);
  const errors = guardErrors(beforeAces, afterAces, { beforeNull, afterNull, isDir, names });
  const warnings = [];
  if (actorSids.length) {
    // The person keeps access through any of their SIDs: compare all of them together (allows minus denies).
    const was = actorRights(beforeAces, actorSids);
    const now = actorRights(afterAces, actorSids);
    const lost = Object.fromEntries(SCOPES.map((scope) => [scope, (was[scope] & ~now[scope]) >>> 0]));
    if (SCOPES.some((scope) => lost[scope])) {
      const mine = new Set(actorSids);
      const own = loss.filter((entry) => mine.has(entry.sid));
      if (own.length) warnings.push(...own.map((entry) => ({ code: 'SELF_ACCESS_REMOVED', sid: entry.sid, name: entry.name, lost: entry.lost, actorLost: lost })));
      else warnings.push({ code: 'SELF_ACCESS_REMOVED', sid: null, name: null, lost, actorLost: lost });
    }
  }
  return { ok: errors.length === 0, errors, warnings, loss };
}

/** Explicit ACEs after "Disable inheritance": convert inherited into explicit, or remove them. */
export function disableInheritanceAces(aces, mode = 'convert') {
  if (mode !== 'convert' && mode !== 'remove') throw httpError(400, 'Unknown mode', 'BAD_ACL');
  const explicit = aces.filter((ace) => !isInherited(ace)).map(stripAce);
  if (mode === 'remove') return canonicalize(explicit);
  const converted = aces.filter(isInherited).map((ace) => ({ ...stripAce(ace), flags: flagsOf(ace.flags) & ~INHERITED }));
  const seen = new Set(explicit.map(aceKey));
  return canonicalize([...explicit, ...converted.filter((ace) => !seen.has(aceKey(ace)) && seen.add(aceKey(ace)))]);
}

/** Who loses access when inheritance is disabled with "remove inherited permissions". */
export function whoLosesOnDisableInheritance(aces, names = {}) {
  return accessLoss(aces, disableInheritanceAces(aces, 'remove'), names);
}

function aceKey(ace) {
  return `${ace.type}|${ace.sid}|${ace.mask}|${flagsOf(ace.flags)}|${ace.aceType ?? ''}|${ace.raw ?? ''}`;
}

/** The fields the gateway accepts for an ACE. */
export function stripAce(ace) {
  if (ace.type === 'other') return { type: 'other', aceType: ace.aceType, flags: flagsOf(ace.flags), raw: ace.raw };
  return { type: ace.type, sid: ace.sid, mask: ace.mask >>> 0, flags: flagsOf(ace.flags) };
}

/**
 * Explicit ACEs with allow entries for groups added: [{ sid, preset }]. An
 * explicit allow for the same SID and the same "applies to" is widened instead
 * of duplicated. Returns { aces, changed }.
 */
export function withGroups(aces, groups) {
  const explicit = aces.filter((ace) => !isInherited(ace)).map(stripAce);
  let changed = false;
  for (const group of groups || []) {
    if (!/^S-1-\d+(-\d+)+$/.test(String(group.sid || ''))) throw httpError(400, 'A group has no valid SID', 'BAD_SID');
    const preset = PRESETS[normalizePreset(group.preset)];
    const existing = explicit.find((ace) => ace.type === 'allow' && ace.sid === group.sid && (ace.flags & (OI | CI | IO | NP)) === preset.flags);
    if (existing) {
      const mask = (mapGeneric(existing.mask) | preset.mask) >>> 0;
      if (mask !== existing.mask) {
        existing.mask = mask;
        changed = true;
      }
    } else {
      explicit.push({ type: 'allow', sid: group.sid, mask: preset.mask, flags: preset.flags });
      changed = true;
    }
  }
  return { aces: canonicalize(explicit), changed };
}

/** Do two DACLs differ in what they pass down to children? (Then children need a propagation.) */
export function inheritableChanged(beforeAces, afterAces) {
  const pick = (aces) =>
    (aces || [])
      .filter((ace) => flagsOf(ace.flags) & (OI | CI))
      .map(aceKey)
      .join('\n');
  return pick(beforeAces) !== pick(afterAces);
}

// ── Gateway plumbing ────────────────────────────────────────────────────────

let deps = { gateRequest, credentialFor, parkCredential, loadServer, query };

/** Tests replace the gateway / database dependencies. Returns a restore function. */
export function _setDeps(next) {
  const previous = deps;
  deps = { ...deps, ...next };
  return () => {
    deps = previous;
  };
}

const AUTH_CODES = new Set(['AUTH_FAILED', 'ACCOUNT_DISABLED', 'ACCOUNT_LOCKED', 'PASSWORD_EXPIRED', 'ACCOUNT_RESTRICTED', 'CREDENTIALS_FAILED']);

/** Gateway / credential error → the codes of this module. */
export function mapAclError(err, { write = false } = {}) {
  const code = err?.code;
  let mapped;
  if (code === 'ACCESS_DENIED') {
    mapped = httpError(
      403,
      write ? 'No right to change permissions on this folder (NTFS "Change permissions" is needed)' : 'No right to read the permissions of this folder',
      'ACCESS_DENIED'
    );
  } else if (code === 'STALE') {
    mapped = httpError(409, 'The permissions changed since they were read', 'STALE');
  } else if (code === 'NOT_FOUND' || code === 'SHARE_NOT_FOUND') {
    mapped = httpError(404, 'Folder not found on the file server', 'NOT_FOUND');
  } else if (AUTH_CODES.has(code)) {
    mapped = httpError(403, 'The file server rejected your domain credentials', 'AUTH');
    mapped.details = { ...(err.details || {}), reason: err.details?.reason || code };
  } else {
    return err;
  }
  mapped.cause = err;
  return mapped;
}

async function resolveServer(server) {
  if (server && typeof server === 'object' && server.host) return server;
  return deps.loadServer(server);
}

/** The actor's own credential for `server`; never the server's service account. */
async function resolveActor(actor, server) {
  if (actor && typeof actor === 'object' && actor.credential) {
    const { username, password, domain } = actor.credential;
    if (!username || !password) throw httpError(403, 'Enter your domain password', 'CREDENTIALS_REQUIRED');
    return { userId: actor.userId ?? null, cred: { username, domain: domain || '', password }, resolved: null };
  }
  const userId = actor && typeof actor === 'object' ? actor.userId : actor;
  let resolved;
  try {
    resolved = await deps.credentialFor(userId, server);
  } catch (err) {
    throw mapAclError(err);
  }
  if (resolved.source === 'service') {
    throw httpError(403, 'Permissions are changed with your own domain account; sign in to the file server first', 'CREDENTIALS_REQUIRED');
  }
  return { userId, cred: resolved.cred, resolved };
}

async function context(actor, server, share, path) {
  const srv = await resolveServer(server);
  const who = await resolveActor(actor, srv);
  const shareName = String(share || '').trim();
  if (!shareName) throw httpError(400, 'Share is required', 'INVALID_SHARE');
  return { server: srv, ...who, share: shareName, path: cleanPath(path || '') };
}

function params(ctx, extra = {}) {
  return { server: serverParams(ctx.server), cred: ctx.cred, share: ctx.share, path: ctx.path, ...extra };
}

async function failed(ctx, err, options) {
  if (AUTH_CODES.has(err?.code) && ctx.resolved) {
    try {
      await deps.parkCredential(ctx.resolved, err.code); // do not lock the AD account with retries
    } catch {
      /* best effort */
    }
  }
  return mapAclError(err, options);
}

async function readJson(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function call(ctx, op, body, { write = false } = {}) {
  try {
    const res = await deps.gateRequest(op, params(ctx), body ? { body: Buffer.from(JSON.stringify(body)) } : {});
    return await readJson(res);
  } catch (err) {
    throw await failed(ctx, err, { write });
  }
}

function withNames(acl, names = {}) {
  if (!acl) return acl;
  return {
    ...acl,
    ownerName: sidName(acl.owner, names),
    aces: (acl.aces || []).map((ace) => ({
      ...ace,
      name: ace.sid ? sidName(ace.sid, names) : null,
      preset: ace.type === 'other' ? 'special' : presetOf(ace.mask, ace.flags),
      ...flagsToAppliesTo(flagsOf(ace.flags)),
    })),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Share entry of the drive (drive_shares.id) + path inside it → { server, share, path } on the server. */
export async function resolveDriveFolder(shareId, path = '') {
  const { rows } = await deps.query(`SELECT * FROM drive_shares WHERE id = $1`, [intId(shareId)]);
  if (!rows[0]) throw httpError(404, 'Folder not found', 'NOT_FOUND');
  const server = await deps.loadServer(rows[0].server_id);
  return { server, share: rows[0].share, path: joinPath(rows[0].root_path || '', cleanPath(path || '')) };
}

/**
 * Current permissions: { path, isDir, owner, ownerName, group, protected, autoInherited, canonical,
 *   aces: [{ type, sid, name, mask, flags, flagNames, inherited, preset, appliesTo, noPropagate }],
 *   sddl, sd (base64), revision }.
 */
export async function getAcl(actor, server, share, path, { names } = {}) {
  const ctx = await context(actor, server, share, path);
  return withNames(await call(ctx, 'acl_get'), names);
}

function changeBody(change) {
  const body = {
    revision: change.revision || null,
    aces: (change.aces || []).map(stripAce),
    protected: Boolean(change.protected),
    inherit: change.inherit || 'auto',
  };
  if (change.owner) body.owner = change.owner;
  return body;
}

/**
 * What a change would do, without writing (only READ_CONTROL needed):
 * { before, after, previous, loss, guards, inheritableChanged }.
 * change = { revision, aces: explicit ACEs, protected, owner?, inherit?: 'auto'|'keep'|'parent' }.
 */
export async function previewAcl(actor, server, share, path, change, { actorSids = [], names } = {}) {
  const ctx = await context(actor, server, share, path);
  const out = await call(ctx, 'acl_set', { ...changeBody(change), dryRun: true });
  const guards = checkGuards(out.before.aces, out.acl.aces, { actorSids, names, ...nullFlags(out) });
  return {
    before: withNames(out.before, names),
    after: withNames(out.acl, names),
    previous: out.previous,
    guards,
    inheritableChanged: inheritableChanged(out.before.aces, out.acl.aces),
  };
}

/** checkGuards options from a dry-run answer of the gateway. */
function nullFlags(out) {
  return { beforeNull: Boolean(out.before?.nullDacl), afterNull: Boolean(out.acl?.nullDacl), isDir: out.before?.isDir !== false };
}

function enforceGuards(guards, { confirmSelfRemoval }) {
  if (!guards.ok) {
    const empty = guards.errors.every((entry) => entry.code === 'EMPTY_DACL');
    const error = empty
      ? httpError(422, 'The change would leave an empty DACL: nobody could open the folder', 'EMPTY_DACL')
      : httpError(422, 'SYSTEM and Administrators must keep their access', 'PROTECTED_PRINCIPAL');
    error.details = { errors: guards.errors };
    throw error;
  }
  if (guards.warnings.length && !confirmSelfRemoval) {
    const error = httpError(409, 'This change removes your own access to the folder', 'CONFIRM_SELF_REMOVAL');
    error.details = { warnings: guards.warnings };
    throw error;
  }
}

/**
 * Writes the folder's DACL (explicit ACEs + protection; the gateway keeps or
 * recomputes the inherited part). Refuses when the descriptor changed since
 * `revision` (STALE) or when a guard fails. Returns
 * { previous: { sd, sddl, revision } (the undo blob), acl, inheritableChanged, guards }.
 * Children are NOT updated: start a propagation when inheritableChanged.
 * `onBeforeWrite(previous, preview)`: called once the guards passed, right
 * before the write, with the descriptor the write will replace (the write is
 * pinned to its revision); when it throws nothing is written (the caller
 * journals the undo copy there).
 */
export async function setAcl(actor, server, share, path, change, { actorSids = [], confirmSelfRemoval = false, names, onBeforeWrite = null } = {}) {
  if (!change?.revision) throw httpError(400, 'The revision the change was made on is required', 'REVISION_REQUIRED');
  const ctx = await context(actor, server, share, path);
  const body = changeBody(change);
  const preview = await call(ctx, 'acl_set', { ...body, dryRun: true });
  const guards = checkGuards(preview.before.aces, preview.acl.aces, { actorSids, names, ...nullFlags(preview) });
  enforceGuards(guards, { confirmSelfRemoval });
  if (onBeforeWrite) await onBeforeWrite(preview.previous || null, preview);
  const out = await call(ctx, 'acl_set', body, { write: true });
  return {
    previous: out.previous,
    acl: withNames(out.acl, names),
    guards,
    inheritableChanged: inheritableChanged(preview.before.aces, out.acl.aces),
  };
}

const restoreBody = (saved, revision, owner, inherit = 'auto') => ({
  sd: saved?.sd || undefined,
  sddl: saved?.sd ? undefined : saved?.sddl,
  revision,
  owner: Boolean(owner),
  inherit: ['auto', 'keep', 'parent'].includes(inherit) ? inherit : 'auto',
});

/**
 * What an undo would write, without writing (for the "it changed since" diff):
 * { before (current), after (restored), guards, inheritableChanged }.
 */
export async function previewRestore(actor, server, share, path, saved, { owner = false, actorSids = [], names, inherit = 'auto' } = {}) {
  const ctx = await context(actor, server, share, path);
  const out = await call(ctx, 'acl_restore', { ...restoreBody(saved, null, owner, inherit), dryRun: true });
  return {
    before: withNames(out.before, names),
    after: withNames(out.acl, names),
    guards: checkGuards(out.before.aces, out.acl.aces, { actorSids, names, ...nullFlags(out) }),
    inheritableChanged: inheritableChanged(out.before.aces, out.acl.aces),
  };
}

/**
 * Undo: writes back the DACL (and owner when `owner`) of a saved descriptor.
 * saved = { sd: base64 } (preferred, exact) or { sddl }. `revision` = the
 * revision the folder had right after the change being undone; when it moved
 * on, STALE is returned (show the diff; to force, call again with the revision
 * shown in that diff). Without a revision the write is still pinned to the
 * one its own dry run read.
 * A saved descriptor that inherits (not protected) gets back its explicit
 * entries and protection; the inherited part is kept from the folder as it is
 * now, or recomputed from the parent (`inherit`: 'auto' | 'keep' | 'parent', as
 * for setAcl) — never the stale inherited copies of the saved descriptor.
 * The restored DACL goes through the same guards as any change (no bypass for
 * our own saved descriptors): SYSTEM / Administrators must keep the access they
 * have now, and an empty DACL is never written. The gateway checks it again.
 * `onBeforeWrite` as for setAcl.
 */
export async function restoreAcl(actor, server, share, path, saved, { revision = null, owner = false, actorSids = [], confirmSelfRemoval = false, names, inherit = 'auto', onBeforeWrite = null } = {}) {
  const ctx = await context(actor, server, share, path);
  const body = restoreBody(saved, revision, owner, inherit);
  const preview = await call(ctx, 'acl_restore', { ...body, dryRun: true });
  const guards = checkGuards(preview.before.aces, preview.acl.aces, { actorSids, names, ...nullFlags(preview) });
  enforceGuards(guards, { confirmSelfRemoval });
  if (!body.revision && preview.previous?.revision) body.revision = preview.previous.revision;
  if (onBeforeWrite) await onBeforeWrite(preview.previous || null, preview);
  const out = await call(ctx, 'acl_restore', body, { write: true });
  return { previous: out.previous, acl: withNames(out.acl, names), guards, inheritableChanged: inheritableChanged(preview.before.aces, out.acl.aces) };
}

// ── Propagation jobs ────────────────────────────────────────────────────────

const jobs = new Map();
const KEEP_FINISHED_MS = 6 * 60 * 60 * 1000;
const MAX_LIST = 1000;

function pruneJobs() {
  const now = Date.now();
  const finished = [...jobs.values()].filter((job) => job.finishedAt);
  for (const job of finished) {
    if (now - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(job.id);
  }
  const rest = [...jobs.values()].filter((job) => job.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt);
  while (jobs.size > 200 && rest.length) jobs.delete(rest.shift().id);
}

function overlaps(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || !x || !y || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
}

function publicJob(job) {
  return {
    id: job.id,
    userId: job.userId,
    serverId: job.serverId,
    share: job.share,
    path: job.path,
    mode: job.mode,
    dryRun: job.dryRun,
    state: job.state,
    progress: { ...job.progress },
    current: job.current,
    marker: job.marker,
    failedList: job.failedList.slice(),
    protectedList: job.protectedList.slice(),
    error: job.error,
    startedAt: new Date(job.startedAt).toISOString(),
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
  };
}

const STAT_KEYS = ['done', 'changed', 'unchanged', 'failed', 'protected', 'withExplicit', 'explicitRemoved'];

function applyEvent(job, event) {
  for (const key of STAT_KEYS) if (typeof event[key] === 'number') job.progress[key] = event[key];
  if (event.type === 'progress') {
    job.current = event.path;
    job.marker = event.path;
  } else if (event.type === 'failed') {
    if (job.failedList.length < MAX_LIST) job.failedList.push({ path: event.path, code: event.code, stage: event.stage });
  } else if (event.type === 'protected') {
    if (job.protectedList.length < MAX_LIST) job.protectedList.push(event.path);
  } else if (event.type === 'result' || event.type === 'error') {
    if (Array.isArray(event.failedList)) job.failedList = event.failedList.slice(0, MAX_LIST);
    if (Array.isArray(event.protectedList)) job.protectedList = event.protectedList.slice(0, MAX_LIST);
    if (event.marker !== undefined) job.marker = event.marker;
    job.final = event;
  }
}

async function runJob(job, ctx, body) {
  let res;
  try {
    res = await deps.gateRequest('acl_propagate', params(ctx, { mode: job.mode, dryRun: job.dryRun, marker: job.resumeFrom || undefined }), {
      body: Buffer.from(JSON.stringify(body)),
      signal: job.controller.signal,
    });
    let buffer = '';
    for await (const chunk of res) {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          applyEvent(job, JSON.parse(line));
        } catch {
          /* ignore a broken line */
        }
      }
    }
    if (buffer.trim()) {
      try {
        applyEvent(job, JSON.parse(buffer));
      } catch {
        /* ignore */
      }
    }
    if (job.final?.type === 'result') job.state = job.final.stopped || job.cancelled ? 'cancelled' : 'done';
    else if (job.final?.type === 'error') {
      const error = await failed(ctx, Object.assign(new Error(job.final.error || job.final.code), { code: job.final.code }), { write: true });
      job.state = 'failed';
      job.error = { code: error.code, message: error.message };
    } else if (job.cancelled) job.state = 'cancelled';
    else {
      job.state = 'failed';
      job.error = { code: 'INTERRUPTED', message: 'The propagation was interrupted' };
    }
  } catch (err) {
    if (job.cancelled || err?.name === 'AbortError') job.state = 'cancelled';
    else {
      const error = await failed(ctx, err, { write: true });
      job.state = 'failed';
      job.error = { code: error.code || 'SMB_ERROR', message: error.message };
    }
  } finally {
    job.finishedAt = Date.now();
    if (job.onFinish) {
      try {
        await job.onFinish(publicJob(job));
      } catch (err) {
        console.warn('ACL propagation callback failed:', err.message);
      }
    }
  }
}

/**
 * "Replace all child object permission entries with inheritable permission
 * entries from this folder", as a background job.
 *   mode 'inherit' (default): children keep their explicit ACEs, inherited ones are recomputed;
 *   mode 'replace': children's explicit ACEs are removed too (confirm first: a dryRun job
 *        reports progress.withExplicit = how many objects would lose explicit entries);
 *   marker: resume after this share-relative path (job.marker of a stopped job);
 *   retry:  only these paths (and their subtrees), e.g. a previous job's failedList.
 * Protected children and their subtrees are never changed (job.protectedList).
 * One job per folder: overlapping folders on the same share are refused (JOB_RUNNING).
 * Refused with UNSAFE_SOURCE (422) when the folder has a NULL DACL or gives
 * SYSTEM / Administrators no inheritable access (children would be locked out);
 * the gateway re-checks, and never writes an empty or guard-breaking DACL on a
 * child (failedList code EMPTY_DACL / PROTECTED_PRINCIPAL / UNSAFE_SOURCE).
 * sourceAcl: the folder's current ACL when the caller has just read or written
 * it (skips one read).
 * Returns the job (poll getJob(id)).
 */
export async function startPropagation(
  actor,
  server,
  share,
  path,
  { mode = 'inherit', dryRun = false, marker = null, retry = null, onFinish = null, sourceAcl = null } = {}
) {
  if (mode !== 'inherit' && mode !== 'replace') throw httpError(400, 'Unknown propagation mode', 'BAD_REQUEST');
  const ctx = await context(actor, server, share, path);
  const retrying = Array.isArray(retry) && retry.length > 0;
  if (!retrying) {
    const source = sourceAcl || (await call(ctx, 'acl_get'));
    const problems = source.isDir === false ? [] : propagationSourceProblems(source);
    if (problems.length) {
      const error = httpError(
        422,
        'This folder has no inheritable permissions for SYSTEM and Administrators; applying it to the children would lock them out',
        'UNSAFE_SOURCE'
      );
      error.details = { problems };
      throw error;
    }
  }
  pruneJobs();
  const serverKey = String(ctx.server.id ?? ctx.server.host).toLowerCase();
  const running = [...jobs.values()].find(
    (job) => !job.finishedAt && job.serverKey === serverKey && job.share.toLowerCase() === ctx.share.toLowerCase() && overlaps(job.path, ctx.path)
  );
  if (running) {
    const error = httpError(409, 'Permissions are already being applied to this folder', 'JOB_RUNNING');
    error.details = { jobId: running.id, path: running.path };
    throw error;
  }
  const job = {
    id: randomUUID(),
    userId: ctx.userId,
    serverId: ctx.server.id ?? null,
    serverKey,
    share: ctx.share,
    path: ctx.path,
    mode,
    dryRun: Boolean(dryRun),
    state: 'running',
    progress: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])),
    current: null,
    resumeFrom: marker ? cleanPath(marker) : null,
    marker: marker ? cleanPath(marker) : null,
    failedList: [],
    protectedList: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
    controller: new AbortController(),
    cancelled: false,
    onFinish,
  };
  jobs.set(job.id, job);
  const body = { retry: Array.isArray(retry) ? retry.map((item) => cleanPath(typeof item === 'string' ? item : item?.path || '')).filter(Boolean) : [] };
  job.promise = runJob(job, ctx, body);
  return publicJob(job);
}

/**
 * The unfinished propagation (not a dry run) on this folder, above or below
 * it on the same share, or null. `server`: the server row or its id.
 */
export function runningJob(server, share, path, { dryRun = false } = {}) {
  const serverKey = String(server && typeof server === 'object' ? server.id ?? server.host : server).toLowerCase();
  const job = [...jobs.values()].find(
    (item) =>
      !item.finishedAt &&
      (dryRun || !item.dryRun) &&
      item.serverKey === serverKey &&
      item.share.toLowerCase() === String(share || '').toLowerCase() &&
      overlaps(item.path, cleanPath(path || ''))
  );
  return job ? publicJob(job) : null;
}

/** JOB_RUNNING (409) when a propagation runs on this folder, above or below it. */
export function refuseWhileJobRuns(server, share, path) {
  const job = runningJob(server, share, path);
  if (!job) return;
  const error = httpError(409, 'Permissions are being applied to this folder (or a folder above or below it); wait until that finishes', 'JOB_RUNNING');
  error.details = { jobId: job.id, path: job.path };
  throw error;
}

/**
 * Owner filter of the job API: with { userId } (and no admin: true) only jobs
 * started by that portal user are visible; without options everything is
 * (internal callers, tests). Routes must pass the acting user.
 */
function visible(job, { userId = null, admin = false } = {}) {
  if (!job) return false;
  if (admin || userId == null) return true;
  return job.userId != null && String(job.userId) === String(userId);
}

/** The job, or null when unknown or (with { userId }) not the user's. */
export function getJob(id, access = {}) {
  const job = jobs.get(id);
  return visible(job, access) ? publicJob(job) : null;
}

/** Jobs, newest first. { userId }: only that user's (unless admin: true); { running }: unfinished only. */
export function listJobs({ userId = null, running = false, admin = false } = {}) {
  return [...jobs.values()]
    .filter((job) => visible(job, { userId, admin }) && (!running || !job.finishedAt))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(publicJob);
}

/**
 * Stops a running job; resume later with { marker: job.marker }.
 * access { userId, admin }: someone else's job reads as NOT_FOUND unless admin.
 */
export function cancelJob(id, access = {}) {
  const job = jobs.get(id);
  if (!visible(job, access)) throw httpError(404, 'Job not found', 'NOT_FOUND');
  if (!job.finishedAt) {
    job.cancelled = true;
    job.state = 'cancelling';
    job.controller.abort();
  }
  return publicJob(job);
}

/** Resolves when the job has finished (tests, scripts). */
export async function waitForJob(id) {
  const job = jobs.get(id);
  if (job?.promise) await job.promise;
  return getJob(id);
}

// ── For the access section («Доступ») ────────────────────────────────────────────

/**
 * "Create folder group pair": grants groups on a folder, e.g.
 *   addGroupsToFolder(userId, server, 'shared', '06-HR', [{ sid, preset: 'modify' }, { sid, preset: 'readExecute' }])
 * Explicit allow ACEs for "this folder, subfolders and files" are added (or
 * widened), then — unless propagate is false — the children get the new
 * inherited entries through a propagation job (mode 'inherit').
 * `onBeforeWrite(previous)` as for setAcl (journal the undo copy before the write).
 * Returns { changed, previous (undo blob), acl, job, propagationError }
 * (propagationError: the folder was changed but the children could not be
 * updated, e.g. UNSAFE_SOURCE or JOB_RUNNING).
 */
export async function addGroupsToFolder(actor, server, share, path, groups, { propagate = true, actorSids = [], names, onFinish, onBeforeWrite = null } = {}) {
  const current = await getAcl(actor, server, share, path);
  const { aces, changed } = withGroups(current.aces, groups);
  if (!changed) return { changed: false, previous: null, acl: withNames(current, names), job: null, propagationError: null };
  const result = await setAcl(actor, server, share, path, { revision: current.revision, aces, protected: current.protected, inherit: 'keep' }, { actorSids, names, onBeforeWrite });
  let job = null;
  let propagationError = null;
  if (propagate && current.isDir !== false && result.inheritableChanged) {
    try {
      job = await startPropagation(actor, server, share, path, { mode: 'inherit', onFinish, sourceAcl: result.acl });
    } catch (err) {
      // The folder itself is changed already: report it with the undo blob, not as a failure.
      propagationError = { code: err?.code || 'SMB_ERROR', message: String(err?.message || '').slice(0, 300) };
    }
  }
  return { changed: true, previous: result.previous, acl: result.acl, job, propagationError };
}
