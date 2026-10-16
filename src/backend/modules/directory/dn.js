/*
 * Distinguished names for the AD directory module (RFC 4514), pure.
 *
 * Every scope decision (inside the managed root? inside an excluded OU?) is
 * made on PARSED names, never on string suffixes: "CN=x\,OU=Accounts,DC=…"
 * is an object named "x,OU=Accounts" directly under DC=…, not something inside
 * OU=Accounts, and "<GUID=…>" / "<SID=…>" forms (which AD resolves anywhere in
 * the domain) are not names at all here.
 */

const TYPE = /^(?:[A-Za-z][A-Za-z0-9-]*|\d+(?:\.\d+)+)$/;
const HEX = /^[0-9a-fA-F]{2}$/;

/**
 * "CN=Ivanov\, Ivan,OU=Users,DC=example,DC=local" → [{ type: 'CN', value: 'Ivanov, Ivan', raw: 'CN=Ivanov\, Ivan' }, …]
 * or null when it is not a plain DN: empty parts, a type that is not an attribute name,
 * multi-valued RDNs ("+"), BER values ("#…"), dangling escapes, NUL characters.
 */
export function parseDn(dn) {
  const text = String(dn ?? '');
  if (!text.trim() || text.length > 2048 || text.includes('\u0000')) return null;
  const rdns = [];
  let start = 0;
  let i = 0;
  const flush = (end) => {
    const raw = text.slice(start, end).trim();
    const rdn = parseRdn(raw);
    if (!rdn) return false;
    rdns.push(rdn);
    return true;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === ',') {
      if (!flush(i)) return null;
      start = i + 1;
    }
    if (ch === ';' || ch === '+') return null;
    i += 1;
  }
  if (i > text.length) return null; // a trailing lone backslash
  if (!flush(text.length)) return null;
  return rdns;
}

function parseRdn(raw) {
  const eq = raw.indexOf('=');
  if (eq <= 0) return null;
  const type = raw.slice(0, eq).trim();
  if (!TYPE.test(type)) return null;
  const encoded = raw.slice(eq + 1).trim();
  if (encoded.startsWith('#')) return null;
  let value = '';
  for (let i = 0; i < encoded.length; i += 1) {
    const ch = encoded[i];
    if (ch === '\\') {
      const pair = encoded.slice(i + 1, i + 3);
      if (HEX.test(pair)) {
        // Hex escapes may encode UTF-8 bytes: collect a run and decode it as one.
        const bytes = [];
        while (encoded[i] === '\\' && HEX.test(encoded.slice(i + 1, i + 3))) {
          bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
          i += 3;
        }
        i -= 1;
        value += Buffer.from(bytes).toString('utf8');
        continue;
      }
      if (i + 1 >= encoded.length) return null;
      value += encoded[i + 1];
      i += 1;
      continue;
    }
    // Unescaped specials inside a value: not a valid RFC 4514 string.
    if (ch === '"' || ch === '<' || ch === '>') return null;
    value += ch;
  }
  if (value.includes('\u0000')) return null;
  return { type, value, raw };
}

/** RFC 4514 escaping of an attribute value for use in a DN (CN=<value>,…). */
export function escapeRdnValue(value) {
  let text = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([,+"<>;=])/g, '\\$1')
    .replace(/\u0000/g, '\\00');
  if (text.startsWith('#') || text.startsWith(' ')) text = `\\${text}`;
  if (text.endsWith(' ') && !text.endsWith('\\ ')) text = `${text.slice(0, -1)}\\ `;
  return text;
}

// Leading / trailing spaces are not part of a value (RFC 4514 requires them escaped); inner
// spaces are: "Corp  HQ" (two spaces) and "Corp HQ" are different OUs and must never compare equal.
const canonValue = (value) => String(value).trim().toLowerCase();

/** One comparable string per RDN: "cn=ivanov\, ivan". */
export const canonRdn = (rdn) => `${rdn.type.toLowerCase()}=${escapeRdnValue(canonValue(rdn.value))}`;

/** The comparable form of a DN (lower case, normalised escapes, outer spaces trimmed), or null when it does not parse. */
export function canonDn(dn) {
  const rdns = Array.isArray(dn) ? dn : parseDn(dn);
  return rdns ? rdns.map(canonRdn).join(',') : null;
}

/** Same object? (both must parse) */
export function sameDn(a, b) {
  const x = canonDn(a);
  return x !== null && x === canonDn(b);
}

/** Is `dn` `base` itself or inside it? Compared RDN by RDN (escaped commas never match). */
export function isUnder(dn, base) {
  const a = Array.isArray(dn) ? dn : parseDn(dn);
  const b = Array.isArray(base) ? base : parseDn(base);
  if (!a || !b || b.length > a.length) return false;
  const offset = a.length - b.length;
  return b.every((rdn, index) => canonRdn(rdn) === canonRdn(a[offset + index]));
}

/** The DN of the parent ("CN=x,OU=Users,DC=…" → "OU=Users,DC=…"), keeping the server's spelling. */
export function parentDn(dn) {
  const rdns = parseDn(dn);
  if (!rdns || rdns.length < 2) return null;
  return rdns.slice(1).map((rdn) => rdn.raw).join(',');
}

/** The first RDN as the server spelled it ("CN=Ivanov\, Ivan"). */
export function firstRdn(dn) {
  const rdns = parseDn(dn);
  return rdns ? rdns[0].raw : null;
}

/** The display name of the first RDN ("Ivanov, Ivan"). */
export function nameOf(dn) {
  const rdns = parseDn(dn);
  return rdns ? rdns[0].value : String(dn || '');
}

/** "OU=Accounts,DC=example,DC=local" → "DC=example,DC=local". */
export function domainOf(dn) {
  const rdns = parseDn(dn);
  if (!rdns) return null;
  const dcs = rdns.filter((rdn) => rdn.type.toLowerCase() === 'dc');
  return dcs.length ? dcs.map((rdn) => `DC=${escapeRdnValue(rdn.value)}`).join(',') : null;
}

/** "DC=example,DC=local" → "example.local". */
export function dnsDomainOf(dn) {
  const rdns = parseDn(dn);
  if (!rdns) return '';
  return rdns
    .filter((rdn) => rdn.type.toLowerCase() === 'dc')
    .map((rdn) => rdn.value.trim())
    .join('.');
}

/**
 * RDNs between `base` (exclusive) and `dn` (exclusive), top down:
 * pathBetween("CN=a,OU=Users,OU=North,OU=Accounts,DC=x", "OU=Accounts,DC=x") → [OU=North, OU=Users].
 */
export function pathBetween(dn, base) {
  const a = parseDn(dn);
  const b = parseDn(base);
  if (!a || !b || !isUnder(a, b)) return [];
  return a.slice(1, a.length - b.length).reverse();
}

/** A DN made of a child RDN and a parent DN: CN=<escaped name>,<parent>. */
export const childDn = (type, value, parent) => `${type}=${escapeRdnValue(value)},${parent}`;
