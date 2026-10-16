/*
 * Folder access groups («Доступ» of the File server): names, descriptions, projects and folders (pure, no I/O).
 *
 *   sg_obj2_buh_full   description "G:\ОБЪЕКТ-2\_DocArch\10-BUH;Full Access"
 *   sg_obj2_buh_read   description "G:\ОБЪЕКТ-2\_DocArch\10-BUH;Read Only"
 *
 * <prefix><project>_<name>_<full|read>: the project code is the first token
 * after the prefix (obj2, co, wh…), the folder name part is everything up to
 * the final _full / _read and may contain underscores (qaqc_styajka). The
 * DESCRIPTION is authoritative for the folder (drive letter + path, or a UNC
 * path) and the access type; the name is only checked against it. The project
 * shown is the OU that holds the group's Groups OU (OU=Groups,OU=ОБЪЕКТ-2,… → ОБЪЕКТ-2).
 * A folder path is mapped to a File server folder (drive share) by the
 * share's path prefixes: the longest prefix wins, case-insensitive, \ or /.
 * Anything that does not fit is shown with "needs review" and the reasons.
 */

export const ACCESS_TEXT = { full: 'Full Access', read: 'Read Only' };

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Glob ("sg_*_root_*") → case-insensitive anchored RegExp. */
export function globRe(pattern) {
  return new RegExp(`^${String(pattern).split('*').map(escapeRe).join('.*')}$`, 'i');
}

export const matchesAny = (name, patterns) => (patterns || []).some((pattern) => globRe(pattern).test(String(name || '')));

/** Glob → the pieces of an LDAP substring filter ({ initial, any, final }), or { equal } without '*'. */
export function globToSubstring(pattern) {
  const parts = String(pattern).split('*');
  if (parts.length === 1) return { equal: parts[0] };
  return { initial: parts[0] || undefined, any: parts.slice(1, -1).filter(Boolean), final: parts[parts.length - 1] || undefined };
}

/** Lower case, no spaces around commas: two spellings of one DN compare equal. */
export const normDn = (dn) => String(dn || '').trim().toLowerCase().replace(/\s*,\s*/g, ',');

/** Is `dn` inside `base` (or `base` itself)? */
export const dnUnder = (dn, base) => {
  const a = normDn(dn);
  const b = normDn(base);
  return Boolean(b) && (a === b || a.endsWith(`,${b}`));
};

/** "CN=Ivanov\, Ivan,OU=…" → "Ivanov, Ivan". */
export function cnOf(dn) {
  const match = /^\s*[a-z]+=((?:\\.|[^,\\])+)/i.exec(String(dn || ''));
  return match ? match[1].replace(/\\(.)/g, '$1').trim() : String(dn || '');
}

/** "CN=a\,b,OU=Groups,DC=x" → ['CN=a\,b', 'OU=Groups', 'DC=x'] (escaped commas kept). */
export function splitDn(dn) {
  return (String(dn || '').match(/(?:\\.|[^,\\])+/g) || []).map((part) => part.trim()).filter(Boolean);
}

/** "OU=Accounts,DC=corp,DC=example" → "DC=corp,DC=example". */
export function domainRoot(baseDn) {
  const parts = [...String(baseDn || '').matchAll(/DC=([^,]+)/gi)].map((match) => `DC=${match[1].trim()}`);
  return parts.join(',');
}

const NO_PROJECT = { project: null, projectDn: null };
const isOu = (rdn) => /^ou=/i.test(rdn);
const isGroupsOu = (rdn) => /^ou=\s*groups\s*$/i.test(rdn);
const isDomainRoot = (dn) => splitDn(dn).every((rdn) => /^dc=/i.test(rdn));

