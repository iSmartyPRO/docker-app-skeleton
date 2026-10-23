/*
 * File server settings (settings.modules.drive, docs/drive.md, docs/drive-access.md):
 * the defaults the package manifest carries (scripts/build-module.mjs reads
 * `defaults` from here), the sanitizer the portal uses for them and the upgrade of
 * stored settings (index.js exports them as `sanitizeSettings` / `upgradeSettings`)
 * — moved out of the core's modules/catalog.js. Plain data and pure functions, no
 * imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

// Off until an administrator adds a file server.
export const defaultEnabled = false;

// «Управление доступом» (docs/drive-access.md)

export const DRIVE_ACCESS_NTFS_RIGHTS = ['modify', 'read_execute', 'read', 'full_control'];

/** File server → «Управление доступом» block: modules.drive.settings.access. */
export const DRIVE_ACCESS_DEFAULTS = {
  // The block's own switch (the File server module must be on as well).
  enabled: false,
  // Security groups that open folders: <prefix><project>_<name>_<full|read>, e.g. sg_obj2_buh_full.
  prefix: 'sg_',
  // Project codes accepted in names (empty = any), and the code for new groups when the
  // project cannot be taken from the folder's other groups.
  projects: [],
  defaultProject: '',
  // Old project code → the one new pairs get instead (e.g. { wh: 'co' } while wh is being renamed to co).
  projectAliases: {},
  // New group names: {prefix} {project} {name} {type} (type = full | read; {org} = {project}).
  nameTemplate: '{prefix}{project}_{name}_{type}',
  // Where the groups are searched ('' = the Active Directory base DN, i.e. every project).
  groupsBase: '',
  // Optional: only these OUs (each searched with its subtree) instead of groupsBase.
  groupOus: [],
  // New group pairs go to the Groups OU of the folder's project; this OU is the fallback
  // when no group of that project is known ('' = then creating is off).
  newGroupOu: '',
  // People and NTFS subjects ('' = the domain root derived from the base DN).
  subjectsBase: '',
  // Access type → NTFS rights.
  typeMap: { full: 'modify', read: 'read_execute' },
  // Groups a system administrator may not touch (glob, case-insensitive).
  protectedGroups: ['sg_*_root_*'],
  // Groups without the prefix that superadministrators also see (glob).
  otherGroups: ['nextcloud_*'],
};

const faText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const faDn = (value) => {
  const text = faText(value, 500);
  return !text || /^[a-z][\w-]*=[^,]+(,\s*[a-z][\w-]*=[^,]+)*$/i.test(text) ? text : null;
};
const faPatterns = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => faText(item, 64).toLowerCase()).filter((item) => /^[a-z0-9_.*-]+$/.test(item) && item !== '*'))].slice(0, 20);
const faCode = (value) => faText(value, 16).toLowerCase();
const PROJECT_CODE = /^[a-z0-9-]{1,16}$/;

/** { old: new } project code aliases (both valid codes, no self-maps, at most 100); a "wh=co" text list is accepted too. */
export function sanitizeProjectAliases(value) {
  let pairs = [];
  if (typeof value === 'string') pairs = value.split(/[\n,;]+/).map((line) => line.split(/\s*(?:=|→|->|:)\s*/));
  else if (Array.isArray(value)) pairs = value.map((row) => (Array.isArray(row) ? row : [row?.from, row?.to]));
  else if (value && typeof value === 'object') pairs = Object.entries(value);
  const out = {};
  for (const [from, to] of pairs) {
    const a = faCode(from);
    const b = faCode(to);
    if (PROJECT_CODE.test(a) && PROJECT_CODE.test(b) && a !== b && Object.keys(out).length < 100) out[a] = b;
  }
  return out;
}

