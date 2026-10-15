import { randomUUID } from 'crypto';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError } from '../shared/acl.js';
import { directoryDomain } from '../drive/credentials.js';
import { actorCredential, credentialStatus, isImpersonation, parkCredential } from './credentials.js';
import {
  addMember,
  adError,
  cachedGroups,
  createGroups,
  deleteGroup,
  groupDnFor,
  invalidateGroups,
  moveMember,
  readMembers,
  readObject,
  readSids,
  removeMember,
  searchObjects,
  setDescription,
  withActor,
} from './directory.js';
import { actorOf, journalEntry, laterChanges, recordChange, securityEvent } from './journal.js';
import { buildFolders, describeGroup, domainRoot, formatDescription, nameTaken, newGroupNames, normDn, parseDescription } from './naming.js';
import { attachGroupsToNtfs, ntfsAttachAvailable } from './ntfsHook.js';
import { finishNtfsAttach, folderRef, recordPropagation, startNtfsAttach } from './ntfsJournal.js';
import {
  assertGroupChange,
  assertMemberAdd,
  groupRefusal,
  groupVisible,
  inverseOf,
  requireRole,
  requireSuperadmin,
  requireWrite,
  supersededRefusal,
  undoRefusal,
  refusalError,
} from './policy.js';

/*
 * Folder access: Active Directory security groups that open folders on the
 * file server. Reads use the service account; every change runs as the
 * acting administrator (see credentials.js) and is journalled.
 */

export const LOGON_NOTICE = 'logon';
const MAX_BATCH = 100;

export async function faSettings() {
  const parsed = parseSettings(await getSettings());
  return { enabled: Boolean(parsed.modules.folderaccess?.enabled), ...parsed.modules.folderaccess.settings };
}

export async function adConfig({ optional = false } = {}) {
  const cfg = parseSettings(await getSettings()).integrations.activeDirectory;
  if (!cfg?.enabled || !cfg.host || !cfg.baseDn) {
    if (optional) return null;
    throw httpError(400, 'Active Directory is not set up (Settings → Integrations)', 'FA_AD_OFF');
  }
  return cfg;
}

export function searchBases(cfg, settings) {
  return {
    groups: settings.groupsBase || cfg.baseDn,
    subjects: settings.subjectsBase || domainRoot(cfg.baseDn) || cfg.baseDn,
  };
}

/** Every group the module knows, described (name, folder, flags), plus raw member DNs. */
export async function loadGroups({ refresh = false } = {}) {
  const [cfg, settings] = [await adConfig(), await faSettings()];
  const raw = await cachedGroups(cfg, { base: searchBases(cfg, settings).groups, prefix: settings.prefix, otherPatterns: settings.otherGroups || [] }, { refresh });
  return raw.map((entry) => ({ ...describeGroup(entry, settings), members: entry.members }));
}

const publicGroup = (group, access) => {
  const { members, ...rest } = group;
  return { ...rest, editable: access.canWrite && !groupRefusal(access.role, group) };
};

function publicFolder(folder, access) {
  return {
    ...folder,
    groups: Object.fromEntries(Object.entries(folder.groups).map(([slot, group]) => [slot, publicGroup(group, access)])),
    editable: access.canWrite && Object.values(folder.groups).some((group) => !groupRefusal(access.role, group)),
  };
}

async function shareTitles() {
  try {
    const { rows } = await query(`SELECT id, title FROM drive_shares`);
    return new Map(rows.map((row) => [row.id, row.title]));
  } catch {
    return new Map();
  }
}

/** The section's state for this person: role, read-only reason, credential, settings summary. */
export async function overview(req, access) {
  const settings = await faSettings();
  const cfg = await adConfig({ optional: true });
  const credential = access.role ? await credentialStatus(req.user.id) : null;
  const titles = await shareTitles();
  let readOnly = access.readOnly;
  if (!readOnly && credential?.state === 'not_linked') readOnly = 'not_linked';
  return {
    role: access.role,
    canWrite: access.canWrite && credential?.state !== 'not_linked',
    readOnly,
    credential: credential && { state: credential.state, login: credential.login, since: credential.since, reason: credential.reason },
    adConfigured: Boolean(cfg),
    config: access.role
      ? {
          prefix: settings.prefix,
          orgCode: settings.orgCode,
          orgCodes: settings.orgCodes,
          canCreate: access.role === 'superadmin' && Boolean(settings.newGroupOu),
          ntfsAvailable: ntfsAttachAvailable(),
          driveMap: (settings.driveMap || []).map((row) => ({ ...row, title: titles.get(row.shareId) || null })),
        }
      : null,
  };
}

