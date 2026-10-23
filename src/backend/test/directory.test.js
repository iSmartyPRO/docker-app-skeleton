import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonDn, childDn, escapeRdnValue, isUnder, parseDn, pathBetween } from '../modules/directory/dn.js';
import {
  cleanChanges,
  cleanFilter,
  compileFilter,
  fileTime,
  freeLogin,
  loginCandidates,
  loginFromTemplate,
  loginValid,
  matchesFilter,
  passwordIssues,
  placeOf,
  scopeOf,
  scopeRefusal,
  secureChannel,
  shapeObject,
  toFileTime,
  transliterate,
  upnSuffixes,
  encodePassword,
  ouForUnit,
} from '../modules/directory/logic.js';
import { ldapProvider, mapLdapError, moduleError, pool } from '../modules/directory/ldap.js';
import { cnFor } from '../modules/directory/service.js';
import { passwordIssues as browserPasswordIssues } from '../../frontend/src/modules/directory/lib.js';
import { demoObjects } from '../modules/directory/demo.js';
import { DEMO_EXCLUDED, DEMO_ROOT } from '../modules/directory/demoDirectory.js';
import { setClientFactory, verifyBind } from '../modules/drive/access/directory.js';
import driveModule from '../modules/drive/index.js';
import { registerModule } from '../platform/registry.js';
import { DIRECTORY_DEFAULTS, sanitizeDirectory } from '../modules/catalog.js';
import { MODULE_MANIFEST } from '../modules/manifest.js';
import { planModuleChanges, moduleStatus } from '../modules/dependencies.js';
import { classify } from '../api/scopes.js';
import { fakeDirectory } from '../test-fixtures/ldap-fake.mjs';

// The directory reaches the File server's AD connection through the core registry (Drive is an optional link).
registerModule(driveModule);

const ROOT = 'OU=Accounts,DC=example,DC=local';
const SETTINGS = { ...DIRECTORY_DEFAULTS, rootDn: ROOT, excluded: [`OU=Service,${ROOT}`, 'Admins*'], hiddenAccounts: ['svc_*'] };

// ── DNs ──────────────────────────────────────────────────────────────────────

test('DNs parse with escapes; non-names are refused', () => {
  const rdns = parseDn('CN=Ivanov\\, Ivan,OU=Users,DC=example,DC=local');
  assert.deepEqual(rdns.map((rdn) => [rdn.type, rdn.value]), [['CN', 'Ivanov, Ivan'], ['OU', 'Users'], ['DC', 'example'], ['DC', 'local']]);
  assert.equal(parseDn('CN=caf\\c3\\a9,DC=x')[0].value, 'café', 'hex escapes are UTF-8');
  for (const bad of ['<GUID=0123456789abcdef>', '<SID=S-1-5-21-1>', 'CN=a+UID=b,DC=x', 'CN=#04024869,DC=x', 'CN=a,,DC=x', 'just text', 'CN=a\\', '', 'CN=a;DC=x', 'CN=a\u0000,DC=x']) {
    assert.equal(parseDn(bad), null, bad);
  }
  assert.equal(canonDn('cn=A B , ou=USERS,dc=Example,DC=local'), canonDn('CN=a b,OU=Users,DC=example,DC=local'), 'case and outer spaces do not matter');
  // Inner spaces are part of the name: "Corp  HQ" (two spaces) is another OU than "Corp HQ".
  assert.notEqual(canonDn('OU=Corp  HQ,DC=example,DC=local'), canonDn('OU=Corp HQ,DC=example,DC=local'));
  assert.equal(isUnder('CN=x,OU=Corp  HQ,DC=example,DC=local', 'OU=Corp HQ,DC=example,DC=local'), false);
  assert.equal(canonDn('CN=a\\2Cb,DC=x'), canonDn('CN=a\\,b,DC=x'), 'hex and plain escapes compare equal');
});

