import { AndFilter, Client, EqualityFilter, OrFilter, PresenceFilter, SubstringFilter } from 'ldapts';

/*
 * Active Directory / LDAP sign-in.
 *
 * 1. Bind with the service account from Settings → Integrations → Active Directory.
 * 2. Find exactly one person whose sAMAccountName, userPrincipalName, uid or mail
 *    equals what the user typed (filters are built with escaped objects, never strings).
 * 3. Bind again as that person's DN with their password — the directory decides.
 *
 * Disabled AD accounts fail the second bind, so they cannot sign in.
 */

// All user attributes: some servers drop names from an explicit list when the
// case differs, and memberOf must never be silently missing. entryUUID
// (OpenLDAP) is operational, so it is asked for by name.
const ATTRIBUTES = ['*', 'objectGUID', 'entryUUID'];
// objectGUID is binary; as text it would be garbled.
const BUFFER_ATTRIBUTES = ['objectGUID', 'objectguid', 'ObjectGUID'];

/**
 * TLS: the system trust store (plus NODE_EXTRA_CA_CERTS), and the optional
 * CA certificate from Settings → Integrations → Active Directory for
 * directories whose certificate comes from an internal CA.
 */
export function tlsOptionsFor(cfg) {
  const ca = String(cfg?.caCert || '').trim();
  return ca ? { ca: [ca] } : undefined;
}

function connect(cfg) {
  const secure = Boolean(cfg.useTls);
  const port = Number(cfg.port) || (secure ? 636 : 389);
  const tlsOptions = secure ? tlsOptionsFor(cfg) : undefined;
  return new Client({
    url: `${secure ? 'ldaps' : 'ldap'}://${cfg.host}:${port}`,
    timeout: 8000,
    connectTimeout: 8000,
    strictDN: false,
    ...(tlsOptions ? { tlsOptions } : {}),
  });
}

/**
 * Stable directory id that survives moves between OUs (the DN changes):
 * AD objectGUID in its usual text form, or OpenLDAP entryUUID. Lowercase.
 */
export function directoryGuid(attrs) {
  const raw = first(attrs.objectguid);
  if (Buffer.isBuffer(raw) && raw.length === 16) {
    const hex = (bytes) => Buffer.from(bytes).toString('hex');
    // The first three groups are little-endian.
    return [
      hex([...raw.subarray(0, 4)].reverse()),
      hex([...raw.subarray(4, 6)].reverse()),
      hex([...raw.subarray(6, 8)].reverse()),
      hex(raw.subarray(8, 10)),
      hex(raw.subarray(10, 16)),
    ].join('-');
  }
  const uuid = first(attrs.entryuuid);
  if (uuid && /^[0-9a-f-]{32,36}$/i.test(String(uuid))) return String(uuid).toLowerCase();
  return null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asList(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function personFilter(login) {
  const value = String(login);
  return new AndFilter({
    filters: [
      new OrFilter({
        filters: [
          new EqualityFilter({ attribute: 'objectClass', value: 'user' }),
          new EqualityFilter({ attribute: 'objectClass', value: 'person' }),
          new EqualityFilter({ attribute: 'objectClass', value: 'inetOrgPerson' }),
        ],
      }),
      new OrFilter({
        filters: ['sAMAccountName', 'userPrincipalName', 'uid', 'mail'].map(
          (attribute) => new EqualityFilter({ attribute, value })
        ),
      }),
    ],
  });
}

async function serviceBind(client, cfg) {
  if (cfg.bindDn) {
    if (!cfg.bindPassword) throw new Error('Bind password is required for the service account');
    await client.bind(cfg.bindDn, cfg.bindPassword);
  }
}

/** A new (unbound) client for the configured directory; the caller binds and unbinds. */
export function directoryClient(cfg) {
  return connect(cfg);
}

/** Binds `client` as the service account from Settings → Integrations → Active Directory. */
export const bindServiceAccount = serviceBind;

/** Used by "Test connection": service bind + a one-entry search under the base DN. */
export async function testDirectory(cfg) {
  const client = connect(cfg);
  try {
    await serviceBind(client, cfg);
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: '(objectClass=*)',
      attributes: ['dn'],
      sizeLimit: 1,
    });
    return { entries: searchEntries.length };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/** CNs (and full DNs) of the groups a directory entry belongs to. */
export function directoryGroups(memberOf) {
  const names = new Set();
  for (const dn of asList(memberOf)) {
    names.add(dn.toLowerCase());
    const match = /^cn=([^,]+)/i.exec(dn);
    if (match) names.add(match[1].trim().toLowerCase());
  }
  return names;
}

/** Portal group ids for a user, from Settings → Sign-in methods → group mapping. */
export function mapDirectoryGroups(groupMap, memberOf) {
  const names = directoryGroups(memberOf);
  return [
    ...new Set(
      (groupMap || [])
        .filter((rule) => names.has(String(rule.adGroup).trim().toLowerCase()))
        .map((rule) => Number(rule.groupId))
    ),
  ];
}

/**
 * Returns the directory profile on success, `null` for wrong credentials or an
 * unknown / ambiguous login. Throws only for connectivity or configuration errors.
 */
export async function authenticateDirectory(cfg, login, password) {
  // An empty password would be an anonymous bind, which many servers accept.
  if (!login || !password) return null;

  const client = connect(cfg);
  let entry;
  try {
    await serviceBind(client, cfg);
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: personFilter(login),
      attributes: ATTRIBUTES,
      explicitBufferAttributes: BUFFER_ATTRIBUTES,
      sizeLimit: 2,
    });
    if (searchEntries.length !== 1) return null;
    [entry] = searchEntries;
  } finally {
    await client.unbind().catch(() => {});
  }

  const userClient = connect(cfg);
  try {
    await userClient.bind(entry.dn, password);
  } catch (err) {
    if (err?.name === 'InvalidCredentialsError' || err?.code === 49) return null;
    throw err;
  } finally {
    await userClient.unbind().catch(() => {});
  }

  return profileOf(entry, login);
}