/** Folders the role sees (sysadmin: only sg_ groups). `q` filters by name, path or group. */
export async function listFolders(access, { refresh = false, q = '' } = {}) {
  requireRole(access);
  const groups = (await loadGroups({ refresh })).filter((group) => groupVisible(access.role, group));
  const text = String(q || '').trim().toLowerCase();
  const folders = buildFolders(groups).filter(
    (folder) => !text || [folder.name, folder.path, ...Object.values(folder.groups).flatMap((group) => [group.name, group.description])].some((value) => String(value || '').toLowerCase().includes(text))
  );
  return folders.map((folder) => publicFolder(folder, access));
}

async function visibleGroups(access, options) {
  return (await loadGroups(options)).filter((group) => groupVisible(access.role, group));
}

async function findGroup(access, dn, { refresh = false } = {}) {
  let group = (await visibleGroups(access, { refresh })).find((item) => normDn(item.dn) === normDn(dn));
  if (!group && !refresh) group = (await visibleGroups(access, { refresh: true })).find((item) => normDn(item.dn) === normDn(dn));
  return group || null;
}

/** A folder with the members of each of its groups (name, login, department, enabled). */
export async function folderCard(access, key) {
  requireRole(access);
  const groups = await visibleGroups(access, {});
  const folder = buildFolders(groups).find((item) => item.key === String(key));
  if (!folder) throw httpError(404, 'The folder was not found', 'FA_FOLDER_NOT_FOUND');
  const [cfg, settings] = [await adConfig(), await faSettings()];
  const base = searchBases(cfg, settings).subjects;
  const members = {};
  for (const [slot, group] of Object.entries(folder.groups)) members[slot] = await readMembers(cfg, base, group);
  return { folder: publicFolder(folder, access), members };
}

/** A person (or group/computer) with every folder group they are a direct member of. */
export async function personCard(access, dn) {
  requireRole(access);
  const cfg = await adConfig();
  const person = await readObject(cfg, dn);
  if (!person) throw httpError(404, 'The account was not found in the directory', 'FA_MEMBER_NOT_FOUND');
  const groups = await visibleGroups(access, {});
  const memberOf = new Set((person.memberOf || []).map(normDn));
  const mine = groups.filter((group) => memberOf.has(normDn(group.dn)) || (group.members || []).some((member) => normDn(member) === normDn(person.dn)));
  const folders = buildFolders(groups);
  const folderOf = (group) => folders.find((folder) => Object.values(folder.groups).some((item) => item.dn === group.dn));
  const { memberOf: _drop, ...shown } = person;
  return {
    person: shown,
    access: mine
      .map((group) => {
        const folder = folderOf(group);
        return { folderKey: folder?.key || null, folderName: folder?.name || group.name, path: group.path, type: group.type, group: publicGroup(group, access) };
      })
      .sort((a, b) => String(a.path || a.folderName).localeCompare(String(b.path || b.folderName))),
  };
}

/** People search; superadministrators may also look for groups and computers. */
export async function findPeople(access, q, kind) {
  requireRole(access);
  const [cfg, settings] = [await adConfig(), await faSettings()];
  const kinds = access.role === 'superadmin' && kind === 'all' ? ['user', 'group', 'computer'] : ['user'];
  return searchObjects(cfg, searchBases(cfg, settings).subjects, q, { kinds });
}

// ── changes ──────────────────────────────────────────────────────────────────

/** Runs `fn(client, actor, cfg)` bound as the acting administrator; parks a rejected password. */
async function asActor(req, access, fn) {
  requireWrite(access);
  const cfg = await adConfig();
  const credential = await actorCredential(req.user.id, { cfg });
  // The journal names the AD account that actually binds (see credentials.resolveIdentity).
  const actor = actorOf(req, credential.account);
  try {
    return await withActor(cfg, credential, (client) => fn(client, actor, cfg, credential));
  } catch (err) {
    // A plain "wrong password" for a name that may not exist does not park it (withActor decides).
    if (err.code === 'FA_CREDENTIALS_FAILED' && err.details?.reason && err.park !== false) await parkCredential(credential, err.details.reason, { impersonating: isImpersonation(req) });
    throw err;
  } finally {
    invalidateGroups();
  }
}

const groupRef = (group) => (group ? { dn: group.dn, name: group.name } : null);
const memberRef = (member) => ({ dn: member.dn, name: member.name, login: member.login });