test('inside a base is decided RDN by RDN: an escaped comma never matches', () => {
  assert.equal(isUnder(`CN=x,OU=Users,${ROOT}`, ROOT), true);
  assert.equal(isUnder(`cn=x,ou=users,ou=accounts,dc=EXAMPLE,dc=local`, ROOT), true);
  // An object named "x,OU=Accounts" directly under the domain: a string suffix test would say "inside".
  assert.equal(isUnder('CN=x\\,OU=Accounts,DC=example,DC=local', ROOT), false);
  assert.equal(isUnder('OU=Accounts2,DC=example,DC=local', ROOT), false);
  assert.equal(isUnder('OU=Accounts,DC=example,DC=local,DC=evil', ROOT), false);
  assert.deepEqual(pathBetween(`CN=a,OU=Users,OU=North,${ROOT}`, ROOT).map((rdn) => rdn.value), ['North', 'Users']);
});

test('RDN values are escaped per RFC 4514', () => {
  assert.equal(escapeRdnValue('Smith, John'), 'Smith\\, John');
  assert.equal(escapeRdnValue('#1 a+b <c> "d";e=f\\g'), '\\#1 a\\+b \\<c\\> \\"d\\"\\;e\\=f\\\\g');
  assert.equal(escapeRdnValue(' lead and trail '), '\\ lead and trail\\ ');
  const dn = childDn('CN', 'Smith, John', `OU=Users,${ROOT}`);
  assert.equal(parseDn(dn)[0].value, 'Smith, John');
  assert.equal(isUnder(dn, `OU=Users,${ROOT}`), true);
});

// ── scope ────────────────────────────────────────────────────────────────────

test('scope: the root, its subtree, excluded OUs (DN and pattern), hidden accounts', () => {
  const scope = scopeOf(SETTINGS);
  assert.equal(placeOf(ROOT, scope), 'root');
  assert.equal(placeOf(`CN=a,OU=Users,OU=HQ,${ROOT}`, scope), 'inside');
  assert.equal(placeOf(`OU=HQ,${ROOT}`, scope), 'inside');
  assert.equal(placeOf('CN=Domain Admins,CN=Users,DC=example,DC=local', scope), 'outside');
  assert.equal(placeOf(`CN=svc,OU=Service,${ROOT}`, scope), 'excluded');
  assert.equal(placeOf(`OU=Service,${ROOT}`, scope), 'excluded');
  assert.equal(placeOf(`cn=svc,ou=SERVICE ,ou=accounts,dc=example,dc=local`, scope), 'excluded', 'case and spaces do not get around an exclusion');
  assert.equal(placeOf(`CN=adm,OU=Admins,OU=HQ,${ROOT}`, scope), 'excluded', 'a pattern matches an OU at any depth');
  assert.equal(placeOf(`OU=AdminsEast,${ROOT}`, scope), 'excluded');
  assert.equal(placeOf(`CN=Admins-like user,OU=Users,${ROOT}`, scope), 'inside', 'a pattern matches OUs, not the object name');
  assert.equal(placeOf('CN=x\\,OU=Accounts,DC=example,DC=local', scope), 'outside');
  assert.equal(placeOf('<GUID=00112233445566778899aabbccddeeff>', scope), 'invalid');
  assert.equal(scopeRefusal(`CN=svc,OU=Service,${ROOT}`, scope).code, 'AD_EXCLUDED');
  assert.equal(scopeRefusal('CN=x,DC=example,DC=local', scope).code, 'AD_OUTSIDE_ROOT');
  assert.equal(scopeRefusal(ROOT, scope).code, 'AD_ROOT');
  assert.equal(scopeRefusal(ROOT, scope, { allowRoot: true }), null);
  assert.equal(scopeRefusal('<SID=S-1-5-32-544>', scope).code, 'AD_BAD_DN');
  // No root: nothing is in scope.
  assert.equal(placeOf(`CN=a,${ROOT}`, scopeOf({ ...SETTINGS, rootDn: '' })), 'outside');
});

