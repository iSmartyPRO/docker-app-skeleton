/*
 * An in-process fake of an Active Directory for tests: entries in memory and a client with
 * the ldapts surface the portal uses (bind, startTLS, search, add, modify, modifyDN, del,
 * unbind). Plug it in with drive/access/directory.js setClientFactory(() => fake.client()).
 *
 * It behaves like AD where it matters for security tests:
 *   - binds check passwords; the service account may only read (writes → 50);
 *   - unicodePwd over a connection without TLS / StartTLS → 53 "WILL_NOT_PERFORM";
 *   - search honours sizeLimit (the first entries, like AD's sizeLimitExceeded through ldapts);
 *   - search evaluates the real ldapts filter objects (And/Or/Not/Equality/Substring/
 *     Presence/>=/<=/Extensible bitwise AND), so escaping is exercised for real.
 * Every call is recorded in `fake.calls` with the identity the connection was bound as.
 */
import { canonDn, isUnder, parentDn, parseDn } from '../modules/directory/dn.js';

const lowerKeys = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]));
const values = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const ldapError = (code, message) => Object.assign(new Error(message || `ldap ${code}`), { code });

function matches(filter, attrs) {
  const name = filter.constructor.name;
  const get = (attribute) => values(attrs[String(attribute).toLowerCase()]).map((value) => (Buffer.isBuffer(value) ? value : String(value)));
  switch (name) {
    case 'AndFilter':
      return filter.filters.every((item) => matches(item, attrs));
    case 'OrFilter':
      return filter.filters.some((item) => matches(item, attrs));
    case 'NotFilter':
      return !matches(filter.filter, attrs);
    case 'PresenceFilter':
      return get(filter.attribute).length > 0;
    case 'EqualityFilter': {
      const want = filter.value;
      return get(filter.attribute).some((value) => (Buffer.isBuffer(want) ? Buffer.isBuffer(value) && value.equals(want) : String(value).toLowerCase() === String(want).toLowerCase()));
    }
    case 'SubstringFilter':
      return get(filter.attribute).some((raw) => {
        const value = String(raw).toLowerCase();
        let at = 0;
        if (filter.initial) {
          if (!value.startsWith(filter.initial.toLowerCase())) return false;
          at = filter.initial.length;
        }
        for (const part of filter.any || []) {
          const found = value.indexOf(part.toLowerCase(), at);
          if (found < 0) return false;
          at = found + part.length;
        }
        return !filter.final || value.slice(at).endsWith(filter.final.toLowerCase());
      });
    case 'GreaterThanEqualsFilter':
      return get(filter.attribute).some((value) => BigInt(value) >= BigInt(filter.value));
    case 'LessThanEqualsFilter':
      return get(filter.attribute).some((value) => BigInt(value) <= BigInt(filter.value));
    case 'ExtensibleFilter':
      if (filter.rule !== '1.2.840.113556.1.4.803') return false;
      return get(filter.matchType).some((value) => (Number(value) & Number(filter.value)) === Number(filter.value));
    default:
      throw new Error(`fake LDAP: unsupported filter ${name}`);
  }
}

