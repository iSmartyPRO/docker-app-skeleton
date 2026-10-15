import { AndFilter, Attribute, Change, EqualityFilter, OrFilter, PresenceFilter, SubstringFilter } from 'ldapts';
import { bindServiceAccount, directoryClient, directoryGuid } from '../../services/ldap.js';
import { httpError } from '../shared/acl.js';
import { cnOf, domainRoot, globToSubstring, isDisabled, normDn, objectKind, sidToString } from './naming.js';

/*
 * Active Directory for Folder access.
 *
 * Reads (groups, members, people) bind with the portal's service account.
 * Writes bind with the ACTING administrator's own account (withActor): the
 * directory decides whether they may change a group. Membership changes are
 * idempotent: adding a member that is already there or removing one that is
 * not is "unchanged", never an error.
 *
 * The client factory is replaceable for tests (setClientFactory).
 */

let makeClient = (cfg) => directoryClient(cfg);

/** Tests: replace how clients are made (a mock with bind/search/modify/add/del/unbind). */
export function setClientFactory(factory) {
  makeClient = factory || ((cfg) => directoryClient(cfg));
}

const PAGE = { pageSize: 500 };
const CACHE_MS = 60 * 1000;
const PERSON_ATTRS = ['distinguishedName', 'sAMAccountName', 'userPrincipalName', 'displayName', 'cn', 'department', 'title', 'mail', 'userAccountControl', 'objectClass'];
const GROUP_ATTRS = ['cn', 'sAMAccountName', 'description', 'member', 'objectSid', 'distinguishedName'];

const lower = (entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));
const first = (value) => (Array.isArray(value) ? value[0] : value);
const list = (value) => (value == null ? [] : (Array.isArray(value) ? value : [value]).map((item) => (Buffer.isBuffer(item) ? item.toString('utf8') : String(item))));

// ── errors ───────────────────────────────────────────────────────────────────

/** AD bind failure reasons ("data 775" in the message) → the Drive credential status codes. */
export function bindFailureCode(err) {
  const text = String(err?.message || '');
  if (/data 775/i.test(text)) return 'ACCOUNT_LOCKED';
  if (/data 533/i.test(text)) return 'ACCOUNT_DISABLED';
  if (/data (532|773)/i.test(text)) return 'PASSWORD_EXPIRED';
  if (/data (530|531|701)/i.test(text)) return 'ACCOUNT_RESTRICTED';
  return 'AUTH_FAILED';
}

export const isInvalidCredentials = (err) => err?.code === 49 || err?.name === 'InvalidCredentialsError';

/** An ldapts error → an HTTP error with a stable code (no secrets in messages). */
export function adError(err) {
  if (err?.statusCode) return err;
  const code = err?.code;
  if (code === 49) return httpError(403, 'Active Directory did not accept your password', 'FA_CREDENTIALS_FAILED');
  if (code === 50) return httpError(403, 'Active Directory refused: your account has no rights to change this object', 'FA_AD_DENIED');
  if (code === 32) return httpError(404, 'The object was not found in Active Directory', 'FA_AD_NOT_FOUND');
  if (code === 68) return httpError(409, 'An object with this name already exists in Active Directory', 'FA_AD_EXISTS');
  if (code === 19 || code === 21 || code === 65 || code === 53) {
    const error = httpError(400, 'Active Directory refused the change', 'FA_AD_REFUSED');
    error.details = { ldapCode: code };
    return error;
  }
  if (typeof code === 'number') {
    const error = httpError(502, 'Active Directory returned an error', 'FA_AD_ERROR');
    error.details = { ldapCode: code };
    return error;
  }
  return httpError(503, 'Active Directory is not reachable', 'FA_AD_UNAVAILABLE');
}

// ── sessions ─────────────────────────────────────────────────────────────────

