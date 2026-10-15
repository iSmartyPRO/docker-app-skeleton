/*
 * Folder access groups: names, descriptions and folders (pure, no I/O).
 *
 *   sg_co_hr_full   description "W:\06-HR;Full Access"
 *   sg_co_hr_read   description "W:\06-HR;Read Only"
 *
 * <prefix><org>_<name>_<full|read>: the prefix and the accepted organisation
 * codes come from the module settings (wh is the old code of co). The
 * description names the folder (drive letter + path) and the access type.
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

/** "CN=Ivanov\, Ivan,OU=…" → "Ivanov, Ivan". */
export function cnOf(dn) {
  const match = /^\s*[a-z]+=((?:\\.|[^,\\])+)/i.exec(String(dn || ''));
  return match ? match[1].replace(/\\(.)/g, '$1').trim() : String(dn || '');
}

/** "OU=Accounts,DC=corp,DC=example" → "DC=corp,DC=example". */
export function domainRoot(baseDn) {
  const parts = [...String(baseDn || '').matchAll(/DC=([^,]+)/gi)].map((match) => `DC=${match[1].trim()}`);
  return parts.join(',');
}

/**
 * Group name → { name, prefixed, org, dept, type, legacyOrg, issues }.
 * `issues`: 'name_format' (prefix but no _full/_read), 'org_unknown'.
 */
export function parseGroupName(name, settings) {
  const text = String(name || '').trim();
  const prefix = String(settings.prefix || 'sg_').toLowerCase();
  const out = { name: text, prefixed: false, org: null, dept: null, type: null, legacyOrg: false, issues: [] };
  if (!text.toLowerCase().startsWith(prefix)) return out;
  out.prefixed = true;
  const match = new RegExp(`^${escapeRe(prefix)}([a-z0-9]+)_(.+)_(full|read)$`, 'i').exec(text);
  if (!match) {
    out.issues.push('name_format');
    const loose = new RegExp(`^${escapeRe(prefix)}([a-z0-9]+)_(.+)$`, 'i').exec(text);
    if (loose) {
      out.org = loose[1].toLowerCase();
      out.dept = loose[2].toLowerCase();
    }
    return out;
  }
  out.org = match[1].toLowerCase();
  out.dept = match[2].toLowerCase();
  out.type = match[3].toLowerCase();
  const codes = (settings.orgCodes || []).map((code) => String(code).toLowerCase());
  if (!codes.includes(out.org)) out.issues.push('org_unknown');
  else if (out.org !== String(settings.orgCode || '').toLowerCase()) out.legacyOrg = true;
  return out;
}

/**
 * Description "W:\06-ACCOUNTING;Full Access" →
 * { raw, path: 'W:\06-ACCOUNTING', letter: 'W', relPath: '06-ACCOUNTING', access: 'full', issues }.
 * `issues`: 'description_missing', 'description_format', 'access_unknown', 'path_format'.
 */
export function parseDescription(description) {
  const raw = String(description ?? '').trim();
  const out = { raw, path: null, letter: null, relPath: null, access: null, issues: [] };
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
  out.path = path || null;
  const drive = /^([a-z]):(?:[\\/](.*))?$/i.exec(path);
  if (!drive) {
    out.issues.push('path_format');
    return out;
  }
  out.letter = drive[1].toUpperCase();
  out.relPath = String(drive[2] || '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/');
  return out;
}

/** The description written for a group: "W:\07-LEGAL;Full Access". */
export function formatDescription(path, type) {
  return `${String(path).trim()};${ACCESS_TEXT[type]}`;
}

/** New group names from the template: { full, read }. `name` is the folder part (letters, digits, - and _). */
export function newGroupNames(name, settings) {
  const part = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,40}(?:_[a-z0-9-]{1,40})*$/.test(part)) return null;
  const template = settings.nameTemplate || '{prefix}{org}_{name}_{type}';
  const fill = (type) =>
    template.replace('{prefix}', settings.prefix || 'sg_').replace('{org}', settings.orgCode || 'co').replace('{name}', part).replace('{type}', type);
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