/**
 * Where a group lives: { groupsOu, project, projectDn }.
 * The project is the first OU below the search base the group was found in (the broadest of `bases`
 * that holds it, a bare domain root aside), an "OU=Groups" skipped:
 *   CN=…,OU=Groups,OU=ОБЪЕКТ-2,OU=Accounts,… (base OU=Accounts) → "ОБЪЕКТ-2";
 *   CN=…,OU=Sec,OU=Groups,OU=ОБЪЕКТ-2,OU=Accounts,…           → "ОБЪЕКТ-2";
 *   CN=…,OU=Accounts,… or CN=…,OU=Groups,OU=Accounts,…       → no project.
 * Without such a base (or under the domain root only) the OU holding the "Groups" OU is the
 * project, else the group's own OU.
 */
export function projectOf(dn, bases = []) {
  const rdns = splitDn(dn);
  if (rdns.length < 2) return { groupsOu: null, ...NO_PROJECT };
  const groupsOu = rdns.slice(1).join(',');
  const at = (index) => ({ groupsOu, project: cnOf(rdns[index]), projectDn: rdns.slice(index).join(',') });
  const holding = (bases || []).filter((base) => base && !isDomainRoot(base) && dnUnder(dn, base) && normDn(base) !== normDn(dn));
  if (holding.length) {
    const base = holding.reduce((best, item) => (splitDn(item).length < splitDn(best).length ? item : best));
    const top = rdns.length - splitDn(base).length;
    // Containers between the group and the base, from the top down.
    for (let index = top - 1; index >= 1; index -= 1) {
      if (isOu(rdns[index]) && !isGroupsOu(rdns[index])) return at(index);
    }
    // Right in the base: no project, unless the base is itself a project's Groups OU.
    const baseRdns = splitDn(base);
    if (isGroupsOu(baseRdns[0]) && baseRdns[1] && isOu(baseRdns[1])) return at(top + 1);
    return { groupsOu, ...NO_PROJECT };
  }
  const groupsAt = rdns.findIndex((rdn, index) => index >= 1 && isGroupsOu(rdn));
  if (groupsAt >= 1 && rdns[groupsAt + 1] && isOu(rdns[groupsAt + 1])) return at(groupsAt + 1);
  if (isOu(rdns[1]) && !isGroupsOu(rdns[1])) return at(1);
  return { groupsOu, ...NO_PROJECT };
}

// ── paths ───────────────────────────────────────────────────────────────────

/**
 * A Windows path → { unc, parts } ("G:\ОБЪЕКТ-2\_DocArch" → parts ['G:', 'ОБЪЕКТ-2', '_DocArch'];
 * "\\srv\share\x" → unc, ['srv', 'share', 'x']). Backslash or slash, repeated separators
 * and a trailing one are tolerated.
 */
