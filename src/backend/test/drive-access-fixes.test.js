import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_ACCESS_DEFAULTS } from '../modules/drive/settings.js';
import { directoryGuid } from '../services/ldap.js';
import { describeGroup, nameTaken, newGroupNames } from '../modules/drive/access/naming.js';
import { groupRefusal, journalScope, supersededRefusal } from '../modules/drive/access/policy.js';
import { cachedGroups, findAccount, guidToBuffer, invalidateGroups, readSids, setClientFactory, withActor } from '../modules/drive/access/directory.js';
import { bindNameFor, dnsDomain, isImpersonation, loginMatches, parkCredential, resolveIdentity } from '../modules/drive/access/credentials.js';
import { globToLike, journalFilter, laterChanges } from '../modules/drive/access/journal.js';
import { applyMembership } from '../modules/drive/access/service.js';
import { PASSWORD_ATTEMPTS } from '../modules/drive/access/routes.js';

/*
 * Review fixes of the folder access section (now File server «Доступ») (#4, #6–#12). No AD, no database:
 * LDAP clients and journal writers are mocks.
 */

const SETTINGS = { ...DRIVE_ACCESS_DEFAULTS, defaultProject: 'co', shareMap: [{ shareId: 1, prefix: 'W:' }] };
const CFG = { host: 'dc', baseDn: 'OU=Accounts,DC=corp,DC=kg' };
const GUID = '6f9619ff-8b86-d011-b42d-00c04fc964ff';
const OTHER_GUID = '11111111-2222-3333-4444-555555555555';
const ldapError = (code, message = `ldap ${code}`) => Object.assign(new Error(message), { code });

function mockClient({ bind, search, modify } = {}) {
  const calls = [];
  return {
    calls,
    async bind(dn, password) {
      calls.push(['bind', dn]);
      if (bind) throw bind(dn, password);
    },
    async unbind() {
      calls.push(['unbind']);
    },
    async search(base, options) {
      calls.push(['search', base, options]);
      return search ? search(base, options) : { searchEntries: [] };
    },
    async modify(dn, change) {
      calls.push(['modify', change.operation, dn]);
      if (modify) await modify(dn, change);
    },
  };
}

const userEntry = (dn, { guid = GUID, sam = 'admin', upn = 'admin@corp.kg' } = {}) => ({
  dn,
  sAMAccountName: sam,
  userPrincipalName: upn,
  objectGUID: guidToBuffer(guid),
});

// ── #4 bind identity ─────────────────────────────────────────────────────────

test('#4 objectGUID text ↔ bytes round-trips with the sign-in code', () => {
  const bytes = guidToBuffer(GUID);
  assert.equal(bytes.length, 16);
  assert.equal(bytes.toString('hex'), 'ff19966f868b11d0b42d00c04fc964ff');
  assert.equal(directoryGuid({ objectguid: bytes }), GUID);
  assert.equal(guidToBuffer('not a guid'), null);
  assert.equal(guidToBuffer(null), null);
  assert.equal(dnsDomain(CFG.baseDn), 'corp.kg');
});

test('#4 the saved user name must name the same AD account', () => {
  const account = { login: 'Admin', upn: 'admin.x@corp.kg' };
  assert.equal(loginMatches('admin', account, 'corp.kg'), true);
  assert.equal(loginMatches('CORP\\ADMIN', account, 'corp.kg'), true);
  assert.equal(loginMatches('admin.x@corp.kg', account, 'corp.kg'), true);
  assert.equal(loginMatches('admin@corp.kg', account, 'corp.kg'), true);
  assert.equal(loginMatches('admin@other.kg', account, 'corp.kg'), false);
  assert.equal(loginMatches('ivan', account, 'corp.kg'), false);
  assert.equal(loginMatches('CORP\\ivan', account, 'corp.kg'), false);
  assert.equal(loginMatches('', account, 'corp.kg'), false);
  assert.equal(loginMatches('admin', null, 'corp.kg'), false);
  assert.equal(bindNameFor('admin', 'corp.kg'), 'admin@corp.kg');
  assert.equal(bindNameFor('CORP\\admin', 'corp.kg'), 'CORP\\admin');
  assert.equal(bindNameFor('admin@corp.kg', 'corp.kg'), 'admin@corp.kg');
});