test('settings are sanitised: DNs, patterns, attributes, template, numbers', () => {
  const next = sanitizeDirectory(DIRECTORY_DEFAULTS, {
    rootDn: '  OU=Accounts,DC=example,DC=local ',
    excluded: ['OU=Service,OU=Accounts,DC=example,DC=local', 'Admins*', '', 'Admins*'],
    editableAttributes: ['title', 'unicodePwd', 'userAccountControl', 'mail'],
    loginTemplate: '{f}.{last}',
    upnSuffixes: ['@Example.com', 'not a domain'],
    passwordMinLength: 3,
    unitOus: [{ unitId: 4, ou: 'OU=North,OU=Accounts,DC=example,DC=local' }, { unitId: 'x', ou: 'OU=x' }],
    startTls: true,
    bogus: 1,
  });
  assert.equal(next.rootDn, 'OU=Accounts,DC=example,DC=local');
  assert.deepEqual(next.excluded, ['OU=Service,OU=Accounts,DC=example,DC=local', 'Admins*']);
  assert.deepEqual(next.editableAttributes, ['title', 'mail'], 'passwords and flags are never «attributes»');
  assert.deepEqual(next.upnSuffixes, ['example.com']);
  assert.equal(next.passwordMinLength, 6);
  assert.deepEqual(next.unitOus, [{ unitId: 4, ou: 'OU=North,OU=Accounts,DC=example,DC=local' }]);
  assert.equal(next.startTls, true);
  assert.equal('bogus' in next, false);
  assert.equal(sanitizeDirectory(next, { loginTemplate: 'nothing' }).loginTemplate, '{f}.{last}', 'a template without a name token is refused');
  assert.equal(sanitizeDirectory(next, { rootDn: '<GUID=abc>' }).rootDn, '');
});

// ── filters (RFC 4515) ──────────────────────────────────────────────────────

test('list filters escape every value and cover the account states', () => {
  const spec = cleanFilter({ q: '*)(objectClass=*', kinds: 'user', flags: 'disabled,inactive,pwdExpired,locked,neverLogged', inactiveDays: 30 });
  const text = compileFilter(spec, { now: new Date('2026-10-16T00:00:00Z'), maxPwdAgeDays: 90 }).toString();
  assert.ok(text.includes('\\2a\\29\\28objectClass=\\2a'), text);
  assert.ok(!text.includes('*)(objectClass=*'), 'no injection');
  assert.ok(text.includes('(userAccountControl:1.2.840.113556.1.4.803:=2)'));
  assert.ok(text.includes('(lockoutTime>=1)'));
  assert.ok(text.includes('(!(lastLogonTimestamp=*))'));
  assert.ok(text.includes('(pwdLastSet=0)'));
  assert.ok(text.includes('(!(userAccountControl:1.2.840.113556.1.4.803:=65536))'));
  const nul = compileFilter(cleanFilter({ q: 'a\\b\u0000' })).toString();
  assert.ok(nul.includes('a\\5cb\\00'), nul);
  assert.deepEqual(cleanFilter({ kinds: 'user,printer', flags: 'locked,root' }).kinds, ['user']);
  assert.deepEqual(cleanFilter({ flags: 'locked,root' }).flags, ['locked']);
});

test('statuses from AD values: disabled, locked, password expired, must change, never signed in', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  assert.equal(fileTime('0'), null);
  assert.equal(fileTime('9223372036854775807'), null);
  const date = new Date('2026-01-02T03:04:05Z');
  assert.equal(fileTime(toFileTime(date)).toISOString(), date.toISOString());
  const base = { dn: `CN=a,OU=Users,${ROOT}`, objectClass: ['top', 'person', 'user'], sAMAccountName: 'a' };
  const ok = shapeObject({ ...base, userAccountControl: '512', pwdLastSet: toFileTime(new Date('2026-10-01')), lastLogonTimestamp: toFileTime(new Date('2026-10-15')) }, { now, maxPwdAgeDays: 90 });
  assert.deepEqual([ok.enabled, ok.locked, ok.pwdExpired, ok.mustChange], [true, false, false, false]);
  assert.ok(ok.pwdExpires.startsWith('2026-12-30'));
  const bad = shapeObject({ ...base, userAccountControl: '514', lockoutTime: toFileTime(now), pwdLastSet: toFileTime(new Date('2026-05-01')) }, { now, maxPwdAgeDays: 90 });
  assert.deepEqual([bad.enabled, bad.locked, bad.pwdExpired, bad.lastLogon], [false, true, true, null]);
  const must = shapeObject({ ...base, userAccountControl: '512', pwdLastSet: '0' }, { now });
  assert.deepEqual([must.mustChange, must.pwdExpired], [true, true]);
  const never = shapeObject({ ...base, userAccountControl: String(512 | 0x10000), pwdLastSet: toFileTime(new Date('2020-01-01')) }, { now, maxPwdAgeDays: 90 });
  assert.equal(never.pwdExpired, false);
  const computed = shapeObject({ ...base, userAccountControl: '512', 'msDS-User-Account-Control-Computed': String(0x10 | 0x800000) }, { now });
  assert.deepEqual([computed.locked, computed.pwdExpired], [true, true]);
  // The JS evaluation agrees with the LDAP filter (demo directory).
  const spec = cleanFilter({ flags: 'disabled,locked', kinds: 'user' });
  assert.equal(matchesFilter(bad, spec, { now }), true);
  assert.equal(matchesFilter(ok, spec, { now }), false);
  assert.equal(matchesFilter(ok, cleanFilter({ flags: 'inactive', inactiveDays: 30 }), { now }), false);
  assert.equal(matchesFilter(bad, cleanFilter({ flags: 'neverLogged' }), { now }), true);
});