export async function withService(cfg, fn) {
  const client = makeClient(cfg);
  try {
    await bindServiceAccount(client, cfg);
    return await fn(client);
  } catch (err) {
    throw adError(err);
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Runs `fn(client)` bound as the acting administrator.
 * `cred` = { bindName (DN, UPN or DOMAIN\login; falls back to `dn`), password, dnKnown, expectGuid }.
 * A rejected password throws FA_CREDENTIALS_FAILED with `details.reason` (AUTH_FAILED, ACCOUNT_LOCKED…)
 * and `park`: whether the saved password may be parked. AD answers "data 52e" both for a wrong
 * password and for a name that does not exist, so a plain AUTH_FAILED only parks it when the
 * bind was made with a DN known to exist (`dnKnown`).
 * `expectGuid` (a bind by name, not by a DN found by the service account): after the bind the
 * account is looked up with the person's own connection and must have this objectGUID.
 */
export async function withActor(cfg, cred, fn) {
  const bindName = cred?.bindName || cred?.dn;
  if (!bindName || !cred?.password) throw httpError(403, 'Enter your domain password', 'FA_CREDENTIALS_REQUIRED');
  const client = makeClient(cfg);
  try {
    try {
      await client.bind(bindName, cred.password);
    } catch (err) {
      if (isInvalidCredentials(err)) {
        const reason = bindFailureCode(err);
        const error = httpError(403, 'Active Directory did not accept your saved password', 'FA_CREDENTIALS_FAILED');
        error.details = { reason };
        error.park = cred.dnKnown !== false || reason !== 'AUTH_FAILED';
        throw error;
      }
      throw err;
    }
    if (cred.expectGuid) await assertBoundAccount(client, cfg, bindName, cred.expectGuid);
    return await fn(client);
  } catch (err) {
    throw adError(err);
  } finally {
    await client.unbind().catch(() => {});
  }
}

export const otherAccountError = () => {
  const error = httpError(403, 'The saved domain password belongs to another account. Enter your own domain password', 'FA_CREDENTIALS_REQUIRED');
  error.details = { reason: 'OTHER_ACCOUNT' };
  return error;
};

const ACCOUNT_ATTRS = ['distinguishedName', 'sAMAccountName', 'userPrincipalName', 'objectGUID'];

const accountOf = (entry) => {
  const attrs = lower(entry);
  const login = first(attrs.samaccountname);
  const upn = first(attrs.userprincipalname);
  return { dn: entry.dn, login: login ? String(login) : null, upn: upn ? String(upn) : null, guid: directoryGuid(attrs) };
};

/** The account a bind name (DOMAIN\login, UPN or login) names, searched with `client`. */
async function assertBoundAccount(client, cfg, bindName, expectGuid) {
  const name = String(bindName);
  const login = name.includes('\\') ? name.slice(name.lastIndexOf('\\') + 1) : name.split('@')[0];
  const filters = [new EqualityFilter({ attribute: 'sAMAccountName', value: login })];
  if (name.includes('@')) filters.push(new EqualityFilter({ attribute: 'userPrincipalName', value: name }));
  const { searchEntries } = await client.search(domainRoot(cfg.baseDn) || cfg.baseDn, {
    scope: 'sub',
    filter: filters.length === 1 ? filters[0] : new OrFilter({ filters }),
    attributes: ACCOUNT_ATTRS,
    explicitBufferAttributes: ['objectGUID'],
    sizeLimit: 5,
  });
  if (!searchEntries.some((entry) => accountOf(entry).guid === String(expectGuid).toLowerCase())) throw otherAccountError();
}

/** "xxxxxxxx-xxxx-…" (AD objectGUID text form) → the 16 bytes AD stores, or null. */
export function guidToBuffer(guid) {
  const text = String(guid || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) return null;
  const [a, b, c, d, e] = text.split('-').map((part) => Buffer.from(part, 'hex'));
  // The first three groups are little-endian.
  return Buffer.concat([a.reverse(), b.reverse(), c.reverse(), d, e]);
}

/**
 * The person's AD account, looked up fresh with the service account: by objectGUID
 * (survives moves and renames), else by the stored DN (only when its objectGUID, if
 * any, is the expected one). → { dn, login, upn, guid } or null.
 */
export async function findAccount(cfg, { guid, dn }) {
  const base = domainRoot(cfg.baseDn) || cfg.baseDn;
  const want = guid ? String(guid).toLowerCase() : null;
  return withService(cfg, async (client) => {
    const value = guidToBuffer(want);
    if (value) {
      const { searchEntries } = await client.search(base, {
        scope: 'sub',
        filter: new EqualityFilter({ attribute: 'objectGUID', value }),
        attributes: ACCOUNT_ATTRS,
        explicitBufferAttributes: ['objectGUID'],
        sizeLimit: 2,
      });
      const hits = searchEntries.map(accountOf).filter((account) => account.guid === want);
      if (hits.length === 1) return hits[0];
    }
    if (!dn) return null;
    let entries;
    try {
      ({ searchEntries: entries } = await client.search(String(dn), {
        scope: 'base',
        filter: new PresenceFilter({ attribute: 'objectClass' }),
        attributes: ACCOUNT_ATTRS,
        explicitBufferAttributes: ['objectGUID'],
      }));
    } catch (err) {
      if (err?.code === 32 || err?.name === 'NoSuchObjectError') return null;
      throw err;
    }
    const entry = entries.find((item) => normDn(item.dn) === normDn(dn));
    if (!entry) return null;
    const account = accountOf(entry);
    // Another object now has this DN (the account was deleted and re-created).
    if (want && account.guid && account.guid !== want) return null;
    return account;
  });
}

/** Checks a password by binding as `dn`: true / false (wrong password) / throws (directory down). */
export async function verifyBind(cfg, dn, password) {
  if (!dn || !password) return { ok: false, reason: 'AUTH_FAILED' };
  const client = makeClient(cfg);
  try {
    await client.bind(dn, password);
    return { ok: true };
  } catch (err) {
    if (isInvalidCredentials(err)) return { ok: false, reason: bindFailureCode(err) };
    throw adError(err);
  } finally {
    await client.unbind().catch(() => {});
  }
}

// ── reads ────────────────────────────────────────────────────────────────────

/**
 * Every value of a multi-valued attribute, following AD ranged retrieval
 * ("member;range=0-1499") for groups with more than 1500 members.
 */
export async function rangedValues(client, entry, attribute) {
  const attrs = lower(entry);
  const name = attribute.toLowerCase();
  const rangedKey = Object.keys(attrs).find((key) => key.startsWith(`${name};range=`));
  if (!rangedKey) return list(attrs[name]);
  const values = list(attrs[rangedKey]);
  let match = /;range=(\d+)-(\*|\d+)$/.exec(rangedKey);
  let guard = 0;
  while (match && match[2] !== '*' && guard < 1000) {
    guard += 1;
    const start = Number(match[2]) + 1;
    const { searchEntries } = await client.search(entry.dn, {
      scope: 'base',
      filter: new PresenceFilter({ attribute: 'objectClass' }),
      attributes: [`${attribute};range=${start}-*`],
    });
    const next = searchEntries[0] ? lower(searchEntries[0]) : {};
    const key = Object.keys(next).find((item) => item.startsWith(`${name};range=`));
    if (!key) break;
    values.push(...list(next[key]));
    match = /;range=(\d+)-(\*|\d+)$/.exec(key);
  }
  return values;
}

function nameFilter(patterns) {
  return patterns.map((pattern) => {
    const sub = globToSubstring(pattern);
    if (sub.equal !== undefined) return new EqualityFilter({ attribute: 'cn', value: sub.equal });
    return new SubstringFilter({ attribute: 'cn', initial: sub.initial, any: sub.any, final: sub.final });
  });
}

/** Raw group entries under `base` whose cn matches the prefix or one of `otherPatterns`. */
export async function readGroups(cfg, { base, prefix, otherPatterns = [] }) {
  return withService(cfg, async (client) => {
    const { searchEntries } = await client.search(base, {
      scope: 'sub',
      filter: new AndFilter({
        filters: [new EqualityFilter({ attribute: 'objectCategory', value: 'group' }), new OrFilter({ filters: nameFilter([`${prefix}*`, ...otherPatterns]) })],
      }),
      attributes: GROUP_ATTRS,
      explicitBufferAttributes: ['objectSid'],
      paged: PAGE,
    });
    const groups = [];
    for (const entry of searchEntries) {
      const attrs = lower(entry);
      groups.push({
        dn: entry.dn,
        name: String(first(attrs.samaccountname) || first(attrs.cn) || cnOf(entry.dn)),
        description: list(attrs.description)[0] || '',
        sid: sidToString(first(attrs.objectsid)),
        members: await rangedValues(client, entry, 'member'),
      });
    }
    return groups;
  });
}

const cache = new Map();
// Bumped by every invalidation: a read that started before a change and ends
// after it must not put the old groups back into the cache.
let generation = 0;

/** Groups through a 60-second cache (per search). `refresh` skips it. */
export async function cachedGroups(cfg, options, { refresh = false } = {}) {
  const key = JSON.stringify([cfg.host, options.base, options.prefix, options.otherPatterns]);
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.groups;
  const started = generation;
  const groups = await readGroups(cfg, options);
  if (started === generation) cache.set(key, { at: Date.now(), groups });
  return groups;
}

/** After any change: the next read goes to the directory (reads still running are not cached). */
export function invalidateGroups() {
  generation += 1;
  cache.clear();
}

/** A directory object as Folder access shows it. */
export function personOf(entry) {
  const attrs = lower(entry);
  const login = first(attrs.samaccountname) || String(first(attrs.userprincipalname) || '').split('@')[0] || null;
  return {
    dn: entry.dn,
    login: login ? String(login) : null,
    upn: first(attrs.userprincipalname) ? String(first(attrs.userprincipalname)) : null,
    name: String(first(attrs.displayname) || first(attrs.cn) || cnOf(entry.dn)),
    department: first(attrs.department) ? String(first(attrs.department)) : null,
    title: first(attrs.title) ? String(first(attrs.title)) : null,
    email: first(attrs.mail) ? String(first(attrs.mail)) : null,
    kind: objectKind(attrs.objectclass),
    enabled: !isDisabled(attrs.useraccountcontrol),
  };
}

/** Direct members of a group with their details (one paged search by memberOf). */
export async function readMembers(cfg, base, group) {
  const found = await withService(cfg, async (client) => {
    const { searchEntries } = await client.search(base, {
      scope: 'sub',
      filter: new EqualityFilter({ attribute: 'memberOf', value: group.dn }),
      attributes: PERSON_ATTRS,
      paged: PAGE,
    });
    return searchEntries.map(personOf);
  });
  // Members outside the search base (or not readable) still show, by their DN.
  const byDn = new Map(found.map((person) => [normDn(person.dn), person]));
  const members = (group.members || []).map((dn) => byDn.get(normDn(dn)) || { dn, login: null, name: cnOf(dn), department: null, kind: 'unknown', enabled: null, unresolved: true });
  for (const person of found) if (!(group.members || []).some((dn) => normDn(dn) === normDn(person.dn))) members.push(person);
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

/** One object by DN (service account), or null. */
export async function readObject(cfg, dn) {
  if (!dn) return null;
  try {
    return await withService(cfg, async (client) => {
      const { searchEntries } = await client.search(String(dn), {
        scope: 'base',
        filter: new PresenceFilter({ attribute: 'objectClass' }),
        attributes: [...PERSON_ATTRS, 'memberOf'],
      });
      const entry = searchEntries.find((item) => normDn(item.dn) === normDn(dn));
      if (!entry) return null;
      return { ...personOf(entry), memberOf: list(lower(entry).memberof) };
    });
  } catch (err) {
    if (err.code === 'FA_AD_NOT_FOUND') return null;
    throw err;
  }
}

const KIND_FILTERS = {
  user: () => new AndFilter({ filters: [new EqualityFilter({ attribute: 'objectCategory', value: 'person' }), new EqualityFilter({ attribute: 'objectClass', value: 'user' })] }),
  group: () => new EqualityFilter({ attribute: 'objectCategory', value: 'group' }),
  computer: () => new EqualityFilter({ attribute: 'objectCategory', value: 'computer' }),
};

/** People (and, for superadministrators, groups and computers) whose name, login or e-mail contains `text`. */
export async function searchObjects(cfg, base, text, { kinds = ['user'], limit = 25 } = {}) {
  const value = String(text || '').trim().slice(0, 64);
  if (value.length < 2) return [];
  const kindFilters = kinds.filter((kind) => KIND_FILTERS[kind]).map((kind) => KIND_FILTERS[kind]());
  return withService(cfg, async (client) => {
      const { searchEntries } = await client.search(base, {
        scope: 'sub',
        filter: new AndFilter({
          filters: [
            kindFilters.length === 1 ? kindFilters[0] : new OrFilter({ filters: kindFilters }),
            new OrFilter({
              filters: ['sAMAccountName', 'userPrincipalName', 'displayName', 'cn', 'mail', 'department'].map((attribute) => new SubstringFilter({ attribute, any: [value] })),
            }),
          ],
        }),
        attributes: PERSON_ATTRS,
        // Paged, not a size limit: AD answers "size limit exceeded" without entries.
        paged: PAGE,
      });
      const rank = (person) => (String(person.login || '').toLowerCase().startsWith(value.toLowerCase()) || person.name.toLowerCase().startsWith(value.toLowerCase()) ? 0 : 1);
      return searchEntries
        .map(personOf)
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        .slice(0, Math.min(50, Math.max(1, limit)));
  });
}

// ── writes (as the acting administrator) ─────────────────────────────────────

const memberChange = (operation, memberDn) => new Change({ operation, modification: new Attribute({ type: 'member', values: [memberDn] }) });

// AD: 0x562 ERROR_MEMBER_IN_ALIAS / 0x561 ERROR_MEMBER_NOT_IN_ALIAS come as 68/53 with the code in the text.
const alreadyMember = (err) => err?.code === 68 || err?.code === 20 || (err?.code === 53 && /0+562/i.test(String(err?.message)));
const notMember = (err) => err?.code === 16 || (err?.code === 53 && /0+561/i.test(String(err?.message)));

/** Adds `memberDn` to `groupDn`: 'added' | 'unchanged'. */
export async function addMember(client, groupDn, memberDn) {
  try {
    await client.modify(groupDn, memberChange('add', memberDn));
    return 'added';
  } catch (err) {
    if (alreadyMember(err)) return 'unchanged';
    throw err;
  }
}

/** Removes `memberDn` from `groupDn`: 'removed' | 'unchanged'. */
export async function removeMember(client, groupDn, memberDn) {
  try {
    await client.modify(groupDn, memberChange('delete', memberDn));
    return 'removed';
  } catch (err) {
    if (notMember(err)) return 'unchanged';
    throw err;
  }
}

/**
 * Moves a member from one group to another as one action: add to `toDn`, then
 * remove from `fromDn`. When the removal fails, the addition is rolled back
 * (only if this call made it), so the person never ends up in both.
 * → { added, removed }; on failure the error carries `rolledBack`.
 */
export async function moveMember(client, fromDn, toDn, memberDn) {
  const added = await addMember(client, toDn, memberDn);
  try {
    const removed = await removeMember(client, fromDn, memberDn);
    return { added, removed };
  } catch (err) {
    let rolledBack = added === 'unchanged';
    if (added === 'added') {
      try {
        await removeMember(client, toDn, memberDn);
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
    }
    err.rolledBack = rolledBack;
    throw err;
  }
}

// Global security group (ADS_GROUP_TYPE_GLOBAL_GROUP | ADS_GROUP_TYPE_SECURITY_ENABLED).
export const GLOBAL_SECURITY = '-2147483646';

const escapeRdn = (value) => String(value).replace(/([,\\#+<>;"=])/g, '\\$1').replace(/^ /, '\\ ').replace(/ $/, '\\ ');

export const groupDnFor = (name, ou) => `CN=${escapeRdn(name)},${ou}`;

/**
 * Creates the _full and _read groups (global security) with their descriptions.
 * If the second fails, the first is deleted again. `pair` = [{ name, description }, …].
 */
export async function createGroups(client, ou, pair) {
  const created = [];
  try {
    for (const group of pair) {
      const dn = groupDnFor(group.name, ou);
      await client.add(dn, { objectClass: ['top', 'group'], cn: group.name, sAMAccountName: group.name, groupType: GLOBAL_SECURITY, description: group.description });
      created.push(dn);
    }
    return created;
  } catch (err) {
    let rolledBack = true;
    for (const dn of created.reverse()) {
      try {
        await client.del(dn);
      } catch {
        rolledBack = false;
      }
    }
    err.rolledBack = rolledBack;
    throw err;
  }
}

/** objectSid of each DN, read with `client` (the acting administrator's connection): [sid | null]. */
export async function readSids(client, dns) {
  const out = [];
  for (const dn of dns) {
    try {
      const { searchEntries } = await client.search(String(dn), {
        scope: 'base',
        filter: new PresenceFilter({ attribute: 'objectClass' }),
        attributes: ['objectSid'],
        explicitBufferAttributes: ['objectSid'],
      });
      const entry = searchEntries.find((item) => normDn(item.dn) === normDn(dn));
      out.push(entry ? sidToString(first(lower(entry).objectsid)) : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

export async function setDescription(client, dn, description) {
  const text = String(description || '').trim();
  await client.modify(dn, new Change({ operation: 'replace', modification: new Attribute({ type: 'description', values: text ? [text] : [] }) }));
}

export async function deleteGroup(client, dn) {
  await client.del(dn);
}