test('#4 identity: fresh DN by GUID, other account refused, name fallback only with a GUID', async () => {
  const user = { directory_guid: GUID, external_id: 'CN=Admin,OU=Old,OU=Accounts,DC=corp,DC=kg' };
  const moved = { dn: 'CN=Admin,OU=IT,OU=Accounts,DC=corp,DC=kg', login: 'admin', upn: 'admin@corp.kg', guid: GUID };
  let asked;
  const found = await resolveIdentity(CFG, user, { username: 'admin' }, {
    lookup: async (cfg, query) => {
      asked = query;
      return moved;
    },
  });
  assert.deepEqual(asked, { guid: GUID, dn: user.external_id });
  assert.deepEqual(found, { dn: moved.dn, bindName: moved.dn, dnKnown: true, account: 'admin', expectGuid: null });

  // The drive credential was saved for somebody else: never used here.
  await assert.rejects(resolveIdentity(CFG, user, { username: 'ivan' }, { lookup: async () => moved }), (err) => err.code === 'FA_CREDENTIALS_REQUIRED' && err.details.reason === 'OTHER_ACCOUNT');

  // Not found by the service account: bind by name, checked by GUID after the bind; never parked on 52e.
  const fallback = await resolveIdentity(CFG, user, { username: 'admin' }, { lookup: async () => null });
  assert.deepEqual(fallback, { dn: null, bindName: 'admin@corp.kg', dnKnown: false, account: 'admin@corp.kg', expectGuid: GUID });

  // Without a GUID nothing can prove whose account a name is.
  await assert.rejects(resolveIdentity(CFG, { ...user, directory_guid: null }, { username: 'admin' }, { lookup: async () => null }), { code: 'FA_ACCOUNT_NOT_FOUND' });
});

test('#4 the account is looked up fresh by objectGUID, else by a DN with the same GUID', async () => {
  const fresh = 'CN=Admin,OU=IT,OU=Accounts,DC=corp,DC=kg';
  const stale = 'CN=Admin,OU=Old,OU=Accounts,DC=corp,DC=kg';
  try {
    const byGuid = mockClient({ search: (base, options) => (options.scope === 'sub' ? { searchEntries: [userEntry(fresh)] } : { searchEntries: [] }) });
    setClientFactory(() => byGuid);
    const account = await findAccount(CFG, { guid: GUID, dn: stale });
    assert.equal(account.dn, fresh);
    assert.equal(account.login, 'admin');
    const guidSearch = byGuid.calls.find((call) => call[0] === 'search');
    assert.equal(guidSearch[1], 'DC=corp,DC=kg');
    assert.equal(guidSearch[2].filter.attribute, 'objectGUID');
    assert.ok(Buffer.isBuffer(guidSearch[2].filter.value));

    // No GUID stored: the DN, when it exists.
    setClientFactory(() => mockClient({ search: (base) => ({ searchEntries: base === stale ? [userEntry(stale)] : [] }) }));
    assert.equal((await findAccount(CFG, { guid: null, dn: stale })).dn, stale);

    // The DN now belongs to another object (deleted and re-created): not this person.
    setClientFactory(() => mockClient({ search: (base, options) => ({ searchEntries: options.scope === 'base' ? [userEntry(stale, { guid: OTHER_GUID })] : [] }) }));
    assert.equal(await findAccount(CFG, { guid: GUID, dn: stale }), null);

    // The DN does not exist.
    setClientFactory(() => mockClient({ search: (base, options) => (options.scope === 'base' ? Promise.reject(ldapError(32)) : { searchEntries: [] }) }));
    assert.equal(await findAccount(CFG, { guid: GUID, dn: stale }), null);
  } finally {
    setClientFactory(null);
  }
});

test('#4 a bad-password bind parks the password only for a DN known to exist', async () => {
  try {
    setClientFactory(() => mockClient({ bind: () => ldapError(49, '80090308: LdapErr: AcceptSecurityContext error, data 52e, v4563') }));
    await assert.rejects(withActor(CFG, { bindName: 'admin@corp.kg', password: 'pw', dnKnown: false }, async () => 'never'), (err) => err.code === 'FA_CREDENTIALS_FAILED' && err.details.reason === 'AUTH_FAILED' && err.park === false);
    await assert.rejects(withActor(CFG, { dn: 'CN=Admin', bindName: 'CN=Admin', password: 'pw', dnKnown: true }, async () => 'never'), (err) => err.park === true);
    // Older callers ({ dn, password }) keep parking.
    await assert.rejects(withActor(CFG, { dn: 'CN=Admin', password: 'pw' }, async () => 'never'), (err) => err.park === true);
    // A locked account is a fact about an existing account: parked whatever the name.
    setClientFactory(() => mockClient({ bind: () => ldapError(49, 'data 775') }));
    await assert.rejects(withActor(CFG, { bindName: 'admin@corp.kg', password: 'pw', dnKnown: false }, async () => 'never'), (err) => err.details.reason === 'ACCOUNT_LOCKED' && err.park === true);
  } finally {
    setClientFactory(null);
  }
});