// ── logins ──────────────────────────────────────────────────────────────────

test('sAMAccountName from the template: transliteration, tokens, length, collisions', () => {
  assert.equal(transliterate('Щукина Ёлка Әсел Ұлан Ңур'), 'shchukina elka asel ulan nur');
  assert.equal(loginFromTemplate('{f}.{last}', { first: 'Иван', last: 'Петров' }), 'i.petrov');
  assert.equal(loginFromTemplate('{f}{last}', { first: 'Айгуль', last: 'Сабирова' }), 'asabirova');
  assert.equal(loginFromTemplate('{last}.{first}', { first: 'Anne-Marie', last: "O'Neil" }), 'oneil.annemarie');
  assert.equal(loginFromTemplate('{f}{m}{last}', { first: 'Иван', middle: 'Сергеевич', last: 'Константинопольский' }).length, 20);
  assert.equal(loginFromTemplate('{f}.{last}', { first: '', last: '' }), '');
  assert.equal(loginFromTemplate('{f}.{last}', { first: 'Жанна', last: '' }), 'z', 'a first letter is one Latin letter');
  assert.equal(loginValid('i.petrov'), true);
  for (const bad of ['', 'a', 'i petrov', 'ivan.', '.ivan', 'a'.repeat(21), 'иван', 'x*y', 'a\\b']) assert.equal(loginValid(bad), false, bad);
  assert.deepEqual(loginCandidates('i.petrov').slice(0, 3), ['i.petrov', 'i.petrov2', 'i.petrov3']);
  const long = 'k.konstantinopolskiy';
  assert.ok(loginCandidates(long).every((login) => login.length <= 20));
  assert.equal(loginCandidates(long)[1], 'k.konstantinopolski2');
  assert.equal(freeLogin('i.petrov', new Set(['i.petrov', 'i.petrov2'])), 'i.petrov3');
});

test('password hints, the unicodePwd encoding and the secure channel', () => {
  assert.deepEqual(passwordIssues('short', { minLength: 12 }), ['short', 'complexity']);
  assert.deepEqual(passwordIssues('Correct-Horse-42!', { minLength: 12 }), []);
  assert.ok(passwordIssues('i.petrov-Secret-1', { minLength: 8 }, { login: 'i.petrov' }).includes('containsLogin'));
  assert.ok(passwordIssues('Petrov#2026secret', { minLength: 8 }, { name: 'Ivan Petrov' }).includes('containsName'));
  assert.deepEqual(passwordIssues('alllowercase', { minLength: 8, complexity: false }), []);
  assert.deepEqual([...encodePassword('Ab1!')], [...Buffer.from('"Ab1!"', 'utf16le')]);
  assert.equal(secureChannel({ useTls: true }, {}), 'ldaps');
  assert.equal(secureChannel({ useTls: false }, { startTls: true }), 'starttls');
  assert.equal(secureChannel({ useTls: false }, { startTls: false }), null);
});

