import { randomUUID } from 'crypto';
import { query, withTransaction } from '../../config/database.js';
import { canonDn, isUnder, parentDn, parseDn } from './dn.js';
import { httpError, kindOf, lowerKeys, matchesFilter, shapeObject, toFileTime } from './logic.js';

/*
 * The demo directory («Демо-каталог»): neutral OUs, users, groups and computers in
 * the table ad_demo_objects, shown when the AD integration is not set up and a
 * superadministrator filled the module's demo data. Same interface as the LDAP
 * provider (ldap.js) and the same scope rules on top; no LDAP call is ever made and
 * no password is stored (a reset only moves pwdLastSet).
 */

export const DEMO_BASE = 'DC=example,DC=local';
export const DEMO_ROOT = `OU=Accounts,${DEMO_BASE}`;
// Hidden in the demo like the service and administrators' OUs of a real domain.
export const DEMO_EXCLUDED = [`OU=Service,${DEMO_ROOT}`, 'Admins'];
export const DEMO_MAX_PWD_AGE = 90;

export async function demoDirectoryExists() {
  try {
    const { rows } = await query(`SELECT 1 FROM ad_demo_objects LIMIT 1`);
    return rows.length > 0;
  } catch {
    return false;
  }
}

const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

function entryOf(row, memberOf) {
  return { dn: row.dn, ...row.attrs, memberOf: memberOf.get(row.canon) || [] };
}

async function loadAll(run = query) {
  const { rows } = await run(`SELECT id, dn, canon, parent_canon, kind, attrs FROM ad_demo_objects ORDER BY id`);
  const memberOf = new Map();
  for (const row of rows) {
    if (row.kind !== 'group') continue;
    for (const member of asList(row.attrs.member)) {
      const key = canonDn(member);
      if (!memberOf.has(key)) memberOf.set(key, []);
      memberOf.get(key).push(row.dn);
    }
  }
  return { rows, memberOf };
}

const OBJECT_KINDS = ['user', 'group', 'computer'];

