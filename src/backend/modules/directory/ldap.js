import { Attribute, Change, EqualityFilter, OrFilter, PresenceFilter } from 'ldapts';
import { addMember, newClient, rangedValues, removeMember, withActor, withService } from '../drive/access/directory.js';
import { bindServiceAccount, tlsOptionsFor } from '../../services/ldap.js';
import { canonDn, domainOf, parentDn } from './dn.js';
import { encodePassword, httpError, kindOf, lowerKeys, shapeObject } from './logic.js';

/*
 * The real directory: reads bind with the portal's service account, every write binds
 * with the ACTING administrator's own AD account (drive/access/directory.js withActor —
 * the same credential mechanism as File server → Access). The client factory is the one
 * of that module, replaceable in tests (setClientFactory).
 */

const PAGE = { pageSize: 500 };
export const LIST_LIMIT = 5000;
// Tree counters: at most this many objects are read per child OU (the counter shows «N+» past it).
export const COUNT_LIMIT = 2000;
const TREE_CONCURRENCY = 4;
const CACHE_MS = 60 * 1000;

export const LIST_ATTRS = [
  'objectClass', 'distinguishedName', 'cn', 'name', 'ou', 'displayName', 'sAMAccountName', 'userPrincipalName', 'mail', 'givenName', 'sn',
  'title', 'department', 'company', 'telephoneNumber', 'mobile', 'description', 'userAccountControl', 'lockoutTime', 'pwdLastSet',
  'lastLogonTimestamp', 'whenCreated', 'memberOf', 'adminCount', 'operatingSystem', 'dNSHostName', 'groupType', 'objectGUID',
];
const CARD_ATTRS = ['*', 'msDS-User-Account-Control-Computed', 'msDS-UserPasswordExpiryTimeComputed', 'objectGUID'];
const BUFFERS = ['objectGUID', 'thumbnailPhoto', 'objectSid'];
const OBJECTS = new OrFilter({
  filters: [
    new EqualityFilter({ attribute: 'objectCategory', value: 'person' }),
    new EqualityFilter({ attribute: 'objectCategory', value: 'group' }),
    new EqualityFilter({ attribute: 'objectCategory', value: 'computer' }),
  ],
});
const CONTAINERS = new OrFilter({
  filters: [new EqualityFilter({ attribute: 'objectClass', value: 'organizationalUnit' }), new EqualityFilter({ attribute: 'objectClass', value: 'container' })],
});

/** ldapts errors → module errors with a code the UI explains (AD extended codes read from the message). */
export function mapLdapError(err) {
  if (!err || err.statusCode) return err;
  const code = err.code;
  const text = String(err.message || '');
  const make = (status, message, errorCode) => {
    const error = httpError(status, message, errorCode);
    if (typeof code === 'number') error.details = { ldapCode: code };
    return error;
  };
  if (/0000052D/i.test(text)) return make(400, 'The password does not meet the domain password policy (length, complexity or history)', 'AD_PASSWORD_POLICY');
  if (code === 8 || code === 13 || (code === 53 && /0000001F|WILL_NOT_PERFORM/i.test(text) && /unicodePwd|5003/i.test(text))) {
    return make(400, 'Active Directory accepts passwords only over a secure channel (LDAPS or StartTLS)', 'AD_SECURE_CHANNEL');
  }
  if (code === 49) return make(403, 'Active Directory did not accept your password', 'FA_CREDENTIALS_FAILED');
  if (code === 50) return make(403, 'Active Directory refused: your AD account has no rights for this change', 'AD_DENIED');
  if (code === 32) return make(404, 'The object was not found in Active Directory', 'AD_NOT_FOUND');
  if (code === 68) return make(409, 'An object with this name already exists in Active Directory', 'AD_EXISTS');
  if (code === 19) return make(400, 'Active Directory refused the value (a constraint of the directory)', 'AD_CONSTRAINT');
  if (code === 21) return make(400, 'Active Directory refused the value: wrong format', 'AD_INVALID_VALUE');
  if (code === 34 || code === 64) return make(400, 'Active Directory refused the name', 'AD_INVALID_NAME');
  if (code === 65 || code === 53 || code === 66 || code === 67) return make(400, 'Active Directory refused the change', 'AD_REFUSED');
  if (code === 51 || code === 52) return make(503, 'Active Directory is busy or unavailable', 'AD_UNAVAILABLE');
  if (typeof code === 'number') return make(502, 'Active Directory returned an error', 'AD_ERROR');
  return httpError(503, 'Active Directory is not reachable', 'AD_UNAVAILABLE');
}