test('attribute changes: only allowed, cleaned, validated', () => {
  const changes = cleanChanges({ title: '  Engineer\n', unicodePwd: 'x', mail: '', department: 'IT' }, ['title', 'mail']);
  assert.deepEqual(changes, [{ type: 'title', values: ['Engineer'] }, { type: 'mail', values: [] }]);
  assert.throws(() => cleanChanges({ mail: 'not mail' }, ['mail']), { code: 'AD_BAD_MAIL' });
  assert.throws(() => cleanChanges({ manager: '<GUID=1>' }, ['manager']), { code: 'AD_BAD_DN' });
  assert.throws(() => cleanChanges({ title: 'x'.repeat(200) }, ['title']), { code: 'AD_VALUE_TOO_LONG' });
  assert.deepEqual(upnSuffixes({}, 'OU=Accounts,DC=example,DC=local'), ['example.local']);
  assert.deepEqual(upnSuffixes({ upnSuffixes: ['@Corp.example.com'] }, ''), ['corp.example.com']);
  const parents = { 5: 4, 4: 1 };
  assert.equal(ouForUnit({ unitOus: [{ unitId: 4, ou: 'OU=North' }], defaultUserOu: 'OU=Def' }, 5, (id) => parents[id] || null), 'OU=North');
  assert.equal(ouForUnit({ unitOus: [], defaultUserOu: 'OU=Def' }, 5, () => null), 'OU=Def');
});

// ── errors ──────────────────────────────────────────────────────────────────

test('AD errors become clear codes', () => {
  const err = (code, message) => Object.assign(new Error(message || 'x'), { code });
  assert.equal(mapLdapError(err(19, '0000052D: Constraint violation - check_password_restrictions')).code, 'AD_PASSWORD_POLICY');
  assert.equal(mapLdapError(err(53, '0000001F: SvcErr: DSID-031A12D2, problem 5003 (WILL_NOT_PERFORM), data 0')).code, 'AD_SECURE_CHANNEL');
  assert.equal(mapLdapError(err(13)).code, 'AD_SECURE_CHANNEL');
  assert.equal(mapLdapError(err(50)).code, 'AD_DENIED');
  assert.equal(mapLdapError(err(68)).code, 'AD_EXISTS');
  assert.equal(mapLdapError(err(32)).code, 'AD_NOT_FOUND');
  assert.equal(mapLdapError(err(64)).code, 'AD_INVALID_NAME');
  assert.equal(mapLdapError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })).code, 'AD_UNAVAILABLE');
});

// ── the LDAP provider against a fake directory ──────────────────────────────

const SERVICE = 'CN=svc-portal,OU=Service,OU=Accounts,DC=example,DC=local';
const ADMIN = `CN=Igor Peterson,OU=Users,OU=HQ,${ROOT}`;
const USER = `CN=Anna Smith,OU=Users,OU=HQ,${ROOT}`;

function fixture({ useTls = false } = {}) {
  const person = (dn, login, extra = {}) => ({ dn, attrs: { objectClass: ['top', 'person', 'user'], objectCategory: 'person', sAMAccountName: login, cn: parseDn(dn)[0].value, userAccountControl: '512', ...extra } });
  return fakeDirectory({
    serviceDn: SERVICE,
    useTls,
    accounts: { [canonDn(SERVICE)]: 'service-pw', [canonDn(ADMIN)]: 'admin-pw' },
    entries: [
      { dn: 'DC=example,DC=local', attrs: { objectClass: 'domain', maxPwdAge: '-77760000000000' } },
      { dn: ROOT, attrs: { objectClass: 'organizationalUnit', ou: 'Accounts' } },
      { dn: `OU=HQ,${ROOT}`, attrs: { objectClass: 'organizationalUnit', ou: 'HQ' } },
      { dn: `OU=Users,OU=HQ,${ROOT}`, attrs: { objectClass: 'organizationalUnit', ou: 'Users' } },
      { dn: `OU=Service,${ROOT}`, attrs: { objectClass: 'organizationalUnit', ou: 'Service' } },
      person(SERVICE, 'svc-portal'),
      person(ADMIN, 'i.peterson'),
      person(USER, 'a.smith', { lockoutTime: '133000000000000000' }),
      person(`CN=Tricky*)(cn=*,OU=Users,OU=HQ,${ROOT}`, 'tricky'),
    ],
  });
}

const CFG = { host: 'dc.example.local', baseDn: 'DC=example,DC=local', bindDn: SERVICE, bindPassword: 'service-pw', useTls: false };