test('#4 a bind by name is checked by objectGUID with the person\'s own connection', async () => {
  try {
    const own = mockClient({ search: () => ({ searchEntries: [userEntry('CN=Admin,OU=IT,OU=Accounts,DC=corp,DC=kg')] }) });
    setClientFactory(() => own);
    const result = await withActor(CFG, { bindName: 'admin@corp.kg', password: 'pw', dnKnown: false, expectGuid: GUID }, async () => 'done');
    assert.equal(result, 'done');
    assert.deepEqual(own.calls[0], ['bind', 'admin@corp.kg']);
    assert.equal(own.calls[1][1], 'DC=corp,DC=kg');

    const other = mockClient({ search: () => ({ searchEntries: [userEntry('CN=Ivan,DC=corp,DC=kg', { guid: OTHER_GUID })] }) });
    setClientFactory(() => other);
    let ran = false;
    await assert.rejects(
      withActor(CFG, { bindName: 'CORP\\admin', password: 'pw', dnKnown: false, expectGuid: GUID }, async () => {
        ran = true;
      }),
      (err) => err.code === 'FA_CREDENTIALS_REQUIRED' && err.details.reason === 'OTHER_ACCOUNT'
    );
    assert.equal(ran, false);
    assert.equal(other.calls[1][2].filter.value, 'admin');
    assert.deepEqual(other.calls.at(-1), ['unbind']);
  } finally {
    setClientFactory(null);
  }
});

// ── #6 system administrators: only groups that fully parse ──────────────────

const group = (name, description = 'W:\\06-HR;Full Access', settings = SETTINGS, dn = `CN=${name},OU=Groups,OU=CO,OU=Accounts,DC=corp,DC=kg`) => describeGroup({ dn, name, description }, settings);

test('#6 a system administrator may change only well-formed, unprotected groups in the managed OU', () => {
  assert.equal(groupRefusal('sysadmin', group('sg_co_hr_full')), null);
  assert.equal(groupRefusal('sysadmin', group('sg_wh_hr_read', 'W:\\06-HR;Read Only')), null, 'old org code is accepted');
  assert.equal(groupRefusal('sysadmin', group('sg_co_hr_read', 'X:\\HR;Read Only')), null, 'unmapped letter is a settings gap');
  for (const [name, description] of [
    ['sg_vpn_users', 'VPN'],
    ['sg_it_admins', 'W:\\IT;Full Access'],
    ['sg_co_hr_full', ''],
    ['sg_co_hr_full', 'W:\\06-HR'],
    ['sg_co_hr_full', 'W:\\06-HR;Everything'],
    ['sg_co_hr_full', 'somewhere;Full Access'],
    ['sg_co_hr_full', 'W:\\06-HR;Read Only'],
  ]) {
    assert.equal(groupRefusal('sysadmin', group(name, description)), 'FA_GROUP_NEEDS_REVIEW', `${name} / ${description}`);
    assert.equal(groupRefusal('superadmin', group(name, description)), null);
  }
  assert.equal(groupRefusal('sysadmin', group('sg_co_root_full', 'W:;Full Access')), 'FA_GROUP_PROTECTED');
  // Any project code, unless an allow-list is set.
  assert.equal(groupRefusal('sysadmin', group('sg_xx_hr_full')), null);
  assert.equal(groupRefusal('sysadmin', group('sg_xx_hr_full', undefined, { ...SETTINGS, projects: ['co', 'wh'] })), 'FA_GROUP_NEEDS_REVIEW');

  // Managed OUs: the OU list, else the group search base. The fallback OU for new groups does not limit.
  const ou = 'OU=Groups,OU=CO,OU=Accounts,DC=corp,DC=kg';
  const withOus = { ...SETTINGS, groupOus: [ou], newGroupOu: 'OU=Other,DC=corp,DC=kg' };
  assert.equal(groupRefusal('sysadmin', group('sg_co_hr_full', undefined, withOus)), null);
  const elsewhere = group('sg_co_hr_full', undefined, withOus, 'CN=sg_co_hr_full,OU=IT,OU=Accounts,DC=corp,DC=kg');
  assert.equal(elsewhere.inManagedOu, false);
  assert.equal(groupRefusal('sysadmin', elsewhere), 'FA_GROUP_NOT_ALLOWED');
  assert.equal(groupRefusal('superadmin', elsewhere), null);
  const searched = { ...SETTINGS, groupsBase: 'OU=Accounts,DC=corp,DC=kg' };
  assert.equal(groupRefusal('sysadmin', group('sg_co_hr_full', undefined, searched, 'CN=sg_co_hr_full,OU=IT,OU=Accounts,DC=corp,DC=kg')), null);
  assert.equal(group('sg_co_hr_full', undefined, searched, 'CN=sg_co_hr_full,OU=X,DC=other,DC=kg').inManagedOu, false);
  // Nothing configured: no OU restriction (every project under the AD base).
  assert.equal(group('sg_co_hr_full', undefined, { ...SETTINGS, newGroupOu: ou }, 'CN=sg_co_hr_full,OU=Anywhere,DC=corp,DC=kg').inManagedOu, true);
});