export function splitPath(path) {
  const text = String(path ?? '').trim().replace(/\//g, '\\');
  const unc = text.startsWith('\\\\');
  const parts = text.split('\\').filter((part) => part.length && part.trim().length);
  if (parts.length && /^[a-z]:$/i.test(parts[0])) parts[0] = parts[0].toUpperCase();
  return { unc, parts };
}

const joinParts = ({ unc, parts }) => (unc ? `\\\\${parts.join('\\')}` : parts.join('\\'));

/** Display form: "G:\ОБЪЕКТ-2\_DocArch" (drive letter upper case, single backslashes). */
export const displayPath = (path) => joinParts(splitPath(path));

/** Comparison key: the display form in lower case. */
export const pathKey = (path) => displayPath(path).toLowerCase();

/** A usable folder path: a drive letter (+ path) or \\server\share(+ path). */
export function pathValid(path) {
  const { unc, parts } = splitPath(path);
  if (unc) return parts.length >= 2;
  return parts.length >= 1 && /^[A-Z]:$/.test(parts[0]);
}

/** A drive root ("W:") or a UNC share root ("\\srv\share"). */
export function pathIsRoot(path) {
  const { unc, parts } = splitPath(path);
  return unc ? parts.length === 2 : parts.length === 1;
}

/** Is `path` the same as or below `prefix` (case-insensitive)? → the remaining parts, or null. */
export function pathBelow(path, prefix) {
  const a = splitPath(path);
  const b = splitPath(prefix);
  if (!b.parts.length || a.unc !== b.unc || a.parts.length < b.parts.length) return null;
  for (let i = 0; i < b.parts.length; i += 1) if (a.parts[i].toLowerCase() !== b.parts[i].toLowerCase()) return null;
  return a.parts.slice(b.parts.length);
}

/**
 * A folder path → the File server folder: { shareId, relPath, prefix } or null.
 * `shareMap` = [{ shareId, prefix }] (each share's path prefixes); the longest prefix wins.
 */
export function mapPath(path, shareMap = []) {
  let best = null;
  for (const row of shareMap || []) {
    const rest = pathBelow(path, row.prefix);
    if (!rest) continue;
    const depth = splitPath(row.prefix).parts.length;
    if (!best || depth > best.depth) best = { shareId: Number(row.shareId), relPath: rest.join('/'), prefix: displayPath(row.prefix), depth };
  }
  if (!best) return null;
  const { depth: _depth, ...out } = best;
  return out;
}

/** The user paths of a File server folder + path inside it: one per prefix of the share ("G:\ОБЪЕКТ-2\_DocArch\10-BUH"). */
export function userPaths(prefixes, relPath = '') {
  const inside = String(relPath || '').split('/').filter(Boolean);
  return (prefixes || []).filter((prefix) => pathValid(prefix)).map((prefix) => {
    const base = splitPath(prefix);
    return joinParts({ unc: base.unc, parts: [...base.parts, ...inside] });
  });
}

/** Path prefixes typed for a share: cleaned, valid, unique (case-insensitive), at most 10. */
export function cleanPrefixes(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || '').split(/[\n;]+/)) {
    const text = String(raw ?? '').replace(/[\u0000-\u001f<>|"*?]/g, '').trim().slice(0, 400);
    if (!text || !pathValid(text)) continue;
    const display = displayPath(text);
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out.slice(0, 10);
}

// ── names and descriptions ──────────────────────────────────────────────────

/**
 * Group name → { name, prefixed, project, stem, type, issues }.
 * `issues`: 'name_format' (prefix but no <project>_<name>_<full|read>), 'project_unknown'
 * (an allow-list of project codes is set and the code is not in it).
 */
export function parseGroupName(name, settings = {}) {
  const text = String(name || '').trim();
  const prefix = String(settings.prefix || 'sg_').toLowerCase();
  const out = { name: text, prefixed: false, project: null, stem: null, type: null, issues: [] };
  if (!text.toLowerCase().startsWith(prefix)) return out;
  out.prefixed = true;
  const match = new RegExp(`^${escapeRe(prefix)}([a-z0-9-]+)_(.+)_(full|read)$`, 'i').exec(text);
  if (!match) {
    out.issues.push('name_format');
    const loose = new RegExp(`^${escapeRe(prefix)}([a-z0-9-]+)_(.+)$`, 'i').exec(text);
    if (loose) {
      out.project = loose[1].toLowerCase();
      out.stem = loose[2].toLowerCase();
    }
    return out;
  }
  out.project = match[1].toLowerCase();
  out.stem = match[2].toLowerCase();
  out.type = match[3].toLowerCase();
  const allowed = (settings.projects || []).map((code) => String(code).toLowerCase());
  if (allowed.length && !allowed.includes(out.project)) out.issues.push('project_unknown');
  return out;
}

/**
 * Description "G:\ОБЪЕКТ-2\_DocArch\3-QA,QC;Full Access" →
 * { raw, path: 'G:\ОБЪЕКТ-2\_DocArch\3-QA,QC', pathKey, root, access: 'full', issues }.
 * The access type follows the LAST ';' (a path may contain commas, spaces, Cyrillic).
 * `issues`: 'description_missing', 'description_format', 'access_unknown', 'path_format'.
 */
export function parseDescription(description) {
  const raw = String(description ?? '').trim();
  const out = { raw, path: null, pathKey: null, root: false, access: null, issues: [] };
  if (!raw) {
    out.issues.push('description_missing');
    return out;
  }
  const cut = raw.lastIndexOf(';');
  if (cut < 0) {
    out.issues.push('description_format');
    return out;
  }
  const path = raw.slice(0, cut).trim();
  const access = raw.slice(cut + 1).trim().toLowerCase().replace(/\s+/g, ' ');
  if (access === 'full access') out.access = 'full';
  else if (access === 'read only') out.access = 'read';
  else out.issues.push('access_unknown');
  if (!pathValid(path)) {
    out.path = path || null;
    out.issues.push('path_format');
    return out;
  }
  out.path = displayPath(path);
  out.pathKey = out.path.toLowerCase();
  out.root = pathIsRoot(path);
  return out;
}

/** The description written for a group: "W:\07-LEGAL;Full Access". */
export function formatDescription(path, type) {
  return `${displayPath(path)};${ACCESS_TEXT[type]}`;
}

export const NAME_PART = /^[a-z0-9][a-z0-9-]{0,40}(?:_[a-z0-9-]{1,40})*$/;
export const PROJECT_PART = /^[a-z0-9-]{1,16}$/;

/** New group names from the template: { full, read }, or null. `name` is the folder part (letters, digits, - and _). */
export function newGroupNames(name, settings = {}, project = null) {
  const part = String(name || '').trim().toLowerCase();
  const code = String(project || settings.defaultProject || '').trim().toLowerCase();
  if (!NAME_PART.test(part) || !PROJECT_PART.test(code)) return null;
  const template = String(settings.nameTemplate || '{prefix}{project}_{name}_{type}').replace('{org}', '{project}');
  const fill = (type) => template.replace('{prefix}', settings.prefix || 'sg_').replace('{project}', code).replace('{name}', part).replace('{type}', type);
  const names = { full: fill('full'), read: fill('read') };
  // sAMAccountName of a group: at most 256, but pre-Windows 2000 tools cut at 20+; keep a sane limit.
  if (names.full.length > 64 || names.read.length > 64) return null;
  return names;
}

/** Pure: does one of `groups` already have one of the new `names` ({ full, read })? AD names are case-insensitive. */
export function nameTaken(names, groups) {
  const wanted = [names.full, names.read].map((item) => String(item).toLowerCase());
  return (groups || []).some((group) => wanted.includes(String(group.name || '').toLowerCase()));
}

/** Where system administrators may change groups: the OU list, else the group search base (else anywhere found). */
export function managedScopes(settings = {}) {
  if ((settings.groupOus || []).length) return settings.groupOus;
  return settings.groupsBase ? [settings.groupsBase] : [];
}

/**
 * One group as the section shows it. `entry` = { dn, name, description, members, sid }.
 * `settings`: the access settings plus `shareMap` ([{ shareId, prefix }]) and `bases`
 * (the search bases, for the project of a group right under one of them).
 */
export function describeGroup(entry, settings = {}) {
  const parsedName = parseGroupName(entry.name, settings);
  const desc = parseDescription(entry.description);
  const other = !parsedName.prefixed;
  const issues = other ? [] : [...parsedName.issues, ...desc.issues];
  if (!other && parsedName.type && desc.access && parsedName.type !== desc.access) issues.push('type_mismatch');
  const mapped = desc.pathKey ? mapPath(desc.path, settings.shareMap) : null;
  if (!other && desc.pathKey && !mapped) issues.push('path_unmapped');
  const isProtected = matchesAny(entry.name, settings.protectedGroups);
  const root = isProtected || (!other && desc.root);
  const scopes = managedScopes(settings);
  const where = projectOf(entry.dn, settings.bases || []);
  return {
    dn: entry.dn,
    name: entry.name,
    description: entry.description || '',
    sid: entry.sid || null,
    memberCount: (entry.members || []).length,
    kind: other ? 'other' : 'sg',
    project: where.project,
    projectDn: where.projectDn,
    groupsOu: where.groupsOu,
    code: parsedName.project,
    stem: parsedName.stem,
    // The description is authoritative; the name's type is the fallback.
    type: desc.access || parsedName.type || null,
    nameType: parsedName.type || null,
    inManagedOu: !scopes.length || scopes.some((scope) => dnUnder(entry.dn, scope)),
    path: desc.path,
    pathKey: desc.pathKey,
    shareId: mapped ? mapped.shareId : null,
    relPath: mapped ? mapped.relPath : null,
    root: Boolean(root),
    protected: isProtected,
    issues,
    needsReview: issues.length > 0,
  };
}

/** Pair key of a group: "<project>_<name>" for sg_ groups, "~<name>" for the rest. */
export function pairKey(group) {
  if (group.kind === 'other' || !group.stem || !group.code) return `~${String(group.name).toLowerCase()}`;
  return `${group.code}_${group.stem}`;
}

/** @deprecated name kept for the NTFS mode: the pair key. */
export const folderKey = pairKey;

/**
 * Groups → pairs: a _full / _read pair per <project>_<name>, other groups on their own.
 * Each pair: { key, kind, name, code, project, projectDn, groupsOu, path, pathKey, shareId, relPath,
 * root, protected, memberCount, groups: { full, read } | { other }, issues, needsReview }.
 */
export function buildPairs(groups) {
  const pairs = new Map();
  for (const group of groups) {
    const key = pairKey(group);
    let pair = pairs.get(key);
    if (!pair) {
      pair = { key, kind: group.kind, name: group.kind === 'other' || !group.stem ? group.name : group.stem, code: group.code, groups: {}, issues: [] };
      pairs.set(key, pair);
    }
    // The name's type decides the slot; a name without one is "unknown" (needs review).
    const slot = group.kind === 'other' ? 'other' : group.nameType || 'unknown';
    if (pair.groups[slot]) pair.issues.push('duplicate_group');
    pair.groups[slot] = group;
  }
  return [...pairs.values()]
    .map((pair) => {
      const list = Object.values(pair.groups);
      const issues = new Set(pair.issues);
      for (const group of list) for (const issue of group.issues) issues.add(issue);
      if (pair.kind === 'sg') {
        if (!pair.groups.full || !pair.groups.read) issues.add('pair_incomplete');
        if (pair.groups.unknown) issues.add('name_format');
        const paths = new Set(list.map((group) => group.pathKey).filter(Boolean));
        if (paths.size > 1) issues.add('path_mismatch');
      }
      const main = pair.groups.full || pair.groups.read || list[0];
      return {
        ...pair,
        project: main.project,
        projectDn: main.projectDn,
        groupsOu: main.groupsOu,
        path: main.path,
        pathKey: main.pathKey,
        shareId: main.shareId,
        relPath: main.relPath,
        root: list.some((group) => group.root),
        protected: list.some((group) => group.protected),
        memberCount: list.reduce((sum, group) => sum + group.memberCount, 0),
        issues: [...issues],
        needsReview: pair.kind === 'sg' && issues.size > 0,
      };
    })
    .sort((a, b) => (a.kind === b.kind ? String(a.path || a.name).localeCompare(String(b.path || b.name)) || a.key.localeCompare(b.key) : a.kind === 'sg' ? -1 : 1));
}

/** Folder key of a pair: "p:<path key>" when its description names a folder, else "n:<pair key>" / "~<name>". */
export const folderKeyOf = (pair) => (pair.kind === 'sg' && pair.pathKey ? `p:${pair.pathKey}` : pair.kind === 'other' ? pair.key : `n:${pair.key}`);

const lastPart = (path) => {
  const { parts } = splitPath(path);
  return parts.length ? parts[parts.length - 1] : '';
};

/**
 * Groups → folders: the pairs grouped by the folder their descriptions name (two pairs may
 * open the same folder), other groups and pairs without a usable path on their own.
 * Each folder: { key, kind, name, path, pathKey, project, projectDn, shareId, relPath, mapped,
 * pairs: [pair], root, protected, memberCount, issues, needsReview }.
 */
export function buildFolders(groups) {
  const folders = new Map();
  for (const pair of buildPairs(groups)) {
    const key = folderKeyOf(pair);
    let folder = folders.get(key);
    if (!folder) {
      folder = { key, kind: pair.kind, path: pair.path, pathKey: pair.pathKey, name: pair.kind === 'sg' && pair.pathKey ? lastPart(pair.path) : pair.name, pairs: [] };
      folders.set(key, folder);
    }
    folder.pairs.push(pair);
  }
  return [...folders.values()]
    .map((folder) => {
      const main = folder.pairs.find((pair) => pair.project) || folder.pairs[0];
      const issues = new Set();
      for (const pair of folder.pairs) for (const issue of pair.issues) issues.add(issue);
      return {
        ...folder,
        project: main.project || null,
        projectDn: main.projectDn || null,
        shareId: main.shareId,
        relPath: main.relPath,
        mapped: main.shareId != null,
        root: folder.pairs.some((pair) => pair.root),
        protected: folder.pairs.some((pair) => pair.protected),
        memberCount: folder.pairs.reduce((sum, pair) => sum + pair.memberCount, 0),
        issues: [...issues],
        needsReview: folder.kind === 'sg' && issues.size > 0,
      };
    })
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'sg' ? -1 : 1) ||
        String(a.project || '\uffff').localeCompare(String(b.project || '\uffff')) ||
        String(a.path || a.name).localeCompare(String(b.path || b.name))
    );
}

