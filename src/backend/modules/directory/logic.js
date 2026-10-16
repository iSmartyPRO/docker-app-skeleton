import { AndFilter, EqualityFilter, ExtensibleFilter, GreaterThanEqualsFilter, LessThanEqualsFilter, NotFilter, OrFilter, PresenceFilter, SubstringFilter } from 'ldapts';
import { canonDn, canonRdn, dnsDomainOf, isUnder, nameOf, parentDn, parseDn, pathBetween } from './dn.js';

/*
 * Pure rules of the AD directory module (docs/directory.md): what is in scope,
 * object shapes and statuses, list filters (compiled to LDAP filter objects,
 * which escape every value per RFC 4515, and evaluated in JS for the demo
 * directory), the sAMAccountName template, the password policy hints.
 */

export const httpError = (statusCode, message, code, details) => Object.assign(new Error(message), { statusCode, code, ...(details ? { details } : {}) });

// ── scope: managed root, excluded OUs, hidden accounts ──────────────────────

const globRe = (pattern) => new RegExp(`^${String(pattern).trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
/** An exclusion entry that is a DN (has "=" and a DC part or a comma) vs a name pattern ("Service*", "OU=Admins"). */
const isDnEntry = (entry) => /,/.test(entry) && Boolean(parseDn(entry));

/**
 * The scope of the module from its settings: { root: rdns, rootDn, excludedDns: [rdns], patterns: [RegExp], hidden: [RegExp] }.
 * `excluded` entries: full DNs (that OU and its subtree) or OU name patterns with * and ?
 * ("Service*", "OU=Admins" — any OU of that name below the root).
 * `hiddenAccounts`: sAMAccountName / name patterns ("svc_*", "adm-*").
 */
export function scopeOf(settings = {}) {
  const root = parseDn(settings.rootDn);
  const excludedDns = [];
  const patterns = [];
  for (const raw of settings.excluded || []) {
    const entry = String(raw || '').trim();
    if (!entry) continue;
    if (isDnEntry(entry)) excludedDns.push(parseDn(entry));
    else patterns.push(globRe(entry.replace(/^(ou|cn)\s*=\s*/i, '')));
  }
  const hidden = (settings.hiddenAccounts || []).map((entry) => String(entry || '').trim()).filter(Boolean).map(globRe);
  return { root, rootDn: root ? settings.rootDn : null, excludedDns, patterns, hidden };
}

/**
 * Where a DN stands: 'inside' (the root or below, nothing excluded on the way), 'root'
 * (the root itself), 'outside', 'excluded' (an excluded OU or anything below one) or 'invalid'.
 */
export function placeOf(dn, scope) {
  const rdns = parseDn(dn);
  if (!rdns) return 'invalid';
  if (!scope?.root || !isUnder(rdns, scope.root)) return 'outside';
  if (rdns.length === scope.root.length) return 'root';
  if (scope.excludedDns.some((excluded) => isUnder(rdns, excluded))) return 'excluded';
  // Containers between the root and the object (its own RDN too when it is an OU).
  const between = rdns.slice(0, rdns.length - scope.root.length);
  const containers = between.filter((rdn, index) => index > 0 || /^(ou)$/i.test(rdn.type));
  if (containers.some((rdn) => scope.patterns.some((re) => re.test(rdn.value.trim())))) return 'excluded';
  return 'inside';
}

export const inScope = (dn, scope) => ['inside', 'root'].includes(placeOf(dn, scope));

/** A hidden account (by its login or name)? */
export function isHiddenAccount(object, scope) {
  if (!scope?.hidden?.length || !object) return false;
  const names = [object.login, object.name, nameOf(object.dn)].filter(Boolean).map(String);
  return names.some((name) => scope.hidden.some((re) => re.test(name)));
}

/** Visible in the module: in scope and not hidden. */
export const visible = (object, scope) => inScope(object.dn, scope) && !isHiddenAccount(object, scope);

/** Refusal for a change of `dn` (object or OU), or null. Error codes: AD_OUTSIDE_ROOT, AD_EXCLUDED, AD_BAD_DN. */
export function scopeRefusal(dn, scope, { allowRoot = false } = {}) {
  const place = placeOf(dn, scope);
  if (place === 'invalid') return httpError(400, 'Not a valid distinguished name', 'AD_BAD_DN');
  if (place === 'outside') return httpError(403, 'The object is outside the managed root', 'AD_OUTSIDE_ROOT');
  if (place === 'excluded') return httpError(403, 'The object is in an excluded OU', 'AD_EXCLUDED');
  if (place === 'root' && !allowRoot) return httpError(403, 'The managed root itself cannot be changed', 'AD_ROOT');
  return null;
}

/** OU path below the root of an object: ["North", "Users"] for CN=a,OU=Users,OU=North,<root>. */
export const ouPath = (dn, scope) => (scope?.rootDn ? pathBetween(dn, scope.rootDn).map((rdn) => rdn.value) : []);

/** OU path below the root of an OU itself, the OU included. */
export const ouPathOf = (ouDn, scope) => ouPath(`CN=x,${ouDn}`, scope);

// ── values ──────────────────────────────────────────────────────────────────

export const UAC = {
  ACCOUNTDISABLE: 0x2,
  LOCKOUT: 0x10,
  PASSWD_NOTREQD: 0x20,
  NORMAL_ACCOUNT: 0x200,
  WORKSTATION_TRUST_ACCOUNT: 0x1000,
  DONT_EXPIRE_PASSWORD: 0x10000,
  PASSWORD_EXPIRED: 0x800000,
};

const first = (value) => (Array.isArray(value) ? value[0] : value);
const str = (value) => {
  const item = first(value);
  if (item == null) return null;
  const text = Buffer.isBuffer(item) ? item.toString('utf8') : String(item);
  return text === '' ? null : text;
};
const list = (value) => (value == null ? [] : (Array.isArray(value) ? value : [value]).map((item) => (Buffer.isBuffer(item) ? item.toString('utf8') : String(item))));
export const lowerKeys = (entry) => Object.fromEntries(Object.entries(entry || {}).map(([key, value]) => [key.toLowerCase(), value]));

const NEVER = 9223372036854775807n;
const EPOCH_DIFF = 116444736000000000n;

/** AD FILETIME (100 ns since 1601, as a string) → Date, or null for 0 / "never". */
export function fileTime(value) {
  const text = str(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const n = BigInt(text);
  if (n <= 0n || n >= NEVER) return null;
  return new Date(Number((n - EPOCH_DIFF) / 10000n));
}

/** Date → AD FILETIME string. */
export const toFileTime = (date) => String(BigInt(date.getTime()) * 10000n + EPOCH_DIFF);

/** "20241001093000.0Z" → Date. */
export function generalizedTime(value) {
  const text = str(value);
  const match = text && /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(text);
  return match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6])) : null;
}

/** Group type: { security, scope: 'global' | 'domainLocal' | 'universal' | 'builtin' }. */
export function groupTypeOf(value) {
  const n = Number(str(value));
  if (!Number.isFinite(n)) return { security: true, scope: 'global' };
  const scope = n & 0x1 ? 'builtin' : n & 0x4 ? 'domainLocal' : n & 0x8 ? 'universal' : 'global';
  return { security: (n & 0x80000000) !== 0, scope };
}

export function kindOf(objectClass) {
  const classes = list(objectClass).map((value) => value.toLowerCase());
  if (classes.includes('computer')) return 'computer';
  if (classes.includes('group')) return 'group';
  if (classes.includes('organizationalunit')) return 'ou';
  if (classes.includes('container') || classes.includes('builtindomain')) return 'container';
  if (classes.includes('contact')) return 'contact';
  if (classes.includes('user') || classes.includes('person') || classes.includes('inetorgperson')) return 'user';
  return 'other';
}

/** objectGUID bytes → "xxxxxxxx-…" (lower case), or a stored text GUID as is. */
export function guidOf(value) {
  const raw = first(value);
  if (Buffer.isBuffer(raw) && raw.length === 16) {
    const hex = (bytes) => Buffer.from(bytes).toString('hex');
    return [hex([...raw.subarray(0, 4)].reverse()), hex([...raw.subarray(4, 6)].reverse()), hex([...raw.subarray(6, 8)].reverse()), hex(raw.subarray(8, 10)), hex(raw.subarray(10, 16))].join('-');
  }
  const text = str(raw);
  return text && /^[0-9a-f-]{36}$/i.test(text) ? text.toLowerCase() : null;
}

/**
 * A directory entry (raw attributes, any case) as the module shows it. `now` and `maxPwdAgeDays`
 * (the domain policy, 0 = never) decide the password expiry when AD did not compute it.
 */
export function shapeObject(entry, { now = new Date(), maxPwdAgeDays = 0, scope = null } = {}) {
  const a = lowerKeys(entry);
  const dn = entry.dn || str(a.distinguishedname);
  const kind = kindOf(a.objectclass);
  const uac = Number(str(a.useraccountcontrol)) || 0;
  const computed = Number(str(a['msds-user-account-control-computed'])) || 0;
  const pwdLastSet = fileTime(a.pwdlastset);
  const pwdRaw = str(a.pwdlastset);
  const lockoutTime = fileTime(a.lockouttime);
  const lastLogon = fileTime(a.lastlogontimestamp);
  const neverExpires = Boolean(uac & UAC.DONT_EXPIRE_PASSWORD);
  let pwdExpires = null;
  const expiryComputed = str(a['msds-userpasswordexpirytimecomputed']);
  if (expiryComputed != null) pwdExpires = fileTime(expiryComputed);
  else if (pwdLastSet && maxPwdAgeDays > 0 && !neverExpires) pwdExpires = new Date(pwdLastSet.getTime() + maxPwdAgeDays * 86400000);
  const mustChange = kind === 'user' && pwdRaw === '0';
  const pwdExpired = kind === 'user' && !neverExpires && (Boolean(computed & UAC.PASSWORD_EXPIRED) || mustChange || Boolean(pwdExpires && pwdExpires <= now));
  const photo = first(a.thumbnailphoto);
  const groupType = kind === 'group' ? groupTypeOf(a.grouptype) : null;
  const object = {
    dn,
    kind,
    name: str(a.displayname) || str(a.cn) || str(a.name) || str(a.ou) || nameOf(dn),
    cn: str(a.cn) || str(a.ou) || nameOf(dn),
    login: str(a.samaccountname),
    upn: str(a.userprincipalname),
    mail: str(a.mail),
    givenName: str(a.givenname),
    sn: str(a.sn),
    initials: str(a.initials),
    title: str(a.title),
    department: str(a.department),
    company: str(a.company),
    manager: str(a.manager),
    phone: str(a.telephonenumber),
    mobile: str(a.mobile),
    office: str(a.physicaldeliveryofficename),
    description: str(a.description),
    employeeId: str(a.employeeid),
    city: str(a.l),
    guid: guidOf(a.objectguid),
    uac: kind === 'user' || kind === 'computer' ? uac : null,
    enabled: kind === 'user' || kind === 'computer' ? !(uac & UAC.ACCOUNTDISABLE) : null,
    locked: kind === 'user' ? Boolean(computed & UAC.LOCKOUT) || Boolean(lockoutTime) : false,
    pwdLastSet: pwdLastSet ? pwdLastSet.toISOString() : null,
    pwdExpires: pwdExpires ? pwdExpires.toISOString() : null,
    pwdNeverExpires: neverExpires,
    mustChange,
    pwdExpired,
    lastLogon: lastLogon ? lastLogon.toISOString() : null,
    created: generalizedTime(a.whencreated)?.toISOString() || null,
    changed: generalizedTime(a.whenchanged)?.toISOString() || null,
    accountExpires: fileTime(a.accountexpires)?.toISOString() || null,
    protected: str(a.admincount) === '1',
    memberOf: list(a.memberof),
    members: kind === 'group' ? list(a.member) : undefined,
    groupType,
    os: str(a.operatingsystem),
    osVersion: str(a.operatingsystemversion),
    host: str(a.dnshostname),
    photo: Buffer.isBuffer(photo) && photo.length && photo.length < 200000 ? `data:image/jpeg;base64,${photo.toString('base64')}` : null,
    parentDn: parentDn(dn),
  };
  if (scope) object.path = ouPath(dn, scope);
  return object;
}

/** The list row (no photo, no member lists). */
export function rowOf(object) {
  const { photo, members, memberOf, givenName, sn, initials, manager, ...rest } = object;
  return { ...rest, groups: memberOf?.length || 0, memberCount: members ? members.length : undefined };
}

// ── list filters ─────────────────────────────────────────────────────────────

export const KINDS = ['user', 'group', 'computer'];
export const FLAGS = ['enabled', 'disabled', 'locked', 'pwdExpired', 'neverLogged', 'inactive'];

/** Clean list query: { kinds, text, flags, inactiveDays, scope: 'one' | 'sub' }. */
export function cleanFilter(input = {}, defaults = {}) {
  const kinds = String(input.kinds || input.kind || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => KINDS.includes(item));
  const flags = String(input.flags || input.flag || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => FLAGS.includes(item));
  const days = Math.round(Number(input.inactiveDays || defaults.inactiveDays || 90));
  return {
    kinds: kinds.length ? [...new Set(kinds)] : [...KINDS],
    text: String(input.q || input.text || '').trim().slice(0, 64),
    flags: [...new Set(flags)],
    inactiveDays: Number.isFinite(days) ? Math.min(3650, Math.max(1, days)) : 90,
    scope: input.scope === 'sub' ? 'sub' : 'one',
  };
}

const TEXT_ATTRIBUTES = ['sAMAccountName', 'userPrincipalName', 'displayName', 'cn', 'mail', 'givenName', 'sn', 'title', 'department', 'description'];
const bit = (attribute, value) => new ExtensibleFilter({ matchType: attribute, rule: '1.2.840.113556.1.4.803', value: String(value) });
const KIND_FILTERS = {
  user: () => new AndFilter({ filters: [new EqualityFilter({ attribute: 'objectCategory', value: 'person' }), new EqualityFilter({ attribute: 'objectClass', value: 'user' })] }),
  group: () => new EqualityFilter({ attribute: 'objectCategory', value: 'group' }),
  computer: () => new EqualityFilter({ attribute: 'objectCategory', value: 'computer' }),
};

/**
 * An ldapts filter object for a clean list query. Values are escaped by ldapts (RFC 4515), so
 * "*)(objectClass=*" is searched for literally. Account flags apply to users (and computers for
 * enabled / disabled / inactive). Password expiry depends on the domain policy: users whose
 * password was set before `now - maxPwdAgeDays` (or must be changed), unless it never expires.
 */
export function compileFilter(filter, { now = new Date(), maxPwdAgeDays = 0 } = {}) {
  const kinds = filter.kinds.map((kind) => KIND_FILTERS[kind]());
  const parts = [kinds.length === 1 ? kinds[0] : new OrFilter({ filters: kinds })];
  if (filter.text) parts.push(new OrFilter({ filters: TEXT_ATTRIBUTES.map((attribute) => new SubstringFilter({ attribute, any: [filter.text] })) }));
  const cutoff = (days) => toFileTime(new Date(now.getTime() - days * 86400000));
  for (const flag of filter.flags) {
    if (flag === 'disabled') parts.push(bit('userAccountControl', UAC.ACCOUNTDISABLE));
    if (flag === 'enabled') parts.push(new NotFilter({ filter: bit('userAccountControl', UAC.ACCOUNTDISABLE) }));
    if (flag === 'locked') parts.push(new GreaterThanEqualsFilter({ attribute: 'lockoutTime', value: '1' }));
    if (flag === 'neverLogged') parts.push(new NotFilter({ filter: new PresenceFilter({ attribute: 'lastLogonTimestamp' }) }));
    if (flag === 'inactive') {
      parts.push(new OrFilter({ filters: [new NotFilter({ filter: new PresenceFilter({ attribute: 'lastLogonTimestamp' }) }), new LessThanEqualsFilter({ attribute: 'lastLogonTimestamp', value: cutoff(filter.inactiveDays) })] }));
    }
    if (flag === 'pwdExpired') {
      const set = [new EqualityFilter({ attribute: 'pwdLastSet', value: '0' })];
      if (maxPwdAgeDays > 0) set.push(new LessThanEqualsFilter({ attribute: 'pwdLastSet', value: cutoff(maxPwdAgeDays) }));
      parts.push(new AndFilter({ filters: [new NotFilter({ filter: bit('userAccountControl', UAC.DONT_EXPIRE_PASSWORD) }), set.length === 1 ? set[0] : new OrFilter({ filters: set })] }));
    }
  }
  return parts.length === 1 ? parts[0] : new AndFilter({ filters: parts });
}

/** The same filter on a shaped object (demo directory, and a second check of LDAP answers). */
export function matchesFilter(object, filter, { now = new Date() } = {}) {
  if (!filter.kinds.includes(object.kind)) return false;
  if (filter.text) {
    const needle = filter.text.toLowerCase();
    const hay = [object.login, object.upn, object.name, object.cn, object.mail, object.givenName, object.sn, object.title, object.department, object.description];
    if (!hay.some((value) => value && String(value).toLowerCase().includes(needle))) return false;
  }
  const account = object.kind === 'user' || object.kind === 'computer';
  for (const flag of filter.flags) {
    if (flag === 'disabled' && !(account && object.enabled === false)) return false;
    if (flag === 'enabled' && !(account && object.enabled === true)) return false;
    if (flag === 'locked' && !object.locked) return false;
    if (flag === 'neverLogged' && !(account && !object.lastLogon)) return false;
    if (flag === 'inactive') {
      const cutoff = now.getTime() - filter.inactiveDays * 86400000;
      if (!(account && (!object.lastLogon || new Date(object.lastLogon).getTime() <= cutoff))) return false;
    }
    if (flag === 'pwdExpired' && !object.pwdExpired) return false;
  }
  return true;
}

// ── sAMAccountName template ──────────────────────────────────────────────────

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Kazakh, Kyrgyz, Uzbek, Tatar, Ukrainian, Belarusian letters.
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u', ҳ: 'h', ҷ: 'j', ӣ: 'i', ӯ: 'u',
};

/** "Ёлкина Ақбота" → "elkina akbota" (Latin, lower case; other scripts' accents dropped). */
export function transliterate(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

const loginPart = (text) => transliterate(text).replace(/[^a-z0-9]/g, '');

export const LOGIN_TOKENS = ['first', 'last', 'middle', 'f', 'l', 'm'];
export const LOGIN_MAX = 20;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * A login from the template: {first} {last} {middle}, {f} {l} {m} (first letters), anything else
 * is kept literally. "{f}.{last}" + Иван Петров → "i.petrov". Separators at the ends are dropped;
 * the result is cut to `max` (sAMAccountName allows 20).
 */
export function loginFromTemplate(template, person = {}, max = LOGIN_MAX) {
  const parts = { first: loginPart(person.first), last: loginPart(person.last), middle: loginPart(person.middle) };
  const values = { ...parts, f: parts.first.slice(0, 1), l: parts.last.slice(0, 1), m: parts.middle.slice(0, 1) };
  const text = String(template || '{f}.{last}').replace(/\{(\w+)\}/g, (all, token) => (LOGIN_TOKENS.includes(token) ? values[token] : ''));
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/([._-])[._-]+/g, '$1')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, max)
    .replace(/[._-]+$/g, '');
}

export const loginValid = (login, max = LOGIN_MAX) => typeof login === 'string' && login.length >= 2 && login.length <= max && LOGIN_RE.test(login) && !/[._-]$/.test(login);

/**
 * Candidates for a free login: the base, then base2, base3 … (the base is shortened so the
 * suffix fits into `max`).
 */
export function loginCandidates(base, max = LOGIN_MAX, count = 30) {
  const out = [];
  if (base) out.push(base.slice(0, max));
  for (let n = 2; out.length < count; n += 1) {
    const suffix = String(n);
    out.push(`${base.slice(0, Math.max(1, max - suffix.length)).replace(/[._-]+$/g, '')}${suffix}`);
  }
  return [...new Set(out)];
}

/** The first candidate not in `taken` (a Set of lower-case logins), or null. */
export function freeLogin(base, taken, max = LOGIN_MAX) {
  return loginCandidates(base, max).find((login) => !taken.has(login.toLowerCase())) || null;
}

// ── passwords ────────────────────────────────────────────────────────────────

/**
 * Hints before AD sees the password (AD's own policy still decides): issue codes
 * 'short', 'complexity' (3 of 4 classes), 'containsLogin', 'containsName', 'long'.
 */
export function passwordIssues(password, policy = {}, person = {}) {
  const value = String(password || '');
  const issues = [];
  const min = Math.max(1, Number(policy.minLength) || 8);
  if (value.length < min) issues.push('short');
  if (value.length > 256) issues.push('long');
  if (policy.complexity !== false) {
    const classes = [/[a-zа-яё]/, /[A-ZА-ЯЁ]/, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(value)).length;
    if (classes < 3) issues.push('complexity');
    const lower = value.toLowerCase();
    if (person.login && person.login.length >= 3 && lower.includes(person.login.toLowerCase())) issues.push('containsLogin');
    const names = String(person.name || '')
      .toLowerCase()
      .split(/[\s,.\-_#\t]+/)
      .filter((part) => part.length >= 3);
    if (names.some((part) => lower.includes(part))) issues.push('containsName');
  }
  return issues;
}

/** unicodePwd value: the password in double quotes, UTF-16LE. */
export const encodePassword = (password) => Buffer.from(`"${password}"`, 'utf16le');

// ── secure channel ──────────────────────────────────────────────────────────

/**
 * How password operations would travel: 'ldaps' (the integration uses TLS), 'starttls'
 * (module setting), or null — AD refuses unicodePwd over plain LDAP, so the module refuses first.
 */
export function secureChannel(cfg, settings = {}) {
  if (cfg?.useTls) return 'ldaps';
  if (settings.startTls) return 'starttls';
  return null;
}

// ── attributes ───────────────────────────────────────────────────────────────

/** Attributes the module may edit (settings pick a subset). Name → max length. */
export const EDITABLE = {
  givenName: 64,
  sn: 64,
  initials: 6,
  displayName: 256,
  description: 1024,
  title: 128,
  department: 64,
  company: 64,
  mail: 256,
  telephoneNumber: 64,
  mobile: 64,
  physicalDeliveryOfficeName: 128,
  employeeID: 16,
  l: 128,
  manager: 2048,
};

/** Clean attribute changes: { attr: value | '' } for the allowed attributes → [{ type, values }]. */
export function cleanChanges(input, allowed) {
  const out = [];
  for (const [type, raw] of Object.entries(input || {})) {
    if (!allowed.includes(type) || !EDITABLE[type]) continue;
    const value = raw == null ? '' : String(raw).replace(/[\u0000-\u001f]/g, ' ').trim();
    if (value.length > EDITABLE[type]) throw httpError(400, `${type} is too long`, 'AD_VALUE_TOO_LONG', { field: type });
    if (type === 'mail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw httpError(400, 'Not an e-mail address', 'AD_BAD_MAIL', { field: type });
    if (type === 'manager' && value && !parseDn(value)) throw httpError(400, 'Not a valid distinguished name', 'AD_BAD_DN', { field: type });
    out.push({ type, values: value ? [value] : [] });
  }
  return out;
}

/** The UPN suffixes offered: the settings, else the DNS domain of the base DN. */
export function upnSuffixes(settings = {}, baseDn = '') {
  const list = (settings.upnSuffixes || []).map((item) => String(item).trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  if (list.length) return [...new Set(list)];
  const domain = dnsDomainOf(baseDn);
  return domain ? [domain] : [];
}

/** A mail address from the template ({login}, {first}, {last}, {f}, {l}, {domain}). */
export function mailFromTemplate(template, person = {}, login = '', domain = '') {
  if (!template) return '';
  const parts = { first: loginPart(person.first), last: loginPart(person.last), login, domain };
  return String(template)
    .replace(/\{(\w+)\}/g, (all, token) => (token === 'f' ? parts.first.slice(0, 1) : token === 'l' ? parts.last.slice(0, 1) : parts[token] ?? ''))
    .toLowerCase();
}

/** The OU suggested for a new user of an org unit (nearest mapped ancestor), else the default. */
export function ouForUnit(settings = {}, unitId, parentOf = () => null) {
  const map = new Map((settings.unitOus || []).map((item) => [Number(item.unitId), item.ou]));
  let current = Number(unitId) || null;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (map.has(current)) return map.get(current);
    current = parentOf(current);
  }
  return settings.defaultUserOu || null;
}

export { canonDn, canonRdn };