// ── #7 undo after a later change ─────────────────────────────────────────────

test('#7 undo is refused without confirmation when a later change touched the same person and group', async () => {
  assert.equal(supersededRefusal([], false), null);
  assert.equal(supersededRefusal([12], false), 'FA_UNDO_SUPERSEDED');
  assert.equal(supersededRefusal([12], true), null);
  let seen;
  const run = async (sql, params) => {
    seen = { sql, params };
    return { rows: [{ id: '12' }, { id: '15' }] };
  };
  const later = await laterChanges({ id: 7, group_dn: 'CN=Full,OU=G', to_group_dn: 'CN=Read,OU=G', member_dn: 'CN=X,OU=U' }, run);
  assert.deepEqual(later, [12, 15]);
  assert.deepEqual(seen.params, [7, 'CN=X,OU=U', ['cn=full,ou=g', 'cn=read,ou=g']]);
  assert.match(seen.sql, /id > \$1/);
  assert.match(seen.sql, /ok = TRUE AND outcome = 'changed'/);
  assert.match(seen.sql, /kind = 'membership'/);
  assert.deepEqual(await laterChanges({ id: 7, group_dn: 'CN=G', member_dn: null }, run), []);
});

// ── #8 password attempts ─────────────────────────────────────────────────────

test('#8 at most 3 password checks per 15 minutes', () => {
  assert.equal(PASSWORD_ATTEMPTS.max, 3);
  assert.equal(PASSWORD_ATTEMPTS.windowMs, 15 * 60 * 1000);
});

// ── #9 journal scope ─────────────────────────────────────────────────────────

const likeRe = (pattern) => new RegExp(`^${pattern.replace(/\\(.)|([%_])|([^\\%_]+)/g, (m, esc, wild, text) => (esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : wild === '%' ? '.*' : wild === '_' ? '.' : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))}$`, 'i');

test('#9 system administrators see journal rows of visible groups only', () => {
  assert.equal(globToLike('sg_*_root_*'), 'sg\\_%\\_root\\_%');
  const scope = journalScope('sysadmin', SETTINGS);
  assert.deepEqual(scope, { kinds: ['membership'], groupPrefix: 'sg_', hiddenGroups: ['sg_*_root_*'] });
  const { sql, params } = journalFilter({ result: 'ok' }, scope);
  assert.match(sql, /j\.kind = ANY\(\$1\)/);
  assert.match(sql, /j\.group_name ILIKE \$2 AND \(j\.to_group_name IS NULL OR j\.to_group_name ILIKE \$2\)/);
  assert.match(sql, /NOT \(j\.group_name ILIKE ANY\(\$3\)\)/);
  assert.match(sql, /j\.ok = TRUE/);
  const prefix = likeRe(params[1]);
  const hidden = params[2].map(likeRe);
  const shown = (name) => prefix.test(name) && !hidden.some((re) => re.test(name));
  assert.equal(shown('sg_co_hr_full'), true);
  assert.equal(shown('nextcloud_users'), false);
  assert.equal(shown('sg_co_root_full'), false);
  assert.equal(shown('sgXco_hr_full'), false, '_ in the prefix is literal');
  // Superadministrators: everything; a plain list of kinds still works.
  assert.equal(journalFilter({}, journalScope('superadmin', SETTINGS)).sql, '');
  assert.deepEqual(journalFilter({}, ['membership']).params, [['membership']]);
});

// ── #10 journal failures ─────────────────────────────────────────────────────

