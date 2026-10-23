/*
 * AD directory settings (settings.modules.directory, docs/directory.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads `defaults`
 * from here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`) — moved out of the core's modules/catalog.js. Plain data and
 * pure functions, no imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

// Infrastructure: off until an administrator turns it on; works only with the AD integration (or the demo directory).
export const defaultEnabled = false;

/** Attributes the directory module can edit; settings choose a subset. */
export const DIRECTORY_ATTRIBUTES = ['givenName', 'sn', 'initials', 'displayName', 'description', 'title', 'department', 'company', 'mail', 'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName', 'employeeID', 'l', 'manager'];

export const DIRECTORY_DEFAULTS = {
  // The managed root (an OU such as OU=Accounts,DC=example,DC=local). Empty: nothing is shown.
  rootDn: '',
  // Hidden and never changed: OU DNs (with their subtree) or OU name patterns ("Service*", "Admins").
  excluded: [],
  // Hidden accounts by login or name pattern ("svc_*", "adm-*").
  hiddenAccounts: [],
  editableAttributes: ['displayName', 'givenName', 'sn', 'title', 'department', 'company', 'mail', 'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName', 'description', 'manager'],
  allowCreate: true,
  // sAMAccountName of new users: {first} {last} {middle}, {f} {l} {m} = first letters (transliterated).
  loginTemplate: '{f}.{last}',
  // UPN suffixes offered (empty: the DNS domain of the base DN).
  upnSuffixes: [],
  // Mail of new users, e.g. {login}@example.com (empty: none).
  mailTemplate: '',
  defaultUserOu: '',
  // OU for new users per org unit: [{ unitId, ou }] (the nearest mapped unit above wins).
  unitOus: [],
  // Where «Offboard» moves disabled accounts (empty: not offered).
  disabledOu: '',
  passwordMinLength: 12,
  passwordComplexity: true,
  passwordHint: '',
  mustChangeDefault: true,
  // Password operations over StartTLS when the integration is plain LDAP (AD requires a secure channel).
  startTls: false,
  inactiveDays: 90,
};

const DN_LIKE = /^[A-Za-z][A-Za-z0-9-]*=[^\u0000]+$/;
const cleanDnText = (value) => {
  const text = String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 1000);
  return text && DN_LIKE.test(text) ? text : '';
};
const cleanTextList = (list, max, len, test = () => true) =>
  Array.isArray(list) ? [...new Set(list.map((item) => String(item ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, len)).filter((item) => item && test(item)))].slice(0, max) : null;

export function sanitizeDirectory(current, incoming = {}) {
  const next = { ...DIRECTORY_DEFAULTS, ...(current || {}) };
  if (!incoming || typeof incoming !== 'object') return next;
  for (const key of ['rootDn', 'defaultUserOu', 'disabledOu']) if (incoming[key] !== undefined) next[key] = cleanDnText(incoming[key]);
  const excluded = cleanTextList(incoming.excluded, 50, 1000);
  if (excluded) next.excluded = excluded;
  const hidden = cleanTextList(incoming.hiddenAccounts, 50, 64);
  if (hidden) next.hiddenAccounts = hidden;
  const attrs = cleanTextList(incoming.editableAttributes, DIRECTORY_ATTRIBUTES.length, 64, (item) => DIRECTORY_ATTRIBUTES.includes(item));
  if (attrs) next.editableAttributes = attrs;
  const suffixes = cleanTextList(incoming.upnSuffixes, 10, 120, (item) => /^@?[a-z0-9.-]+\.[a-z0-9-]+$/i.test(item));
  if (suffixes) next.upnSuffixes = suffixes.map((item) => item.replace(/^@/, '').toLowerCase());
  if (incoming.loginTemplate !== undefined) {
    const template = String(incoming.loginTemplate || '').trim().slice(0, 60);
    if (/\{(first|last|f|l)\}/.test(template) && /^[a-z0-9._{}-]+$/i.test(template)) next.loginTemplate = template;
  }
  if (incoming.mailTemplate !== undefined) {
    const template = String(incoming.mailTemplate || '').trim().slice(0, 120);
    next.mailTemplate = !template || /^[a-z0-9._{}-]+@[a-z0-9.{}-]+$/i.test(template) ? template : next.mailTemplate;
  }
  if (Array.isArray(incoming.unitOus)) {
    next.unitOus = incoming.unitOus
      .map((item) => ({ unitId: clampInt(item?.unitId, 1, 2 ** 31 - 1, 0), ou: cleanDnText(item?.ou) }))
      .filter((item) => item.unitId && item.ou)
      .slice(0, 200);
  }
  if (incoming.passwordMinLength !== undefined) next.passwordMinLength = clampInt(incoming.passwordMinLength, 6, 64, 12);
  if (incoming.passwordHint !== undefined) next.passwordHint = String(incoming.passwordHint || '').slice(0, 300);
  if (incoming.inactiveDays !== undefined) next.inactiveDays = clampInt(incoming.inactiveDays, 7, 3650, 90);
  for (const key of ['allowCreate', 'passwordComplexity', 'mustChangeDefault', 'startTls']) if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
  return Object.fromEntries(Object.keys(DIRECTORY_DEFAULTS).map((key) => [key, next[key]]));
}

export const defaults = DIRECTORY_DEFAULTS;
export const sanitizeSettings = sanitizeDirectory;