test('reads bind with the service account; writes bind as the acting administrator, never the service account', async () => {
  const fake = fixture();
  setClientFactory(() => fake.client());
  try {
    const provider = ldapProvider(CFG, { ...SETTINGS });
    assert.equal(await provider.maxPwdAgeDays(), 90);
    const { objects } = await provider.list(`OU=HQ,${ROOT}`, compileFilter(cleanFilter({ kinds: 'user' })), 'sub');
    assert.deepEqual(objects.map((object) => object.login).sort(), ['a.smith', 'i.peterson', 'tricky']);
    assert.ok(fake.calls.filter((call) => call.op === 'search').every((call) => call.as === SERVICE), 'reads as the service account');
    // An injection attempt in the search text matches nothing but the literal name.
    const injected = await provider.list(ROOT, compileFilter(cleanFilter({ q: '*)(cn=*', kinds: 'user' })), 'sub');
    assert.deepEqual(injected.objects.map((object) => object.login), ['tricky']);

    fake.calls.length = 0;
    await provider.write({ dn: ADMIN, bindName: ADMIN, password: 'admin-pw', account: 'i.peterson' }, (writer) => writer.modify(USER, [{ operation: 'replace', type: 'lockoutTime', values: ['0'] }]));
    const modify = fake.calls.find((call) => call.op === 'modify');
    assert.equal(modify.as, ADMIN, 'the change ran as the administrator');
    assert.ok(!fake.calls.some((call) => call.op === 'bind' && call.args[0] === SERVICE), 'the service account never bound for a write');
    assert.equal(fake.get(USER).attrs.lockouttime, '0');

    // The service account itself is refused by the directory (it only reads).
    await assert.rejects(
      provider.write({ dn: SERVICE, bindName: SERVICE, password: 'service-pw' }, (writer) => writer.modify(USER, [{ operation: 'replace', type: 'title', values: ['x'] }])),
      { code: 'AD_DENIED' }
    );
    // A wrong saved password: the credential code of File server → Access (parked by the caller).
    await assert.rejects(provider.write({ dn: ADMIN, bindName: ADMIN, password: 'wrong' }, () => null), { code: 'FA_CREDENTIALS_FAILED' });
  } finally {
    setClientFactory(null);
  }
});

test('passwords travel only over a secure channel: plain LDAP is refused by AD, StartTLS works', async () => {
  const fake = fixture();
  setClientFactory(() => fake.client());
  try {
    const provider = ldapProvider(CFG, SETTINGS);
    const cred = { dn: ADMIN, bindName: ADMIN, password: 'admin-pw', account: 'i.peterson' };
    await assert.rejects(provider.write(cred, (writer) => writer.setPassword(USER, 'New-Password-2026')), { code: 'AD_SECURE_CHANNEL' });
    fake.calls.length = 0;
    await provider.write(cred, (writer) => writer.setPassword(USER, 'New-Password-2026'), { startTls: true });
    const ops = fake.calls.map((call) => call.op);
    assert.ok(ops.indexOf('startTLS') < ops.indexOf('bind'), 'StartTLS before the bind');
    assert.equal(fake.calls.find((call) => call.op === 'modify').secure, true);
    assert.ok(!JSON.stringify(fake.calls).includes('New-Password-2026'), 'the password is not in any recorded argument');
  } finally {
    setClientFactory(null);
  }
});

test('LDAPS integrations need no StartTLS', async () => {
  const fake = fixture({ useTls: true });
  setClientFactory(() => fake.client());
  try {
    const provider = ldapProvider({ ...CFG, useTls: true }, SETTINGS);
    await provider.write({ dn: ADMIN, bindName: ADMIN, password: 'admin-pw' }, (writer) => writer.setPassword(USER, 'New-Password-2026'), { startTls: true });
    assert.ok(!fake.calls.some((call) => call.op === 'startTLS'));
  } finally {
    setClientFactory(null);
  }
});