/** Journals a change that already happened in AD; a database failure never turns it into an AD failure. */
async function recordDone(record, actor, entry) {
  try {
    return await record(actor, entry);
  } catch (err) {
    console.warn('Folder access: journalling a change made in Active Directory failed:', err.message);
    return null;
  }
}

/**
 * One membership operation, journalled. Never throws for a directory refusal:
 * the result says what happened ({ ok, outcome, code, error, rolledBack }).
 * The journal write comes after the AD operation, outside its error handling:
 * if the database fails after AD changed, the result still says "changed"
 * (with `journalId: null`, `journalFailed: true`).
 */
export async function applyMembership(client, actor, op, record = recordChange) {
  const { action, group, toGroup, member } = op;
  const base = { action, via: op.via || 'single', batch: op.batch, group: groupRef(group), toGroup: groupRef(toGroup), member: memberRef(member), undoOf: op.undoOf };
  let outcome;
  let before;
  let after;
  try {
    if (action === 'member_add') {
      const result = await addMember(client, group.dn, member.dn);
      outcome = result === 'added' ? 'changed' : 'unchanged';
      before = { member: result !== 'added' };
      after = { member: true };
    } else if (action === 'member_remove') {
      const result = await removeMember(client, group.dn, member.dn);
      outcome = result === 'removed' ? 'changed' : 'unchanged';
      before = { member: result === 'removed' };
      after = { member: false };
    } else if (action === 'member_move') {
      const result = await moveMember(client, group.dn, toGroup.dn, member.dn);
      outcome = result.added === 'added' || result.removed === 'removed' ? 'changed' : 'unchanged';
      before = { inFrom: result.removed === 'removed', inTo: result.added === 'unchanged' };
      after = { inFrom: false, inTo: true };
    } else {
      throw httpError(400, 'Unknown action', 'FA_ACTION');
    }
  } catch (raw) {
    const err = adError(raw);
    const failure = action === 'member_move' && raw.rolledBack === true ? 'rolled_back' : 'failed';
    // A move whose rollback failed leaves the person in both groups: say so.
    const state = action === 'member_move' && raw.rolledBack === false ? { inFrom: true, inTo: true } : null;
    const journalId = await recordDone(record, actor, { ...base, after: state, ok: false, outcome: failure, errorCode: err.code, error: err.message });
    return { ok: false, outcome: failure, journalId, code: err.code, error: err.message, rolledBack: raw.rolledBack, group: group.name, toGroup: toGroup?.name || null, member: member.name, memberDn: member.dn };
  }
  const journalId = await recordDone(record, actor, { ...base, before, after, ok: true, outcome });
  return { ok: true, outcome, journalId, ...(journalId == null ? { journalFailed: true } : {}), group: group.name, toGroup: toGroup?.name || null, member: member.name, memberDn: member.dn };
}

async function resolveMembers(cfg, dns) {
  const list = [...new Set((Array.isArray(dns) ? dns : [dns]).map((dn) => String(dn || '').trim()).filter(Boolean))];
  if (!list.length) throw httpError(400, 'Choose at least one account', 'FA_NO_MEMBERS');
  if (list.length > MAX_BATCH) throw httpError(400, `At most ${MAX_BATCH} accounts at once`, 'FA_TOO_MANY');
  const members = [];
  for (const dn of list) members.push((await readObject(cfg, dn)) || null);
  return { list, members };
}

function summary(results) {
  return {
    changed: results.filter((item) => item.ok && item.outcome === 'changed').length,
    unchanged: results.filter((item) => item.ok && item.outcome === 'unchanged').length,
    failed: results.filter((item) => !item.ok).length,
  };
}

function finish(req, results, detail) {
  const counts = summary(results);
  if (counts.changed || counts.failed) securityEvent(req, 'folder_access_changed', `${detail} · ${counts.changed} changed, ${counts.failed} failed`.slice(0, 200), counts.failed ? 'warning' : 'info');
  return { results, ...counts, notice: counts.changed ? LOGON_NOTICE : null };
}