/** A directory entry as a portal profile: { dn, guid, username, displayName, email, memberOf }. */
function profileOf(entry, fallback = '') {
  // Attribute names come back in whatever case the server uses (memberOf / memberof).
  const attrs = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));
  const account =
    first(attrs.samaccountname) || first(attrs.uid) || String(first(attrs.userprincipalname) || fallback).split('@')[0];
  return {
    dn: entry.dn,
    guid: directoryGuid(attrs),
    username: String(account),
    displayName: String(first(attrs.displayname) || first(attrs.cn) || account),
    email: first(attrs.mail) ? String(first(attrs.mail)) : null,
    memberOf: asList(attrs.memberof),
  };
}

const PEOPLE = new OrFilter({
  filters: ['user', 'person', 'inetOrgPerson'].map((value) => new EqualityFilter({ attribute: 'objectClass', value })),
});

/**
 * People whose login, name or e-mail contains `text` (service account bind),
 * for linking portal users to directory accounts. Filters are built from
 * escaped objects, never from strings.
 */
export async function searchDirectory(cfg, text, limit = 15) {
  const value = String(text || '').trim().slice(0, 64);
  if (value.length < 2) return [];
  const client = connect(cfg);
  try {
    await serviceBind(client, cfg);
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: new AndFilter({
        filters: [
          PEOPLE,
          new OrFilter({
            filters: ['sAMAccountName', 'userPrincipalName', 'uid', 'displayName', 'cn', 'mail'].map(
              (attribute) => new SubstringFilter({ attribute, any: [value] })
            ),
          }),
        ],
      }),
      // All attributes: some servers match requested names case-sensitively.
      attributes: ATTRIBUTES,
      explicitBufferAttributes: BUFFER_ATTRIBUTES,
      sizeLimit: Math.min(50, Math.max(1, limit)),
    });
    return searchEntries.map((entry) => profileOf(entry));
  } catch (err) {
    // More results than the size limit still returns the first page on most servers.
    if (err?.name === 'SizeLimitExceededError') return [];
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

/** One directory entry by its DN, or null when it no longer exists. */
export async function directoryEntry(cfg, dn) {
  if (!dn) return null;
  const client = connect(cfg);
  try {
    await serviceBind(client, cfg);
    const { searchEntries } = await client.search(String(dn), {
      scope: 'base',
      filter: new PresenceFilter({ attribute: 'objectClass' }),
      attributes: ATTRIBUTES,
      explicitBufferAttributes: BUFFER_ATTRIBUTES,
    });
    // Only the entry with exactly this DN: never trust a server that ignores the scope.
    const norm = (value) => String(value).toLowerCase().replace(/\s*,\s*/g, ',');
    const entry = searchEntries.find((item) => norm(item.dn) === norm(dn));
    return entry ? profileOf(entry) : null;
  } catch (err) {
    if (err?.name === 'NoSuchObjectError' || err?.code === 32) return null;
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}