test('the tree is counted per child with bounded searches, never by reading the whole subtree', async () => {
  const fake = fixture();
  // More objects than the counting limit below the HQ OU, a sub-OU, an excluded child.
  for (let i = 0; i < 5; i += 1) fake.store.set(canonDn(`CN=u${i},OU=Users,OU=HQ,${ROOT}`), { dn: `CN=u${i},OU=Users,OU=HQ,${ROOT}`, attrs: { objectclass: ['top', 'person', 'user'], objectcategory: 'person', samaccountname: `u${i}`, cn: `u${i}` } });
  setClientFactory(() => fake.client());
  try {
    const provider = ldapProvider(CFG, SETTINGS);
    const scope = scopeOf(SETTINGS);
    fake.calls.length = 0;
    const summary = await provider.treeSummary(ROOT, { limit: 4, containerLimit: 3, keepChild: (child) => placeOf(child.dn, scope) === 'inside' });
    assert.deepEqual(summary.children.map((child) => child.name).sort(), ['HQ', 'Service']);
    assert.deepEqual(summary.details.map((child) => child.name), ['HQ'], 'the excluded child is never counted');
    const hq = summary.details[0];
    assert.equal(hq.objects.length, 4);
    assert.equal(hq.truncated, true, 'past the limit the count says so');
    assert.deepEqual(hq.containers.map((child) => child.name), ['Users']);
    const searches = fake.calls.filter((call) => call.op === 'search');
    assert.ok(!searches.some((call) => call.args[0] === ROOT && call.args[1] === 'sub'), 'the root subtree is never read');
    assert.ok(searches.filter((call) => call.args[1] === 'sub').every((call) => call.args[2] === 5), 'subtree counts are size-limited');
    assert.equal(fake.calls.filter((call) => call.op === 'bind').length, 1, 'one service bind for the whole answer');
    // The visibility filter runs before the list is cut.
    const { objects } = await provider.list(ROOT, compileFilter(cleanFilter({ kinds: 'user' })), 'sub', null, { keep: (object) => placeOf(object.dn, scope) === 'inside' });
    assert.ok(!objects.some((object) => object.login === 'svc-portal'));
  } finally {
    setClientFactory(null);
  }
});

test('pool runs at most N at once and keeps the order', async () => {
  let running = 0;
  let peak = 0;
  const out = await pool([5, 1, 3, 2, 4], 2, async (value) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, value));
    running -= 1;
    return value * 10;
  });
  assert.deepEqual(out, [50, 10, 30, 20, 40]);
  assert.equal(peak, 2);
});

test('saving the domain password checks it over StartTLS when the module uses StartTLS', async () => {
  const fake = fixture();
  setClientFactory(() => fake.client());
  try {
    assert.deepEqual(await verifyBind(CFG, ADMIN, 'admin-pw', { startTls: true }), { ok: true });
    const ops = fake.calls.map((call) => call.op);
    assert.ok(ops.includes('startTLS') && ops.indexOf('startTLS') < ops.indexOf('bind'), 'StartTLS before the bind');
    fake.calls.length = 0;
    await verifyBind({ ...CFG, useTls: true }, ADMIN, 'admin-pw', { startTls: true });
    assert.ok(!fake.calls.some((call) => call.op === 'startTLS'), 'LDAPS needs no StartTLS');
  } finally {
    setClientFactory(null);
  }
});

test('reach errors of File server → Access get this module\'s codes', () => {
  assert.equal(moduleError(Object.assign(new Error('x'), { statusCode: 503, code: 'FA_AD_UNAVAILABLE' })).code, 'AD_UNAVAILABLE');
  assert.equal(moduleError(Object.assign(new Error('x'), { statusCode: 404, code: 'FA_AD_NOT_FOUND' })).code, 'AD_NOT_FOUND');
  assert.equal(moduleError(Object.assign(new Error('x'), { statusCode: 403, code: 'FA_AD_DENIED' })).code, 'AD_DENIED');
  assert.equal(moduleError(Object.assign(new Error('x'), { statusCode: 409, code: 'FA_AD_EXISTS' })).code, 'AD_EXISTS');
  assert.equal(moduleError(Object.assign(new Error('x'), { statusCode: 403, code: 'FA_CREDENTIALS_FAILED' })).code, 'FA_CREDENTIALS_FAILED', 'credential codes are kept');
});

test('a new user\'s CN fits 64 characters; the twin form keeps the login', () => {
  const long = 'Anna-Maria Konstantinopolskaya-Vasilyeva-Rimskaya-Korsakova Junior II';
  assert.ok(long.length > 64);
  assert.equal(cnFor('Anna Smith'), 'Anna Smith');
  assert.equal(cnFor(long).length, 64);
  const twin = cnFor(long, 'a.konstantin');
  assert.ok(twin.length <= 64);
  assert.ok(twin.endsWith(' (a.konstantin)'), twin);
  assert.equal(cnFor('Anna Smith', 'a.smith3'), 'Anna Smith (a.smith3)');
});