/** The access block of the File server settings, cleaned. Unknown keys are dropped. */
export function sanitizeDriveAccess(current = DRIVE_ACCESS_DEFAULTS, incoming = {}) {
  const next = { ...DRIVE_ACCESS_DEFAULTS, ...(current || {}) };
  if (!incoming || typeof incoming !== 'object') return next;
  if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
  if (incoming.prefix !== undefined) {
    const prefix = faText(incoming.prefix, 16).toLowerCase();
    if (/^[a-z0-9_-]{1,16}$/.test(prefix)) next.prefix = prefix;
  }
  if (Array.isArray(incoming.projects)) next.projects = [...new Set(incoming.projects.map(faCode).filter((code) => PROJECT_CODE.test(code)))].slice(0, 100);
  if (incoming.defaultProject !== undefined) {
    const code = faCode(incoming.defaultProject);
    if (!code || PROJECT_CODE.test(code)) next.defaultProject = code;
  }
  if (incoming.projectAliases !== undefined) next.projectAliases = sanitizeProjectAliases(incoming.projectAliases);
  if (incoming.nameTemplate !== undefined) {
    const template = faText(incoming.nameTemplate, 80).replace('{org}', '{project}');
    if (template.includes('{name}') && template.includes('{type}') && /^[a-z0-9_{}-]+$/i.test(template)) next.nameTemplate = template;
  }
  for (const key of ['groupsBase', 'newGroupOu', 'subjectsBase']) {
    if (incoming[key] !== undefined) {
      const dn = faDn(incoming[key]);
      if (dn !== null) next[key] = dn;
    }
  }
  if (Array.isArray(incoming.groupOus)) next.groupOus = [...new Set(incoming.groupOus.map(faDn).filter(Boolean))].slice(0, 50);
  if (incoming.typeMap && typeof incoming.typeMap === 'object') {
    const map = { ...next.typeMap };
    for (const type of ['full', 'read']) {
      if (DRIVE_ACCESS_NTFS_RIGHTS.includes(incoming.typeMap[type])) map[type] = incoming.typeMap[type];
    }
    next.typeMap = map;
  }
  if (incoming.protectedGroups !== undefined) next.protectedGroups = faPatterns(incoming.protectedGroups);
  if (incoming.otherGroups !== undefined) next.otherGroups = faPatterns(incoming.otherGroups);
  return Object.fromEntries(Object.keys(DRIVE_ACCESS_DEFAULTS).map((key) => [key, next[key]]));
}

/** Stored drive settings over the defaults: the nested access block is merged too. */
export function upgradeDrive(settings, saved = {}) {
  return { ...settings, access: { ...DRIVE_ACCESS_DEFAULTS, ...(saved.access && typeof saved.access === 'object' ? saved.access : {}) } };
}

export const DRIVE_DEFAULTS = {
  // Name in the menu and launcher, e.g. "Company Drive" (empty = "File server").
  title: '',
  tagline: '',
  // Reuse the Active Directory sign-in password for file servers (stored sealed).
  rememberLogin: true,
  // Hide folders the person has no rights to instead of showing them locked.
  hideDenied: true,
  maxUploadMb: 2048,
  publicLinks: true,
  // Who links may be opened by: 'any' (choice per link) or 'employees' (signed-in only).
  linkAudience: 'any',
  requireLinkPassword: false,
  maxLinkDays: 0,
  // Links that let visitors upload, rename or delete (with the author's rights).
  linkWrite: true,
  // Such links need a password.
  requireWritePassword: false,
  // How a file opens: 'page' (its own page with an address) or 'modal' (over the folder).
  openMode: 'page',
  // Activity log (drive.audit): on/off, folder listings too, days to keep (0 = forever).
  activityLog: true,
  logBrowsing: true,
  activityDays: 365,
  // «Управление доступом»: folder access groups in Active Directory and NTFS permissions.
  access: DRIVE_ACCESS_DEFAULTS,
};

export const defaults = DRIVE_DEFAULTS;

export function sanitizeDrive(current, incoming = {}) {
const next = { ...current };
for (const key of ['title', 'tagline']) {
  if (typeof incoming[key] === 'string') next[key] = incoming[key].replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, key === 'title' ? 40 : 160);
}
for (const flag of ['rememberLogin', 'hideDenied', 'publicLinks', 'requireLinkPassword', 'linkWrite', 'requireWritePassword', 'activityLog', 'logBrowsing']) {
  if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
}
if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 10240, 2048);
if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
if (incoming.activityDays !== undefined) next.activityDays = clampInt(incoming.activityDays, 0, 3650, 365);
if (['any', 'employees'].includes(incoming.linkAudience)) next.linkAudience = incoming.linkAudience;
if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
if (incoming.access && typeof incoming.access === 'object') next.access = sanitizeDriveAccess(current.access, incoming.access);
return next;
}

export const sanitizeSettings = sanitizeDrive;
export const upgradeSettings = upgradeDrive;