export function fakeDirectory({ entries = [], accounts = {}, serviceDn, useTls = false } = {}) {
  const store = new Map();
  const calls = [];
  const put = (dn, attrs) => store.set(canonDn(dn), { dn, attrs: lowerKeys(attrs) });
  for (const entry of entries) put(entry.dn, entry.attrs || {});

  function client() {
    const session = { boundAs: null, secure: useTls };
    const log = (op, ...args) => calls.push({ op, as: session.boundAs, secure: session.secure, args });
    const writable = () => {
      if (!session.boundAs) throw ldapError(1, '000004DC: LdapErr: DSID-0C090A5C, comment: In order to perform this operation a successful bind must be completed');
      if (canonDn(session.boundAs) === canonDn(serviceDn)) throw ldapError(50, '00002098: SecErr: DSID-03150F94, problem 4003 (INSUFF_ACCESS_RIGHTS), data 0');
    };
    const find = (dn) => store.get(canonDn(dn));
    return {
      async bind(dn, password) {
        log('bind', dn);
        const want = accounts[canonDn(dn)] ?? accounts[String(dn).toLowerCase()];
        if (!password || want === undefined || want !== password) throw ldapError(49, '80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 52e, v4563');
        session.boundAs = dn;
      },
      async startTLS() {
        log('startTLS');
        session.secure = true;
      },
      async unbind() {
        log('unbind');
        session.boundAs = null;
      },
      async search(base, options = {}) {
        log('search', base, options.scope, options.sizeLimit || 0);
        if (!session.boundAs) throw ldapError(1, 'bind first');
        const baseRdns = parseDn(base);
        if (!baseRdns) throw ldapError(34, 'invalid DN');
        if (options.scope === 'base' && !find(base) && !store.size) return { searchEntries: [] };
        const scope = options.scope || 'sub';
        const out = [];
        for (const { dn, attrs } of store.values()) {
          if (scope === 'base' && canonDn(dn) !== canonDn(base)) continue;
          if (scope === 'one' && canonDn(parentDn(dn)) !== canonDn(base)) continue;
          if (scope === 'sub' && !isUnder(dn, baseRdns)) continue;
          if (options.filter && typeof options.filter === 'object' && !matches(options.filter, { ...attrs, distinguishedname: dn })) continue;
          // Group memberOf is computed like AD does.
          const memberOf = [...store.values()].filter((item) => values(item.attrs.member).some((member) => canonDn(member) === canonDn(dn))).map((item) => item.dn);
          out.push({ dn, ...attrs, ...(memberOf.length ? { memberOf } : {}) });
        }
        if (scope === 'base' && !out.length) throw ldapError(32, '0000208D: NameErr: DSID-03100241, problem 2001 (NO_OBJECT)');
        // A size limit: AD answers sizeLimitExceeded with the first entries, which ldapts returns as a result.
        if (options.sizeLimit > 0 && out.length > options.sizeLimit) return { searchEntries: out.slice(0, options.sizeLimit) };
        return { searchEntries: out };
      },
      async add(dn, attrs) {
        log('add', dn, attrs);
        writable();
        if (find(dn)) throw ldapError(68, '00000524: UpdErr: DSID-031A11E2, problem 6005 (ENTRY_EXISTS)');
        if (!find(parentDn(dn))) throw ldapError(32, 'no parent');
        put(dn, { ...attrs, objectCategory: values(attrs.objectClass).includes('group') ? 'group' : 'person' });
      },
      async modify(dn, changes) {
        const list = Array.isArray(changes) ? changes : [changes];
        log('modify', dn, list.map((change) => [change.operation, change.modification.type]));
        writable();
        const entry = find(dn);
        if (!entry) throw ldapError(32, 'no object');
        for (const change of list) {
          const type = change.modification.type.toLowerCase();
          const vals = change.modification.values;
          if (type === 'unicodepwd') {
            if (!session.secure) throw ldapError(53, '0000001F: SvcErr: DSID-031A12D2, problem 5003 (WILL_NOT_PERFORM), data 0');
            entry.attrs.pwdlastset = '133000000000000000';
            continue;
          }
          if (type === 'member') {
            const current = values(entry.attrs.member);
            const has = current.some((value) => canonDn(value) === canonDn(vals[0]));
            if (change.operation === 'add') {
              if (has) throw ldapError(68, '00000562: UpdErr: DSID-031A1254, problem 6005 (ENTRY_EXISTS)');
              entry.attrs.member = [...current, String(vals[0])];
            } else {
              if (!has) throw ldapError(53, '00000561: SvcErr: DSID-031A1254, problem 5003 (WILL_NOT_PERFORM)');
              entry.attrs.member = current.filter((value) => canonDn(value) !== canonDn(vals[0]));
            }
            continue;
          }
          if (change.operation === 'replace') entry.attrs[type] = vals.length > 1 ? vals.map(String) : vals.length ? String(vals[0]) : undefined;
          if (entry.attrs[type] === undefined) delete entry.attrs[type];
        }
      },
      async modifyDN(dn, newDn) {
        log('modifyDN', dn, newDn);
        writable();
        const entry = find(dn);
        if (!entry) throw ldapError(32, 'no object');
        if (!find(parentDn(newDn))) throw ldapError(32, 'no new parent');
        store.delete(canonDn(dn));
        put(newDn, entry.attrs);
        for (const item of store.values()) if (item.attrs.member) item.attrs.member = values(item.attrs.member).map((value) => (canonDn(value) === canonDn(dn) ? newDn : value));
      },
      async del(dn) {
        log('del', dn);
        writable();
        store.delete(canonDn(dn));
      },
    };
  }

  return { store, calls, client, get: (dn) => store.get(canonDn(dn)) };
}