const first = (value) => (value == null ? null : String([].concat(value)[0]));

function containerOf(entry) {
  const a = lowerKeys(entry);
  return { dn: entry.dn, kind: kindOf(a.objectclass), name: first(a.ou) || first(a.cn) || entry.dn, description: first(a.description) };
}

const lightEntry = (entry) => {
  const a = lowerKeys(entry);
  return { dn: entry.dn, kind: kindOf(a.objectclass), login: first(a.samaccountname), name: first(a.cn) };
};

/** Runs `fn` over `items` with at most `size` in flight; results in order. */
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

const guard = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    throw mapLdapError(err);
  }
};

const policyCache = new Map();
const countCache = new Map();

/** Clears cached counts after a change. */
export function invalidateCounts() {
  countCache.clear();
}

/** Turns drive/access FA_* reach errors into this module's codes (credential codes are kept). */
export function moduleError(err) {
  if (err?.code === 'FA_AD_EXISTS') return httpError(409, 'An object with this name already exists in Active Directory', 'AD_EXISTS');
  if (err?.code === 'FA_AD_UNAVAILABLE') return httpError(503, 'Active Directory is not reachable', 'AD_UNAVAILABLE');
  if (err?.code === 'FA_AD_NOT_FOUND') return httpError(404, 'The object was not found in Active Directory', 'AD_NOT_FOUND');
  if (err?.code === 'FA_AD_DENIED') return httpError(403, 'Active Directory refused: your AD account has no rights for this change', 'AD_DENIED');
  if (err?.code === 'FA_AD_ERROR' || err?.code === 'FA_AD_REFUSED') return Object.assign(httpError(err.statusCode, err.message, err.code === 'FA_AD_ERROR' ? 'AD_ERROR' : 'AD_REFUSED'), { details: err.details });
  return err;
}

const read = async (cfg, fn) => {
  try {
    return await withService(cfg, (client) => guard(() => fn(client)));
  } catch (err) {
    throw moduleError(err);
  }
};

