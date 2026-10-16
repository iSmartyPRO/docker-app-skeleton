/*
 * Pure helpers of the AD directory UI. The login preview mirrors the server's
 * template (src/backend/modules/directory/logic.js → loginFromTemplate); the
 * server decides the real login and checks it is free.
 */

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u', ҳ: 'h', ҷ: 'j', ӣ: 'i', ӯ: 'u',
};

const part = (text) =>
  String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function loginPreview(template, person = {}) {
  const parts = { first: part(person.first), last: part(person.last), middle: part(person.middle) };
  const values = { ...parts, f: parts.first.slice(0, 1), l: parts.last.slice(0, 1), m: parts.middle.slice(0, 1) };
  return String(template || '{f}.{last}')
    .replace(/\{(\w+)\}/g, (all, token) => values[token] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/([._-])[._-]+/g, '$1')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 20)
    .replace(/[._-]+$/g, '');
}

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{0,18}[a-z0-9]$/;

/** A strong random password: 16 characters from four classes, no look-alikes. */
export function generatePassword(length = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#%+-=?@_'];
  const pick = (set) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  const chars = sets.map(pick);
  const all = sets.join('');
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Policy hints like the server's (src/backend/modules/directory/logic.js → passwordIssues; AD's
 * own policy still decides). `person`: { login, name } — the name's parts of 3+ characters must
 * not appear in the password, as AD's complexity rule says.
 */
export function passwordIssues(password, policy = {}, person = {}) {
  const value = String(password || '');
  const issues = [];
  if (value.length < Math.max(1, Number(policy.passwordMinLength) || 8)) issues.push('short');
  if (policy.passwordComplexity !== false) {
    const classes = [/[a-zа-яё]/, /[A-ZА-ЯЁ]/, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(value)).length;
    if (classes < 3) issues.push('complexity');
    const lower = value.toLowerCase();
    if (person.login && person.login.length >= 3 && lower.includes(person.login.toLowerCase())) issues.push('containsLogin');
    const names = String(person.name || '')
      .toLowerCase()
      .split(/[\s,.\-_#\t]+/)
      .filter((piece) => piece.length >= 3);
    if (names.some((piece) => lower.includes(piece))) issues.push('containsName');
  }
  return issues;
}

/** Initials for an avatar. */
export const initialsOf = (name) =>
  String(name || '?')
    .split(/[\s.,_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

/** A stable hue per name (avatar background). */
export function hueOf(text) {
  let hash = 0;
  for (const ch of String(text || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

/** "OU=Users,OU=HQ,OU=Accounts,…" → the value of the first RDN. */
export const rdnName = (dn) => {
  const match = /^\s*[a-z]+=((?:\\.|[^,\\])+)/i.exec(String(dn || ''));
  return match ? match[1].replace(/\\(.)/g, '$1').trim() : String(dn || '');
};

/** Days since an ISO date (null when none). */
export const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

export const COLUMN_KEYS = ['name', 'login', 'status', 'title', 'department', 'mail', 'phone', 'lastLogon', 'pwdLastSet', 'created', 'path', 'links'];
export const DEFAULT_COLUMNS = ['name', 'login', 'status', 'title', 'department', 'lastLogon', 'links'];