/** Adds or removes accounts in one group. */
export async function changeMembers(req, access, { groupDn, members: dns, action }) {
  requireWrite(access);
  if (!['add', 'remove'].includes(action)) throw httpError(400, 'Unknown action', 'FA_ACTION');
  const cfg = await adConfig();
  const group = await findGroup(access, groupDn);
  assertGroupChange(access.role, group);
  const { list, members } = await resolveMembers(cfg, dns);
  // Removing: an account that no longer exists in AD can still be taken out by its DN.
  const targets = members.map((member, index) => {
    if (action === 'add') {
      assertMemberAdd(access.role, group, member);
      return member;
    }
    return member || { dn: list[index], name: list[index], login: null, kind: 'unknown' };
  });
  const batch = randomUUID();
  const results = await asActor(req, access, async (client, actor) => {
    const out = [];
    for (const member of targets) out.push(await applyMembership(client, actor, { action: action === 'add' ? 'member_add' : 'member_remove', group, member, batch }));
    return out;
  });
  return finish(req, results, `${action === 'add' ? '+' : '−'} ${targets.length} · ${group.name}`);
}

/** Moves accounts between the _full and _read groups of one folder (or any two groups the role may change). */
export async function moveMembers(req, access, { fromDn, toDn, members: dns }) {
  requireWrite(access);
  const cfg = await adConfig();
  const from = await findGroup(access, fromDn);
  const to = await findGroup(access, toDn);
  assertGroupChange(access.role, from);
  assertGroupChange(access.role, to);
  if (normDn(from.dn) === normDn(to.dn)) throw httpError(400, 'Choose another group', 'FA_SAME_GROUP');
  const { members } = await resolveMembers(cfg, dns);
  for (const member of members) assertMemberAdd(access.role, to, member);
  const batch = randomUUID();
  const results = await asActor(req, access, async (client, actor) => {
    const out = [];
    for (const member of members) out.push(await applyMembership(client, actor, { action: 'member_move', group: from, toGroup: to, member, batch }));
    return out;
  });
  return finish(req, results, `${from.name} → ${to.name} · ${members.length}`);
}

/** Gives `toDn` the same folder groups as `fromDn` (adds only; groups the role may not change are skipped). */
export async function copyAccess(req, access, { fromDn, toDn }) {
  requireWrite(access);
  const cfg = await adConfig();
  const source = await readObject(cfg, fromDn);
  const target = await readObject(cfg, toDn);
  if (!source || !target) throw refusalError('FA_MEMBER_NOT_FOUND');
  if (normDn(source.dn) === normDn(target.dn)) throw httpError(400, 'Choose another person', 'FA_SAME_MEMBER');
  const groups = await visibleGroups(access, { refresh: true });
  const memberOf = new Set((source.memberOf || []).map(normDn));
  const sourceGroups = groups.filter((group) => memberOf.has(normDn(group.dn)) || (group.members || []).some((dn) => normDn(dn) === normDn(source.dn)));
  const allowed = [];
  const skipped = [];
  for (const group of sourceGroups) {
    const code = groupRefusal(access.role, group);
    if (code) skipped.push({ group: group.name, code });
    else allowed.push(group);
  }
  if (allowed.length) assertMemberAdd(access.role, allowed[0], target);
  const batch = randomUUID();
  const results = allowed.length
    ? await asActor(req, access, async (client, actor) => {
        const out = [];
        for (const group of allowed) out.push(await applyMembership(client, actor, { action: 'member_add', group, member: target, via: 'copy', batch }));
        return out;
      })
    : [];
  return { ...finish(req, results, `copy ${source.login || source.name} → ${target.login || target.name}`), skipped };
}

/** Removes an account from every folder group the role may change (needs `confirm`). */
export async function revokeAll(req, access, { memberDn, confirm }) {
  requireWrite(access);
  if (confirm !== true) throw httpError(400, 'Confirm the removal', 'FA_CONFIRM');
  const cfg = await adConfig();
  const person = await readObject(cfg, memberDn);
  if (!person) throw refusalError('FA_MEMBER_NOT_FOUND');
  const groups = await visibleGroups(access, { refresh: true });
  const memberOf = new Set((person.memberOf || []).map(normDn));
  const mine = groups.filter((group) => memberOf.has(normDn(group.dn)) || (group.members || []).some((dn) => normDn(dn) === normDn(person.dn)));
  const allowed = [];
  const skipped = [];
  for (const group of mine) {
    const code = groupRefusal(access.role, group);
    if (code) skipped.push({ group: group.name, code });
    else allowed.push(group);
  }
  const batch = randomUUID();
  const results = allowed.length
    ? await asActor(req, access, async (client, actor) => {
        const out = [];
        for (const group of allowed) out.push(await applyMembership(client, actor, { action: 'member_remove', group, member: person, via: 'revoke_all', batch }));
        return out;
      })
    : [];
  return { ...finish(req, results, `revoke all · ${person.login || person.name}`), skipped };
}