test('the browser password checklist knows every rule the server checks', () => {
  const policy = { minLength: 8, complexity: true };
  const browserPolicy = { passwordMinLength: 8, passwordComplexity: true };
  const person = { login: 'a.smith', name: 'Anna Smith' };
  for (const password of ['Smith-2026!', 'Anna#2026x', 'a.smith-2026X', 'short', 'alllowercase', 'Fresh-Password-2026']) {
    assert.deepEqual(browserPasswordIssues(password, browserPolicy, person), passwordIssues(password, policy, person), password);
  }
  assert.ok(browserPasswordIssues('Smith-2026!', browserPolicy, person).includes('containsName'));
});

test('login availability is checked in the whole domain', async () => {
  const fake = fixture();
  setClientFactory(() => fake.client());
  try {
    const provider = ldapProvider(CFG, SETTINGS);
    const taken = await provider.takenLogins(loginCandidates('a.smith').slice(0, 3));
    assert.deepEqual([...taken.logins], ['a.smith']);
    assert.equal(freeLogin('a.smith', taken.logins), 'a.smith2');
    // svc-portal lives in an excluded OU but still takes its name in the domain.
    assert.ok((await provider.takenLogins(['svc-portal'])).logins.has('svc-portal'));
  } finally {
    setClientFactory(null);
  }
});

// ── platform ────────────────────────────────────────────────────────────────

test('the module may be switched on without AD (setup page, demo), but its status says what is missing', () => {
  const current = Object.fromEntries(Object.keys(MODULE_MANIFEST).map((id) => [id, false]));
  const plan = planModuleChanges(current, { directory: { enabled: true } }, { integrations: { activeDirectory: false } });
  assert.equal(plan.enabled.directory, true);
  const status = moduleStatus('directory', plan.enabled, { integrations: { activeDirectory: false } });
  assert.equal(status.status, 'needs');
  assert.equal(status.missing[0].integration, 'activeDirectory');
  assert.equal(moduleStatus('directory', plan.enabled, { integrations: { activeDirectory: true } }).status, 'on');
  // Other modules' integration requirements still block.
  const strict = { ...MODULE_MANIFEST, x: { ...MODULE_MANIFEST.directory, requires: [{ integration: 'google', reason: { en: 'x', ru: 'x' } }] } };
  assert.throws(() => planModuleChanges({ ...current, x: false }, { x: { enabled: true } }, { manifest: strict, integrations: {} }), { code: 'MODULE_REQUIRES' });
});

test('API tokens never reach the directory module', () => {
  assert.equal(classify('/app/directory/object').blocked, true);
  assert.equal(classify('/app/directory').blocked, true);
});

// ── demo directory ──────────────────────────────────────────────────────────

test('the demo directory is neutral, valid and covers every state', () => {
  const t = (text) => text.en;
  const objects = demoObjects(t);
  const scope = scopeOf({ rootDn: DEMO_ROOT, excluded: DEMO_EXCLUDED });
  for (const item of objects) assert.ok(parseDn(item.dn), item.dn);
  const users = objects.filter((item) => item.kind === 'user').map((item) => shapeObject({ dn: item.dn, ...item.attrs }, { maxPwdAgeDays: 90 }));
  const shown = users.filter((user) => placeOf(user.dn, scope) === 'inside');
  assert.ok(users.some((user) => placeOf(user.dn, scope) === 'excluded'), 'some accounts live in excluded OUs');
  assert.ok(shown.some((user) => user.locked));
  assert.ok(shown.some((user) => user.enabled === false));
  assert.ok(shown.some((user) => user.pwdExpired));
  assert.ok(shown.some((user) => !user.lastLogon));
  assert.ok(new Set(users.map((user) => user.login)).size === users.length, 'logins are unique');
  const text = JSON.stringify(demoObjects((value) => value.ru)) + JSON.stringify(objects);
  assert.ok(/example\.local/.test(text));
  assert.ok(!/@(?!example\.local)[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/\\\\/g, '')), 'only example.local addresses');
});
