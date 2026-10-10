import { AndFilter, Client, EqualityFilter, OrFilter } from 'ldapts';

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
// case differs, and memberOf must never be silently missing.
const ATTRIBUTES = ['*'];

function connect(cfg) {
  const secure = Boolean(cfg.useTls);
  const port = Number(cfg.port) || (secure ? 636 : 389);
  return new Client({
    url: `${secure ? 'ldaps' : 'ldap'}://${cfg.host}:${port}`,
    timeout: 8000,
    connectTimeout: 8000,
    strictDN: false,
  });
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

  // Attribute names come back in whatever case the server uses (memberOf / memberof).
  const attrs = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));
  const account =
    first(attrs.samaccountname) || first(attrs.uid) || String(first(attrs.userprincipalname) || login).split('@')[0];
  return {
    dn: entry.dn,
    username: String(account),
    displayName: String(first(attrs.displayname) || first(attrs.cn) || account),
    email: first(attrs.mail) ? String(first(attrs.mail)) : null,
    memberOf: asList(attrs.memberof),
  };
}