/**
 * One group as the module shows it. `entry` = { dn, name, description, members, sid }.
 * Adds parsed name, description, root/other flags, the File server folder and the review flag.
 */
export function describeGroup(entry, settings) {
  const parsedName = parseGroupName(entry.name, settings);
  const desc = parseDescription(entry.description);
  const other = !parsedName.prefixed;
  const issues = other ? [] : [...parsedName.issues, ...desc.issues];
  if (!other && parsedName.type && desc.access && parsedName.type !== desc.access) issues.push('type_mismatch');
  const share = desc.letter ? (settings.driveMap || []).find((row) => row.letter === desc.letter) : null;
  if (!other && desc.letter && !share) issues.push('drive_unmapped');
  const root = matchesAny(entry.name, settings.protectedGroups) || (!other && desc.letter && !desc.relPath && !desc.issues.includes('path_format'));
  // Where system administrators may change groups: the group search base, else the OU for new groups.
  const managedOu = settings.groupsBase || settings.newGroupOu || '';
  return {
    dn: entry.dn,
    name: entry.name,
    description: entry.description || '',
    sid: entry.sid || null,
    memberCount: (entry.members || []).length,
    kind: other ? 'other' : 'sg',
    org: parsedName.org,
    dept: parsedName.dept,
    type: parsedName.type || desc.access || null,
    nameType: parsedName.type || null,
    inManagedOu: !managedOu || normDn(entry.dn).endsWith(`,${normDn(managedOu)}`),
    legacyOrg: parsedName.legacyOrg,
    path: desc.path,
    letter: desc.letter,
    relPath: desc.relPath,
    shareId: share ? share.shareId : null,
    root: Boolean(root),
    protected: matchesAny(entry.name, settings.protectedGroups),
    issues,
    needsReview: issues.length > 0,
  };
}

/** Folder key of a group: "<org>_<dept>" for sg_ groups, "~<name>" for the rest. */
export function folderKey(group) {
  if (group.kind === 'other' || !group.dept) return `~${String(group.name).toLowerCase()}`;
  return `${group.org}_${group.dept}`;
}

/**
 * Groups → folders: a _full / _read pair per <org>_<name>, other groups on their own.
 * Each folder: { key, kind, name, org, dept, path, letter, relPath, shareId, root, protected, groups: { full, read } | { other }, issues, needsReview }.
 */
export function buildFolders(groups) {
  const folders = new Map();
  for (const group of groups) {
    const key = folderKey(group);
    let folder = folders.get(key);
    if (!folder) {
      folder = { key, kind: group.kind, name: group.kind === 'other' ? group.name : group.dept, org: group.org, dept: group.dept, groups: {}, issues: [] };
      folders.set(key, folder);
    }
    const slot = group.kind === 'other' ? 'other' : group.type || 'unknown';
    if (folder.groups[slot]) folder.issues.push('duplicate_group');
    folder.groups[slot] = group;
  }
  return [...folders.values()]
    .map((folder) => {
      const list = Object.values(folder.groups);
      const issues = new Set(folder.issues);
      for (const group of list) for (const issue of group.issues) issues.add(issue);
      if (folder.kind === 'sg') {
        if (!folder.groups.full || !folder.groups.read) issues.add('pair_incomplete');
        if (folder.groups.unknown) issues.add('name_format');
        const paths = new Set(list.map((group) => (group.path ? group.path.toLowerCase() : null)).filter(Boolean));
        if (paths.size > 1) issues.add('path_mismatch');
      }
      const main = folder.groups.full || folder.groups.read || list[0];
      return {
        ...folder,
        path: main.path,
        letter: main.letter,
        relPath: main.relPath,
        shareId: main.shareId,
        legacyOrg: list.some((group) => group.legacyOrg),
        root: list.some((group) => group.root),
        protected: list.some((group) => group.protected),
        memberCount: list.reduce((sum, group) => sum + group.memberCount, 0),
        issues: [...issues],
        needsReview: folder.kind === 'sg' && issues.size > 0,
      };
    })
    .sort((a, b) => (a.kind === b.kind ? String(a.path || a.name).localeCompare(String(b.path || b.name)) : a.kind === 'sg' ? -1 : 1));
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