/** The LDAP provider for one request: `cfg` = the integration, `settings` = the module settings. */
export function ldapProvider(cfg, settings = {}) {
  const domain = domainOf(cfg.baseDn) || cfg.baseDn;

  async function maxPwdAgeDays() {
    const hit = policyCache.get(domain);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.days;
    let days = 0;
    try {
      days = await read(cfg, async (client) => {
        const { searchEntries } = await client.search(domain, { scope: 'base', filter: new PresenceFilter({ attribute: 'objectClass' }), attributes: ['maxPwdAge'] });
        const raw = String(lowerKeys(searchEntries[0] || {}).maxpwdage || '0');
        const value = /^-?\d+$/.test(raw) ? BigInt(raw) : 0n;
        // A negative interval in 100 ns; the "never" value is the most negative 64-bit number.
        if (value >= 0n || value === -9223372036854775808n) return 0;
        return Number(-value / 864000000000n);
      });
    } catch {
      days = 0;
    }
    policyCache.set(domain, { at: Date.now(), days });
    return days;
  }

  async function search(base, options) {
    return read(cfg, async (client) => {
      const { searchEntries } = await client.search(base, { paged: PAGE, ...options });
      return searchEntries;
    });
  }

  return {
    mode: 'ldap',
    domain,
    baseDn: cfg.baseDn,
    maxPwdAgeDays,

    /** OUs and containers right below `dn`. */
    async children(dn) {
      const entries = await search(dn, { scope: 'one', filter: CONTAINERS, attributes: ['objectClass', 'ou', 'cn', 'name', 'description'] });
      return entries.map(containerOf);
    },

    /**
     * The tree below `dn` without reading the whole subtree: its OUs / containers (those
     * `keepChild` accepts get counted), the objects right in `dn`, and per kept child the
     * objects of its subtree (at most `limit`; `truncated` past it) and whether it has
     * OUs below (at most `containerLimit` read). One service bind; at most TREE_CONCURRENCY
     * searches in flight. Cached for a minute (cleared by every change).
     */
    async treeSummary(dn, { limit = COUNT_LIMIT, containerLimit = 1, keepChild = () => true } = {}) {
      const key = `${canonDn(dn)}|${limit}|${containerLimit}`;
      const hit = countCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
      const value = await read(cfg, async (client) => {
        const objectsIn = async (base, scope) => {
          const { searchEntries } = await client.search(base, { scope, filter: OBJECTS, attributes: ['objectClass', 'sAMAccountName', 'cn'], paged: PAGE, sizeLimit: limit + 1 });
          return { objects: searchEntries.slice(0, limit).map(lightEntry), truncated: searchEntries.length > limit };
        };
        const { searchEntries: childEntries } = await client.search(dn, { scope: 'one', filter: CONTAINERS, attributes: ['objectClass', 'ou', 'cn', 'name', 'description'], paged: PAGE });
        const children = childEntries.map(containerOf);
        const kept = children.filter((child) => keepChild(child));
        const [self, details] = await Promise.all([
          objectsIn(dn, 'one'),
          pool(kept, TREE_CONCURRENCY, async (child) => {
            const [below, nested] = await Promise.all([
              objectsIn(child.dn, 'sub'),
              client.search(child.dn, { scope: 'one', filter: CONTAINERS, attributes: ['objectClass', 'ou', 'cn'], sizeLimit: containerLimit }).then((result) => result.searchEntries.map(containerOf)),
            ]);
            return { ...child, ...below, containers: nested, containersTruncated: nested.length >= containerLimit };
          }),
        ]);
        return { children, self, details };
      });
      countCache.set(key, { at: Date.now(), value });
      return value;
    },

    /**
     * Users, groups and computers matching `filter` (an ldapts filter) below `base`. `keep`
     * (the module's visibility) is applied BEFORE the list is cut at LIST_LIMIT, so hidden and
     * excluded objects never take places of visible ones; `truncated` says the cut happened.
     */
    async list(base, filter, scope = 'one', spec = null, { keep = null } = {}) {
      const days = await maxPwdAgeDays();
      const entries = await search(base, { scope, filter, attributes: LIST_ATTRS, explicitBufferAttributes: ['objectGUID'] });
      const shaped = entries.map((entry) => shapeObject(entry, { maxPwdAgeDays: days }));
      const objects = keep ? shaped.filter(keep) : shaped;
      return { objects: objects.slice(0, LIST_LIMIT), truncated: objects.length > LIST_LIMIT, limit: LIST_LIMIT, maxPwdAgeDays: days };
    },

    /** One object with every attribute, or null. Groups get all members (ranged retrieval). */
    async object(dn) {
      const days = await maxPwdAgeDays();
      try {
        return await read(cfg, async (client) => {
          const { searchEntries } = await client.search(String(dn), { scope: 'base', filter: new PresenceFilter({ attribute: 'objectClass' }), attributes: CARD_ATTRS, explicitBufferAttributes: BUFFERS });
          const entry = searchEntries.find((item) => canonDn(item.dn) === canonDn(dn));
          if (!entry) return null;
          const shaped = shapeObject(entry, { maxPwdAgeDays: days });
          if (shaped.kind === 'group') shaped.members = await rangedValues(client, entry, 'member');
          return shaped;
        });
      } catch (err) {
        if (err.code === 'AD_NOT_FOUND') return null;
        throw err;
      }
    },

    /** Light entries for DNs (group types of memberOf, names of members); missing ones are left out. */
    async byDns(dns) {
      const wanted = [...new Set(dns.map(String))].slice(0, 1000);
      if (!wanted.length) return [];
      const out = [];
      for (let i = 0; i < wanted.length; i += 40) {
        const chunk = wanted.slice(i, i + 40);
        const filter = new OrFilter({ filters: chunk.map((value) => new EqualityFilter({ attribute: 'distinguishedName', value })) });
        const entries = await search(domain, { scope: 'sub', filter, attributes: LIST_ATTRS, explicitBufferAttributes: ['objectGUID'] });
        out.push(...entries.map((entry) => shapeObject(entry)));
      }
      return out;
    },

    /** Is the login (sAMAccountName) or UPN used anywhere in the domain? → Set of taken lower-case logins among `logins`. */
    async takenLogins(logins, upns = []) {
      const values = [...new Set(logins.filter(Boolean))].slice(0, 40);
      const filters = [
        ...values.map((value) => new EqualityFilter({ attribute: 'sAMAccountName', value })),
        ...upns.filter(Boolean).slice(0, 10).map((value) => new EqualityFilter({ attribute: 'userPrincipalName', value })),
      ];
      if (!filters.length) return { logins: new Set(), upns: new Set() };
      const entries = await search(domain, { scope: 'sub', filter: filters.length === 1 ? filters[0] : new OrFilter({ filters }), attributes: ['sAMAccountName', 'userPrincipalName'] });
      const taken = { logins: new Set(), upns: new Set() };
      for (const entry of entries) {
        const a = lowerKeys(entry);
        if (a.samaccountname) taken.logins.add(String([].concat(a.samaccountname)[0]).toLowerCase());
        if (a.userprincipalname) taken.upns.add(String([].concat(a.userprincipalname)[0]).toLowerCase());
      }
      return taken;
    },

    /** Checks that the service account can open a secure channel: 'ldaps' | 'starttls'. */
    async checkSecure(channel) {
      const client = newClient(cfg);
      try {
        if (channel === 'starttls' && !cfg.useTls) await client.startTLS(tlsOptionsFor(cfg) || {});
        await bindServiceAccount(client, cfg);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message || err).slice(0, 200) };
      } finally {
        await client.unbind().catch(() => {});
      }
    },

    /**
     * Runs `fn(writer)` bound as the acting administrator (`credential` from
     * drive/access/credentials.actorCredential). `secure`: open the session over StartTLS
     * (when the integration is plain LDAP) — needed for passwords.
     */
    async write(credential, fn, { startTls = false } = {}) {
      try {
        return await withActor(
          cfg,
          credential,
          (client) =>
            fn({
              account: credential.account,
              add: (dn, attrs) => guard(() => client.add(dn, attrs)),
              modify: (dn, changes) =>
                guard(() =>
                  client.modify(
                    dn,
                    changes.map((change) => new Change({ operation: change.operation || 'replace', modification: new Attribute({ type: change.type, values: change.values }) }))
                  )
                ),
              move: (dn, newDn) => guard(() => client.modifyDN(dn, newDn)),
              setPassword: (dn, password) => guard(() => client.modify(dn, new Change({ operation: 'replace', modification: new Attribute({ type: 'unicodePwd', values: [encodePassword(password)] }) }))),
              addMember: (groupDn, memberDn) => guard(() => addMember(client, groupDn, memberDn)),
              removeMember: (groupDn, memberDn) => guard(() => removeMember(client, groupDn, memberDn)),
            }),
          { startTls }
        );
      } catch (err) {
        throw moduleError(err);
      } finally {
        invalidateCounts();
      }
    },
  };
}

export { parentDn };
