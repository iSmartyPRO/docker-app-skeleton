import { AndFilter, EqualityFilter, OrFilter, PresenceFilter, SubstringFilter } from 'ldapts';
import { SID, wellKnownName } from '../acl.js';
import { personOf, withService } from './directory.js';
import { sidToString } from './naming.js';

/*
 * Directory reads for the NTFS mode, with the portal's service account:
 * SID → name (ACL subjects), subject search (users, groups, computers, the
 * Builtin container), and the acting administrator's own SIDs (to warn when a
 * change removes their access).
 */

const ATTRS = ['distinguishedName', 'sAMAccountName', 'userPrincipalName', 'displayName', 'cn', 'objectClass', 'objectSid', 'userAccountControl', 'department', 'mail', 'title'];
const PAGE = { pageSize: 500 };
const CACHE_MS = 10 * 60 * 1000;
const BATCH = 40;

const first = (value) => (Array.isArray(value) ? value[0] : value);
const lowerKeys = (entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));

/** "S-1-5-21-…" → binary objectSid (for LDAP filters). */
export function sidToBuffer(sid) {
  const match = /^S-(\d+)-(\d+)((?:-\d+)*)$/.exec(String(sid || ''));
  if (!match) return null;
  const subs = match[3] ? match[3].slice(1).split('-').map(Number) : [];
  if (subs.length > 15 || subs.some((sub) => sub > 0xffffffff)) return null;
  const buffer = Buffer.alloc(8 + subs.length * 4);
  buffer[0] = Number(match[1]);
  buffer[1] = subs.length;
  buffer.writeUIntBE(Number(match[2]), 2, 6);
  subs.forEach((sub, i) => buffer.writeUInt32LE(sub, 8 + i * 4));
  return buffer;
}

/** A directory entry as an ACL subject: { sid, dn, name, login, kind, enabled }. */
export function subjectOf(entry) {
  const person = personOf(entry);
  const raw = first(lowerKeys(entry).objectsid);
  return { ...person, sid: Buffer.isBuffer(raw) ? sidToString(raw) : raw ? String(raw) : null };
}

const cache = new Map();

/** For tests. */
export function clearSidCache() {
  cache.clear();
}

/**
 * Names of SIDs: Map sid → subject (only the ones found). Well-known SIDs are
 * not looked up (wellKnownName covers them); results are cached for 10 minutes.
 */
export async function lookupSids(cfg, base, sids) {
  const out = new Map();
  const wanted = [];
  for (const sid of new Set((sids || []).filter(Boolean))) {
    const hit = cache.get(sid);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      if (hit.subject) out.set(sid, hit.subject);
    } else if (sidToBuffer(sid) && !(wellKnownName(sid) && !/^S-1-5-21-/.test(sid))) {
      wanted.push(sid);
    }
  }
  if (!wanted.length) return out;
  await withService(cfg, async (client) => {
    for (let i = 0; i < wanted.length; i += BATCH) {
      const part = wanted.slice(i, i + BATCH);
      const { searchEntries } = await client.search(base, {
        scope: 'sub',
        filter: new OrFilter({ filters: part.map((sid) => new EqualityFilter({ attribute: 'objectSid', value: sidToBuffer(sid) })) }),
        attributes: ATTRS,
        explicitBufferAttributes: ['objectSid'],
        paged: PAGE,
      });
      const found = new Map(searchEntries.map(subjectOf).filter((subject) => subject.sid).map((subject) => [subject.sid, subject]));
      for (const sid of part) {
        const subject = found.get(sid) || null;
        cache.set(sid, { at: Date.now(), subject });
        if (subject) out.set(sid, subject);
      }
    }
  });
  if (cache.size > 20000) cache.clear();
  return out;
}

// Principals that are not directory objects but are often granted on folders.
const WELL_KNOWN_SUBJECTS = [SID.EVERYONE, SID.AUTHENTICATED_USERS, SID.SYSTEM, SID.ADMINISTRATORS, SID.USERS, SID.CREATOR_OWNER, 'S-1-5-32-551'];

/** Users, groups (incl. Builtin) and computers by name / login / e-mail, plus matching well-known principals. */
export async function searchSubjects(cfg, base, text, { limit = 25 } = {}) {
  const value = String(text || '').trim().slice(0, 64);
  if (value.length < 2) return [];
  const lower = value.toLowerCase();
  const known = WELL_KNOWN_SUBJECTS.filter((sid) => wellKnownName(sid).toLowerCase().includes(lower)).map((sid) => ({ sid, dn: null, name: wellKnownName(sid), login: null, kind: 'wellknown', enabled: true }));
  const found = await withService(cfg, async (client) => {
    const { searchEntries } = await client.search(base, {
      scope: 'sub',
      filter: new AndFilter({
        filters: [
          new OrFilter({
            filters: [
              new EqualityFilter({ attribute: 'objectCategory', value: 'person' }),
              new EqualityFilter({ attribute: 'objectCategory', value: 'group' }),
              new EqualityFilter({ attribute: 'objectCategory', value: 'computer' }),
            ],
          }),
          new PresenceFilter({ attribute: 'objectSid' }),
          new OrFilter({ filters: ['sAMAccountName', 'userPrincipalName', 'displayName', 'cn', 'mail'].map((attribute) => new SubstringFilter({ attribute, any: [value] })) }),
        ],
      }),
      attributes: ATTRS,
      explicitBufferAttributes: ['objectSid'],
      paged: PAGE,
    });
    return searchEntries.map(subjectOf).filter((subject) => subject.sid);
  });
  const rank = (subject) => (String(subject.login || '').toLowerCase().startsWith(lower) || subject.name.toLowerCase().startsWith(lower) ? 0 : 1);
  return [...known, ...found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))].slice(0, Math.min(50, Math.max(1, limit)));
}

/**
 * The administrator's own SID and the SIDs of every group they are in
 * (tokenGroups, nested included), plus Everyone and Authenticated Users,
 * which every signed-in account has on the file server.
 */
export async function actorSidsOf(cfg, dn) {
  const sids = await withService(cfg, async (client) => {
    const { searchEntries } = await client.search(String(dn), {
      scope: 'base',
      filter: new PresenceFilter({ attribute: 'objectClass' }),
      attributes: ['objectSid', 'tokenGroups'],
      explicitBufferAttributes: ['objectSid', 'tokenGroups'],
    });
    const entry = searchEntries[0] ? lowerKeys(searchEntries[0]) : {};
    const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
    return [...list(entry.objectsid), ...list(entry.tokengroups)].map((value) => (Buffer.isBuffer(value) ? sidToString(value) : null)).filter(Boolean);
  });
  if (!sids.length) return [];
  return [...new Set([...sids, SID.EVERYONE, SID.AUTHENTICATED_USERS])];
}