/** Undoes one journalled membership change with the inverse operation. */
export async function undoChange(req, access, id, { confirm = false } = {}) {
  requireWrite(access);
  const entry = await journalEntry(id);
  const refusal = undoRefusal(access.role, req.user.id, entry);
  if (refusal) {
    const messages = {
      NOT_FOUND: [404, 'Not found'],
      FORBIDDEN: [403, 'You do not have permission for this action'],
      FA_UNDO_UNSUPPORTED: [400, 'This change cannot be undone here'],
      FA_UNDO_NOTHING: [400, 'This change did not change anything'],
      FA_UNDO_DONE: [409, 'This change has already been undone'],
      FA_UNDO_NOT_OWN: [403, 'You can undo only your own changes'],
    };
    const [status, message] = messages[refusal];
    throw httpError(status, message, refusal);
  }
  // Someone changed this person's membership of the group again since: undoing would revert that too.
  const later = await laterChanges(entry);
  if (supersededRefusal(later, confirm)) {
    const error = httpError(409, 'This person\'s membership of the group was changed again later. Undoing would also revert those changes', 'FA_UNDO_SUPERSEDED');
    error.details = { later };
    throw error;
  }
  const inverse = inverseOf(entry);
  const cfg = await adConfig();
  const group = await findGroup(access, inverse.groupDn, { refresh: true });
  assertGroupChange(access.role, group);
  const toGroup = inverse.toGroupDn ? await findGroup(access, inverse.toGroupDn) : null;
  if (inverse.toGroupDn) assertGroupChange(access.role, toGroup);
  let member = await readObject(cfg, inverse.memberDn);
  if (inverse.action === 'member_add' || inverse.action === 'member_move') assertMemberAdd(access.role, toGroup || group, member);
  member = member || { dn: inverse.memberDn, name: entry.member_name || inverse.memberDn, login: entry.member_login };
  const result = await asActor(req, access, (client, actor) => applyMembership(client, actor, { ...inverse, group, toGroup, member, via: 'undo', undoOf: entry.id }));
  // The inverse found nothing to change: the original is still marked as undone.
  if (result.ok && result.outcome === 'unchanged') await query(`UPDATE fa_journal SET undone_by = $2 WHERE id = $1 AND undone_by IS NULL`, [entry.id, result.journalId]);
  return finish(req, [result], `undo #${entry.id}`);
}

// ── groups (superadministrators) ─────────────────────────────────────────────

const DESCRIPTION_RE = /^[^\u0000-\u001f]{0,1024}$/;