/** Folders above `pathKeys` (any of them) that have groups: inherited access, nearest first. */
export function ancestorFolders(folders, keys) {
  const wanted = (Array.isArray(keys) ? keys : [keys]).filter(Boolean).map((key) => String(key).toLowerCase());
  return (folders || [])
    .filter((folder) => folder.kind === 'sg' && folder.pathKey && wanted.some((key) => key !== folder.pathKey && pathBelow(key, folder.path)))
    .sort((a, b) => splitPath(b.path).parts.length - splitPath(a.path).parts.length);
}

/** Person kind from objectClass (computers are users too, so they are checked first). */
export function objectKind(objectClass) {
  const classes = (Array.isArray(objectClass) ? objectClass : [objectClass]).map((value) => String(value || '').toLowerCase());
  if (classes.includes('computer')) return 'computer';
  if (classes.includes('group')) return 'group';
  if (classes.includes('foreignsecurityprincipal')) return 'foreign';
  if (classes.includes('contact')) return 'contact';
  if (classes.includes('user') || classes.includes('person') || classes.includes('inetorgperson')) return 'user';
  return 'other';
}

/** userAccountControl bit 2 (ACCOUNTDISABLE). */
export function isDisabled(userAccountControl) {
  const value = Number(Array.isArray(userAccountControl) ? userAccountControl[0] : userAccountControl);
  return Number.isFinite(value) && (value & 2) === 2;
}

/** groupType with the security bit (0x80000000): distribution lists are not access groups. */
export function isSecurityGroup(groupType) {
  if (groupType == null || groupType === '') return true;
  const value = Number(Array.isArray(groupType) ? groupType[0] : groupType);
  if (!Number.isFinite(value)) return true;
  return (value & 0x80000000) !== 0;
}

/** Binary objectSid → "S-1-5-21-…". */
export function sidToString(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  const revision = buffer[0];
  const count = buffer[1];
  if (buffer.length < 8 + count * 4) return null;
  const authority = buffer.readUIntBE(2, 6);
  const subs = [];
  for (let i = 0; i < count; i += 1) subs.push(buffer.readUInt32LE(8 + i * 4));
  return `S-${revision}-${authority}${subs.map((sub) => `-${sub}`).join('')}`;
}