test('#10 a journal failure after a successful AD change is not reported as an AD failure', async () => {
  const actor = { userId: 1, adAccount: 'admin' };
  const group = { dn: 'CN=Full', name: 'sg_co_hr_full' };
  const member = { dn: 'CN=U', name: 'Ivan', login: 'ivan' };
  const writes = [];
  const broken = async (who, entry) => {
    writes.push(entry);
    throw new Error('database down');
  };
  const client = mockClient();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const added = await applyMembership(client, actor, { action: 'member_add', group, member }, broken);
    assert.deepEqual([added.ok, added.outcome, added.journalId, added.journalFailed], [true, 'changed', null, true]);
    assert.equal(writes.length, 1, 'no second "failed" row');
    assert.equal(writes[0].ok, true);
    assert.equal(client.calls.filter((call) => call[0] === 'modify').length, 1);

    // An AD refusal whose journal row also fails: still a result, never a throw (the batch goes on).
    const refusing = mockClient({ modify: () => Promise.reject(ldapError(50)) });
    const denied = await applyMembership(refusing, actor, { action: 'member_add', group, member }, broken);
    assert.deepEqual([denied.ok, denied.code, denied.journalId], [false, 'FA_AD_DENIED', null]);
  } finally {
    console.warn = warn;
  }
});

// ── #11 create pair ──────────────────────────────────────────────────────────

test('#11 new group SIDs are read with the given connection; duplicates compare case-insensitively', async () => {
  const sid = Buffer.from('010500000000000515000000a1a2a3a4b1b2b3b4c1c2c3c4a10f0000', 'hex');
  const client = mockClient({
    search: (base) => {
      if (base === 'CN=sg_co_legal_full,OU=New') return { searchEntries: [{ dn: base, objectSid: sid }] };
      if (base === 'CN=gone,OU=New') return Promise.reject(ldapError(32));
      return { searchEntries: [] };
    },
  });
  const sids = await readSids(client, ['CN=sg_co_legal_full,OU=New', 'CN=sg_co_legal_read,OU=New', 'CN=gone,OU=New']);
  assert.match(sids[0], /^S-1-5-21-\d+-\d+-\d+-4001$/);
  assert.deepEqual(sids.slice(1), [null, null]);
  assert.deepEqual(client.calls[0][2].explicitBufferAttributes, ['objectSid']);

  const names = newGroupNames('legal', { ...SETTINGS, nameTemplate: 'SG_{org}_{name}_{type}' });
  assert.equal(names.full, 'SG_co_legal_full');
  assert.equal(nameTaken(names, [{ name: 'sg_co_legal_full' }]), true);
  assert.equal(nameTaken(names, [{ name: 'SG_CO_LEGAL_READ' }]), true);
  assert.equal(nameTaken(names, [{ name: 'sg_co_hr_full' }]), false);
});

// ── #12 group cache ──────────────────────────────────────────────────────────

test('#12 a read that started before a change does not refill the cache', async () => {
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const options = { base: 'OU=G,DC=t12', prefix: 'sg_', otherPatterns: [] };
  const cfg = { host: 'cache-test', baseDn: 'DC=t12' };
  setClientFactory(() =>
    mockClient({
      search: async () => {
        reads += 1;
        if (reads === 1) await gate;
        return { searchEntries: [{ dn: `CN=sg_co_hr_full,OU=G`, cn: 'sg_co_hr_full', description: `read ${reads}` }] };
      },
    })
  );
  try {
    const slow = cachedGroups(cfg, options);
    await new Promise((resolve) => setImmediate(resolve));
    invalidateGroups(); // a change happened while the read was running
    release();
    assert.equal((await slow)[0].description, 'read 1');
    const next = await cachedGroups(cfg, options);
    assert.equal(reads, 2, 'the stale read was not cached');
    assert.equal(next[0].description, 'read 2');
    await cachedGroups(cfg, options);
    assert.equal(reads, 2, 'a read without a change in between is cached');
  } finally {
    setClientFactory(null);
    invalidateGroups();
  }
});

test('a rejected password is not parked in a "sign in as" session', async () => {
  const calls = [];
  const run = async (sql, params) => calls.push([sql.replace(/\s+/g, ' ').trim(), params]);
  const credential = { row: { id: 42 } };
  assert.equal(await parkCredential(credential, 'AUTH_FAILED', { impersonating: true, run }), false);
  assert.deepEqual(calls, []);
  assert.equal(await parkCredential(credential, 'ACCOUNT_LOCKED', { run }), true);
  assert.deepEqual(calls, [['UPDATE drive_credentials SET status = $2, updated_at = NOW() WHERE id = $1', [42, 'ACCOUNT_LOCKED']]]);
  assert.equal(await parkCredential({ row: null }, 'AUTH_FAILED', { run }), false);
  assert.equal(calls.length, 1);
  assert.equal(isImpersonation({ auth: { imp: 7 } }), true);
  assert.equal(isImpersonation({ impersonator: { id: 7 } }), true);
  assert.equal(isImpersonation({ auth: {} }), false);
  assert.equal(isImpersonation(undefined), false);
});