/** Creates sg_<org>_<name>_full / _read with descriptions, then asks the NTFS engine to add them to the folder. */
export async function createGroupPair(req, access, { name, path }) {
  requireSuperadmin(access);
  const settings = await faSettings();
  if (!settings.newGroupOu) throw httpError(400, 'Set the OU for new groups in the module settings', 'FA_NO_OU');
  const names = newGroupNames(name, settings);
  if (!names) throw httpError(400, 'Use Latin letters, digits and hyphens for the name', 'FA_GROUP_NAME');
  const folderPath = String(path || '').trim();
  const parsed = parseDescription(formatDescription(folderPath, 'full'));
  if (parsed.issues.length) throw httpError(400, 'The folder path must look like W:\\07-LEGAL', 'FA_PATH');
  const existing = await loadGroups({ refresh: true });
  if (nameTaken(names, existing)) throw httpError(409, 'A group with this name already exists', 'FA_AD_EXISTS');
  const pair = [
    { type: 'full', name: names.full, description: formatDescription(folderPath, 'full') },
    { type: 'read', name: names.read, description: formatDescription(folderPath, 'read') },
  ];
  const batch = randomUUID();
  let created;
  let sids = [];
  let credentialUsed;
  let actorUsed;
  await asActor(req, access, async (client, actor, cfg, credential) => {
    credentialUsed = credential;
    actorUsed = actor;
    try {
      created = await createGroups(client, settings.newGroupOu, pair);
    } catch (raw) {
      const err = adError(raw);
      for (const group of pair) {
        await recordChange(actor, { action: 'group_create', batch, group: { dn: groupDnFor(group.name, settings.newGroupOu), name: group.name }, after: { description: group.description }, ok: false, outcome: raw.rolledBack === false ? 'failed' : 'rolled_back', errorCode: err.code, error: err.message });
      }
      throw err;
    }
    for (const [index, group] of pair.entries()) {
      await recordDone(recordChange, actor, { action: 'group_create', batch, group: { dn: created[index], name: group.name }, after: { description: group.description, type: group.type }, ok: true, outcome: 'changed' });
    }
    // SIDs for the NTFS engine, read with the same connection that created the groups
    // (the new OU may be outside the module's group search, the name outside its prefix).
    sids = await readSids(client, created);
  });
  securityEvent(req, 'folder_group_changed', `created ${names.full}, ${names.read} · ${folderPath}`, 'warning');
  const groups = pair.map((group, index) => ({ type: group.type, dn: created[index], name: group.name, sid: sids[index] || null }));
  const share = (settings.driveMap || []).find((row) => row.letter === parsed.letter);
  const ntfsFolder = { shareId: share?.shareId || null, path: parsed.relPath, display: folderPath };
  const attachJournal = { batch, folder: ntfsFolder, groups };
  let pendingId = null;
  const ntfs = await attachGroupsToNtfs({
    actor: {
      userId: req.user.id,
      dn: credentialUsed.dn,
      login: credentialUsed.login,
      credential: { username: credentialUsed.login, domain: await directoryDomain(), password: credentialUsed.password },
    },
    folder: { shareId: share?.shareId || null, path: parsed.relPath, letter: parsed.letter, description: folderPath },
    groups,
    rights: settings.typeMap,
    journal: { batch, actor: actorUsed },
    // Journalled as kind 'ntfs' with the previous descriptor (undo in the NTFS mode), BEFORE the
    // folder is written: no journal → nothing written. Completed below once the write ended.
    onBeforeWrite: async (previous, _preview, server) => {
      pendingId = await startNtfsAttach(actorUsed, attachJournal, previous, server);
    },
    // The engine's propagation to the subfolders ends later: journal its result then.
    onPropagationFinish: (job) => recordPropagation(actorUsed, folderRef(ntfsFolder, { id: job.serverId, share: job.share, path: job.path }), job, { via: 'hook', batch }),
  });
  ntfs.journalId = await finishNtfsAttach(actorUsed, pendingId, { ...attachJournal, ntfs });
  return { groups, ntfs };
}

/** Changes a group's description (folder path and access type). */
export async function describeGroupChange(req, access, { dn, description }) {
  requireSuperadmin(access);
  const text = String(description ?? '').trim();
  if (!DESCRIPTION_RE.test(text)) throw httpError(400, 'The description is too long or has control characters', 'FA_DESCRIPTION');
  const group = await findGroup(access, dn, { refresh: true });
  if (!group) throw refusalError('FA_GROUP_NOT_FOUND');
  await asActor(req, access, async (client, actor) => {
    try {
      await setDescription(client, group.dn, text);
    } catch (raw) {
      const err = adError(raw);
      await recordDone(recordChange, actor, { action: 'group_describe', group, before: { description: group.description }, after: { description: text }, ok: false, outcome: 'failed', errorCode: err.code, error: err.message });
      throw err;
    }
    await recordDone(recordChange, actor, { action: 'group_describe', group, before: { description: group.description }, after: { description: text }, ok: true, outcome: group.description === text ? 'unchanged' : 'changed' });
  });
  securityEvent(req, 'folder_group_changed', `description ${group.name}: ${text}`, 'warning');
  return { ok: true };
}

/** Deletes a group (`confirm` must repeat its name). Its members and description are kept in the journal. */
export async function deleteGroupChange(req, access, { dn, confirm }) {
  requireSuperadmin(access);
  const group = await findGroup(access, dn, { refresh: true });
  if (!group) throw refusalError('FA_GROUP_NOT_FOUND');
  if (String(confirm || '').trim().toLowerCase() !== String(group.name).toLowerCase()) throw httpError(400, 'Type the group name to confirm', 'FA_CONFIRM');
  const before = { description: group.description, sid: group.sid, memberCount: group.members.length, members: group.members.slice(0, 500) };
  await asActor(req, access, async (client, actor) => {
    try {
      await deleteGroup(client, group.dn);
    } catch (raw) {
      const err = adError(raw);
      await recordDone(recordChange, actor, { action: 'group_delete', group, before, ok: false, outcome: 'failed', errorCode: err.code, error: err.message });
      throw err;
    }
    await recordDone(recordChange, actor, { action: 'group_delete', group, before, ok: true, outcome: 'changed' });
  });
  securityEvent(req, 'folder_group_changed', `deleted ${group.name} (${group.members.length} members)`, 'warning');
  return { ok: true };
}