export function demoProvider() {
  const now = () => new Date();
  return {
    mode: 'demo',
    domain: DEMO_BASE,
    baseDn: DEMO_BASE,
    maxPwdAgeDays: async () => DEMO_MAX_PWD_AGE,

    async children(dn) {
      const key = canonDn(dn);
      const { rows } = await query(`SELECT dn, kind, attrs FROM ad_demo_objects WHERE parent_canon = $1 AND kind IN ('ou', 'container') ORDER BY LOWER(dn)`, [key]);
      return rows.map((row) => ({ dn: row.dn, kind: row.kind, name: String(row.attrs.ou || row.attrs.cn || parseDn(row.dn)?.[0]?.value || row.dn), description: row.attrs.description || null }));
    },

    /** Same answer as the LDAP provider's treeSummary (ldap.js), from one read of the table. */
    async treeSummary(dn, { limit = 2000, containerLimit = 1, keepChild = () => true } = {}) {
      const { rows } = await loadAll();
      const parsed = rows.map((row) => ({ row, rdns: parseDn(row.dn) }));
      const parent = canonDn(dn);
      const containerOf = (row) => ({ dn: row.dn, kind: row.kind, name: String(row.attrs.ou || row.attrs.cn || parseDn(row.dn)?.[0]?.value || row.dn), description: row.attrs.description || null });
      const light = (row) => ({ dn: row.dn, kind: row.kind, login: row.attrs.samaccountname || null, name: row.attrs.cn || null });
      const capped = (list) => ({ objects: list.slice(0, limit).map(light), truncated: list.length > limit });
      const children = rows.filter((row) => row.parent_canon === parent && ['ou', 'container'].includes(row.kind)).map(containerOf);
      const objects = parsed.filter((item) => OBJECT_KINDS.includes(item.row.kind));
      const details = children.filter((child) => keepChild(child)).map((child) => {
        const base = parseDn(child.dn);
        const nested = rows.filter((row) => row.parent_canon === canonDn(child.dn) && ['ou', 'container'].includes(row.kind)).slice(0, containerLimit).map(containerOf);
        return { ...child, ...capped(objects.filter((item) => item.rdns && isUnder(item.rdns, base)).map((item) => item.row)), containers: nested, containersTruncated: nested.length >= containerLimit };
      });
      return { children, self: capped(objects.filter((item) => item.row.parent_canon === parent).map((item) => item.row)), details };
    },

    async list(base, filter, scope = 'one', spec) {
      const { rows, memberOf } = await loadAll();
      const parent = canonDn(base);
      const baseRdns = parseDn(base);
      const objects = rows
        .filter((row) => OBJECT_KINDS.includes(row.kind) && (scope === 'sub' ? isUnder(row.dn, baseRdns) : row.parent_canon === parent))
        .map((row) => shapeObject(entryOf(row, memberOf), { maxPwdAgeDays: DEMO_MAX_PWD_AGE, now: now() }))
        .filter((object) => !spec || matchesFilter(object, spec, { now: now() }));
      return { objects, truncated: false, limit: null, maxPwdAgeDays: DEMO_MAX_PWD_AGE };
    },

    async object(dn) {
      const { rows, memberOf } = await loadAll();
      const row = rows.find((item) => item.canon === canonDn(dn));
      if (!row) return null;
      const shaped = shapeObject(entryOf(row, memberOf), { maxPwdAgeDays: DEMO_MAX_PWD_AGE, now: now() });
      if (shaped.kind === 'group') shaped.members = asList(row.attrs.member);
      return shaped;
    },

    async byDns(dns) {
      const wanted = new Set(dns.map((dn) => canonDn(dn)));
      const { rows, memberOf } = await loadAll();
      return rows.filter((row) => wanted.has(row.canon)).map((row) => shapeObject(entryOf(row, memberOf), { maxPwdAgeDays: DEMO_MAX_PWD_AGE }));
    },

    async takenLogins(logins, upns = []) {
      const { rows } = await query(`SELECT LOWER(attrs->>'samaccountname') AS login, LOWER(attrs->>'userprincipalname') AS upn FROM ad_demo_objects WHERE kind IN ('user', 'computer', 'group')`);
      const wantLogins = new Set(logins.filter(Boolean).map((item) => item.toLowerCase()));
      const wantUpns = new Set(upns.filter(Boolean).map((item) => item.toLowerCase()));
      return {
        logins: new Set(rows.map((row) => row.login).filter((login) => login && wantLogins.has(login))),
        upns: new Set(rows.map((row) => row.upn).filter((upn) => upn && wantUpns.has(upn))),
      };
    },

    async checkSecure() {
      return { ok: true, demo: true };
    },

    /** Writes go to the demo table in one transaction; the "AD account" is «demo». */
    async write(credential, fn) {
      return withTransaction(async (client) => {
        const run = (text, params) => client.query(text, params);
        const rowOf = async (dn) => {
          const { rows } = await run(`SELECT id, dn, canon, kind, attrs FROM ad_demo_objects WHERE canon = $1 FOR UPDATE`, [canonDn(dn)]);
          if (!rows[0]) throw httpError(404, 'The object was not found in Active Directory', 'AD_NOT_FOUND');
          return rows[0];
        };
        const save = (row, attrs) => run(`UPDATE ad_demo_objects SET attrs = $2 WHERE id = $1`, [row.id, JSON.stringify(attrs)]);
        return fn({
          account: 'demo',
          async add(dn, attrs) {
            const canon = canonDn(dn);
            if (!canon) throw httpError(400, 'Active Directory refused the name', 'AD_INVALID_NAME');
            const lower = lowerKeys(attrs);
            const taken = await run(`SELECT 1 FROM ad_demo_objects WHERE canon = $1 OR (LOWER(attrs->>'samaccountname') = LOWER($2::text) AND $2::text IS NOT NULL)`, [canon, lower.samaccountname || null]);
            if (taken.rows.length) throw httpError(409, 'An object with this name already exists in Active Directory', 'AD_EXISTS');
            const stored = { ...lower, whencreated: stamp(), objectguid: randomGuid() };
            await run(`INSERT INTO ad_demo_objects (dn, canon, parent_canon, kind, attrs) VALUES ($1, $2, $3, $4, $5)`, [dn, canon, canonDn(parentDn(dn)), kindOf(lower.objectclass), JSON.stringify(stored)]);
          },
          async modify(dn, changes) {
            const row = await rowOf(dn);
            const attrs = { ...row.attrs };
            for (const change of changes) {
              const key = change.type.toLowerCase();
              const values = (change.values || []).map(String);
              if (change.operation === 'add') attrs[key] = [...new Set([...asList(attrs[key]), ...values])];
              else if (change.operation === 'delete') attrs[key] = values.length ? asList(attrs[key]).filter((value) => !values.includes(value)) : [];
              else attrs[key] = values.length > 1 ? values : values[0] ?? null;
              if (attrs[key] == null || (Array.isArray(attrs[key]) && !attrs[key].length)) delete attrs[key];
            }
            await save(row, attrs);
          },
          async move(dn, newDn) {
            const row = await rowOf(dn);
            const canon = canonDn(newDn);
            if ((await run(`SELECT 1 FROM ad_demo_objects WHERE canon = $1`, [canon])).rows.length) throw httpError(409, 'An object with this name already exists in Active Directory', 'AD_EXISTS');
            await run(`UPDATE ad_demo_objects SET dn = $2, canon = $3, parent_canon = $4 WHERE id = $1`, [row.id, newDn, canon, canonDn(parentDn(newDn))]);
            // References follow the object, as AD does for member / manager.
            const { rows } = await run(`SELECT id, attrs FROM ad_demo_objects WHERE attrs ? 'member' OR attrs ? 'manager'`);
            for (const other of rows) {
              const attrs = { ...other.attrs };
              let changed = false;
              if (attrs.member) {
                attrs.member = asList(attrs.member).map((value) => (canonDn(value) === row.canon ? ((changed = true), newDn) : value));
              }
              if (attrs.manager && canonDn(attrs.manager) === row.canon) {
                attrs.manager = newDn;
                changed = true;
              }
              if (changed) await run(`UPDATE ad_demo_objects SET attrs = $2 WHERE id = $1`, [other.id, JSON.stringify(attrs)]);
            }
          },
          async setPassword(dn) {
            const row = await rowOf(dn);
            // The password itself is never stored: only the moment it was set.
            await save(row, { ...row.attrs, pwdlastset: toFileTime(new Date()) });
          },
          async addMember(groupDn, memberDn) {
            const row = await rowOf(groupDn);
            const members = asList(row.attrs.member);
            if (members.some((value) => canonDn(value) === canonDn(memberDn))) return 'unchanged';
            await save(row, { ...row.attrs, member: [...members, memberDn] });
            return 'added';
          },
          async removeMember(groupDn, memberDn) {
            const row = await rowOf(groupDn);
            const members = asList(row.attrs.member);
            const left = members.filter((value) => canonDn(value) !== canonDn(memberDn));
            if (left.length === members.length) return 'unchanged';
            await save(row, { ...row.attrs, member: left });
            return 'removed';
          },
        });
      });
    },
  };
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}.0Z`;
}

const randomGuid = () => randomUUID();

export { stamp as generalizedStamp, randomGuid };
