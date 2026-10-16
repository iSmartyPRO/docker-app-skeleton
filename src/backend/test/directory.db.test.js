import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDirectory } from '../test-fixtures/ldap-fake.mjs';
import { canonDn, parseDn } from '../modules/directory/dn.js';

/*
 * The AD directory module end to end against a real database and an in-process fake
 * directory (test-fixtures/ldap-fake.mjs): scope, credentials, secure channel, login
 * collisions, the journal, the demo directory. Needs a test database (never production!):
 *
 *   DIRECTORY_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/directory.db.test.js
 *
 * Settings, the admin's AD link and saved domain password are put back afterwards.
 */

const enabled = process.env.DIRECTORY_DB_TEST === '1';
const skip = enabled ? false : 'set DIRECTORY_DB_TEST=1 and a test database to run';

const BASE = 'DC=example,DC=local';
const ROOT = `OU=Accounts,${BASE}`;
const SERVICE = `CN=svc-portal,OU=Service,${ROOT}`;
const ADMIN = `CN=Igor Peterson,OU=Users,OU=HQ,${ROOT}`;
const ANNA = `CN=Anna Smith,OU=Users,OU=HQ,${ROOT}`;
const DISABLED = `OU=Disabled,${ROOT}`;
const BOB = `CN=Bob Test,OU=Users,OU=HQ,${ROOT}`;
const ROOTADM = `CN=Root Admin,OU=Users,OU=HQ,${ROOT}`;
const VPN = `CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`;
const SG = `CN=sg_hq_buh_full,OU=Groups,OU=HQ,${ROOT}`;
const PROTECTED_GROUP = `CN=Helpdesk-Admins,OU=Groups,OU=HQ,${ROOT}`;

let db;
let svc;
let settingsSvc;
let directoryAccess;
let crypto;
let demo;
let fake;
let req;
let plainReq;
let saved = {};

function directory() {
  const ou = (dn) => ({ dn, attrs: { objectClass: ['top', 'organizationalUnit'], ou: parseDn(dn)[0].value } });
  const person = (dn, login, extra = {}) => ({
    dn,
    attrs: { objectClass: ['top', 'person', 'organizationalPerson', 'user'], objectCategory: 'person', sAMAccountName: login, userPrincipalName: `${login}@example.local`, cn: parseDn(dn)[0].value, displayName: parseDn(dn)[0].value, userAccountControl: '512', pwdLastSet: '133000000000000000', ...extra },
  });
  const group = (dn, members = []) => ({ dn, attrs: { objectClass: ['top', 'group'], objectCategory: 'group', cn: parseDn(dn)[0].value, sAMAccountName: parseDn(dn)[0].value, groupType: '-2147483646', member: members } });
  return fakeDirectory({
    serviceDn: SERVICE,
    accounts: { [canonDn(SERVICE)]: 'service-pw', [canonDn(ADMIN)]: 'admin-pw' },
    entries: [
      { dn: BASE, attrs: { objectClass: 'domain', maxPwdAge: '-77760000000000' } },
      ou(ROOT),
      ou(`OU=HQ,${ROOT}`),
      ou(`OU=Users,OU=HQ,${ROOT}`),
      ou(`OU=Groups,OU=HQ,${ROOT}`),
      ou(`OU=Service,${ROOT}`),
      ou(DISABLED),
      { dn: `CN=Users,${BASE}`, attrs: { objectClass: 'container', cn: 'Users' } },
      person(SERVICE, 'svc-portal'),
      person(ADMIN, 'i.peterson'),
      person(ANNA, 'a.smith', { lockoutTime: '133000000000000000', mail: 'a.smith@example.local' }),
      group(`CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`, [ANNA]),
      group(`CN=sg_hq_buh_full,OU=Groups,OU=HQ,${ROOT}`, [ANNA]),
      group(`CN=Domain Admins,CN=Users,${BASE}`, [ADMIN]),
      person(BOB, 'b.test', { manager: `CN=Boss Outside,CN=Users,${BASE}` }),
      person(ROOTADM, 'r.admin', { adminCount: '1' }),
      { ...group(PROTECTED_GROUP, []), attrs: { ...group(PROTECTED_GROUP, []).attrs, adminCount: '1' } },
      person(`CN=Boss Outside,CN=Users,${BASE}`, 'boss'),
    ],
  });
}

async function setJson(key, value) {
  await db.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
  settingsSvc.invalidateSettings();
}

async function setModule(settings, enabledFlag = true) {
  const raw = (await db.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0]?.value;
  const modules = raw ? JSON.parse(raw) : {};
  modules.directory = { enabled: enabledFlag, settings: { ...(modules.directory?.settings || {}), ...settings } };
  await setJson('modules', modules);
}

async function setIntegration(on) {
  const raw = (await db.query(`SELECT value FROM app_settings WHERE key = 'integrations'`)).rows[0]?.value;
  const integrations = raw ? JSON.parse(raw) : {};
  integrations.activeDirectory = on
    ? { ...(integrations.activeDirectory || {}), enabled: true, host: 'dc.example.local', port: 389, useTls: false, bindDn: SERVICE, bindPassword: 'service-pw', baseDn: BASE }
    : { ...(integrations.activeDirectory || {}), enabled: false };
  await setJson('integrations', integrations);
}

before(async () => {
  if (!enabled) return;
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  const modules = await import('../modules/index.js');
  await modules.ensureModuleSchemas();
  settingsSvc = await import('../services/settings.js');
  svc = await import('../modules/directory/service.js');
  directoryAccess = await import('../modules/drive/access/directory.js');
  crypto = await import('../services/crypto.js');
  demo = await import('../services/demo.js');
  const { requestAs } = await import('../api/events.js');
  const admin = (await db.query(`SELECT id FROM users WHERE username = 'admin'`)).rows[0];
  const plain = (await db.query(`SELECT id FROM users WHERE username = 'plainuser'`)).rows[0];
  assert.ok(admin && plain, 'the test database needs the accounts admin and plainuser');
  saved.settings = (await db.query(`SELECT key, value FROM app_settings WHERE key IN ('modules', 'integrations')`)).rows;
  saved.user = (await db.query(`SELECT id, auth_source, external_id, directory_guid FROM users WHERE id = $1`, [admin.id])).rows[0];
  saved.credential = (await db.query(`SELECT * FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [admin.id])).rows[0] || null;
  await db.query(`UPDATE users SET auth_source = 'ldap', external_id = $2, directory_guid = NULL WHERE id = $1`, [admin.id, ADMIN]);
  await db.query(`DELETE FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [admin.id]);
  await db.query(`INSERT INTO drive_credentials (user_id, server_id, username, secret, source, status, verified_at, updated_at) VALUES ($1, NULL, 'i.peterson', $2, 'self', 'ok', NOW(), NOW())`, [admin.id, crypto.seal('admin-pw')]);
  await setIntegration(true);
  await setModule({ rootDn: ROOT, excluded: [`OU=Service,${ROOT}`], hiddenAccounts: [], disabledOu: DISABLED, startTls: false, loginTemplate: '{f}.{last}', allowCreate: true });
  fake = directory();
  directoryAccess.setClientFactory(() => fake.client());
  req = { ...(await requestAs(admin.id)), ip: '127.0.0.1', get: () => 'test' };
  plainReq = { ...(await requestAs(plain.id)), ip: '127.0.0.1', get: () => 'test' };
  await db.query(`DELETE FROM ad_journal WHERE target_dn ILIKE '%DC=example,DC=local'`);
});

after(async () => {
  if (!enabled || !db) return;
  directoryAccess.setClientFactory(null);
  await demo.purgeModule('directory', req).catch(() => {});
  for (const row of saved.settings) await db.query(`UPDATE app_settings SET value = $2 WHERE key = $1`, [row.key, row.value]);
  settingsSvc.invalidateSettings();
  await db.query(`UPDATE users SET auth_source = $2, external_id = $3, directory_guid = $4 WHERE id = $1`, [saved.user.id, saved.user.auth_source, saved.user.external_id, saved.user.directory_guid]);
  await db.query(`DELETE FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [saved.user.id]);
  if (saved.credential) {
    const c = saved.credential;
    await db.query(`INSERT INTO drive_credentials (user_id, server_id, username, domain, secret, source, status, verified_at, updated_at) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`, [c.user_id, c.username, c.domain, c.secret, c.source, c.status, c.verified_at, c.updated_at]);
  }
  await db.query(`DELETE FROM ad_journal WHERE target_dn ILIKE '%DC=example,DC=local' AND demo = FALSE`);
  await db.closePool();
});

const writes = () => fake.calls.filter((call) => ['add', 'modify', 'modifyDN', 'del'].includes(call.op));

test('the tree stays within the root; excluded OUs are neither listed nor counted nor reachable', { skip }, async () => {
  const top = await svc.tree(req);
  assert.equal(top.node.root, true);
  assert.deepEqual(top.children.map((child) => child.name).sort(), ['Disabled', 'HQ']);
  const hq = top.children.find((child) => child.name === 'HQ');
  assert.deepEqual(hq.counts, { user: 4, group: 3, computer: 0 });
  assert.equal(top.node.total, 7, 'the service account in the excluded OU is not counted');
  assert.equal(hq.hasChildren, true);
  assert.equal(hq.truncated, false);
  assert.equal(top.children.find((child) => child.name === 'Disabled').hasChildren, false);
  await assert.rejects(svc.tree(req, `OU=Service,${ROOT}`), { code: 'AD_EXCLUDED' });
  await assert.rejects(svc.tree(req, BASE), { code: 'AD_OUTSIDE_ROOT' });
  await assert.rejects(svc.tree(req, `ou=service ,OU=ACCOUNTS,dc=example,dc=local`), { code: 'AD_EXCLUDED' });
  const found = await svc.listObjects(req, { q: 'svc' });
  assert.equal(found.total, 0, 'a search across the root never returns excluded objects');
  await assert.rejects(svc.objectCard(req, SERVICE), { code: 'AD_EXCLUDED' });
  await assert.rejects(svc.objectCard(req, `CN=x\\,OU=Accounts,${BASE}`), { code: 'AD_OUTSIDE_ROOT' });
  await assert.rejects(svc.objectCard(req, '<GUID=00112233445566778899aabbccddeeff>'), { code: 'AD_BAD_DN' });
});

test('the card: groups with their type, folder groups read-only, outside groups read-only, links', { skip }, async () => {
  const card = await svc.objectCard(req, ANNA);
  assert.equal(card.object.login, 'a.smith');
  assert.equal(card.object.locked, true);
  const vpn = card.groups.find((group) => group.name === 'VPN-Users');
  const sg = card.groups.find((group) => group.name === 'sg_hq_buh_full');
  assert.equal(vpn.editable, true);
  assert.deepEqual([sg.drive, sg.editable, sg.readOnly], [true, false, 'drive']);
  const admin = await svc.objectCard(req, ADMIN);
  const domainAdmins = admin.groups.find((group) => group.name === 'Domain Admins');
  assert.deepEqual([domainAdmins.editable, domainAdmins.readOnly], [false, 'outside']);
});

test('password reset is refused without a secure channel, before anything reaches AD', { skip }, async () => {
  fake.calls.length = 0;
  await assert.rejects(svc.resetPassword(req, { dn: ANNA, password: 'Fresh-Password-2026', mustChange: true }), { code: 'AD_SECURE_REQUIRED' });
  assert.equal(writes().length, 0);
  const overview = await svc.overview(req);
  assert.equal(overview.passwordsAvailable, false);
});

test('with StartTLS the reset runs as the administrator, is journalled without the password and unlocks', { skip }, async () => {
  await setModule({ startTls: true });
  fake.calls.length = 0;
  const result = await svc.resetPassword(req, { dn: ANNA, password: 'Fresh-Password-2026', mustChange: true, unlock: true });
  assert.equal(result.outcome, 'changed');
  const ops = fake.calls.map((call) => call.op);
  assert.ok(ops.includes('startTLS'));
  for (const call of writes()) {
    assert.equal(call.as, ADMIN, 'written as the acting administrator');
    assert.equal(call.secure, true);
  }
  assert.equal(fake.get(ANNA).attrs.pwdlastset, '0', 'must change at next logon');
  assert.equal(fake.get(ANNA).attrs.lockouttime, '0');
  const row = (await db.query(`SELECT * FROM ad_journal WHERE action = 'password_reset' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(row.ad_account, 'i.peterson');
  assert.equal(row.ok, true);
  assert.ok(!JSON.stringify(row).includes('Fresh-Password-2026'), 'the password is never journalled');
  await assert.rejects(svc.resetPassword(req, { dn: ANNA, password: 'short' }), { code: 'AD_PASSWORD_WEAK' });
  await setModule({ startTls: false });
});

test('a new user: the login template, collision suffix, scope of the OU, disabled without a password', { skip }, async () => {
  const suggestion = await svc.suggestLogin(req, { first: 'Anna', last: 'Smith' });
  assert.deepEqual([suggestion.base, suggestion.taken, suggestion.login], ['a.smith', true, 'a.smith2']);
  await assert.rejects(svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith', ou: `OU=Users,OU=HQ,${ROOT}` }), (err) => err.code === 'AD_LOGIN_TAKEN' && err.details.suggestion === 'a.smith2');
  await assert.rejects(svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith2', ou: `OU=Service,${ROOT}` }), { code: 'AD_EXCLUDED' });
  await assert.rejects(svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith2', ou: `CN=Users,${BASE}` }), { code: 'AD_OUTSIDE_ROOT' });
  await assert.rejects(svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith2', ou: `OU=Users,OU=HQ,${ROOT}`, password: 'Fresh-Password-2026' }), { code: 'AD_SECURE_REQUIRED' });
  await assert.rejects(svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith2', ou: `OU=Users,OU=HQ,${ROOT}`, groups: [`CN=sg_hq_buh_full,OU=Groups,OU=HQ,${ROOT}`] }), { code: 'AD_DRIVE_GROUP' });
  const created = await svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith, Jr.', login: 'a.smith2', ou: `OU=Users,OU=HQ,${ROOT}`, groups: [`CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`] });
  assert.deepEqual(created.warnings, ['created_disabled']);
  const entry = fake.get(created.dn);
  assert.ok(entry, created.dn);
  assert.equal(parseDn(created.dn)[0].value, 'Anna Smith, Jr.', 'the comma in the name is escaped in the DN');
  assert.equal(entry.attrs.useraccountcontrol, '514');
  assert.ok(fake.get(`CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`).attrs.member.includes(created.dn));
  // The same name again in that OU: the CN carries the login.
  const twin = await svc.createUserAccount(req, { givenName: 'Anna', sn: 'Smith', login: 'a.smith3', ou: `OU=Users,OU=HQ,${ROOT}` });
  assert.equal(parseDn(twin.dn)[0].value, 'Anna Smith (a.smith3)');
  const row = (await db.query(`SELECT * FROM ad_journal WHERE action = 'user_create' AND details->>'login' = 'a.smith2' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(row.details.login, 'a.smith2');
  assert.equal(row.ad_account, 'i.peterson');
});

test('moves stay in scope; bulk previews write nothing; folder groups are refused', { skip }, async () => {
  fake.calls.length = 0;
  const preview = await svc.bulk(req, { action: 'offboard', dns: [ANNA, SERVICE], dryRun: true });
  assert.equal(writes().length, 0);
  assert.deepEqual(preview.items.map((item) => item.refused || item.changes.join('+')), ['disable+move', 'AD_EXCLUDED']);
  await assert.rejects(svc.bulk(req, { action: 'move', dns: [ANNA], targetOu: `OU=Service,${ROOT}` }), { code: 'AD_EXCLUDED' });
  await assert.rejects(svc.bulk(req, { action: 'move', dns: [ANNA], targetOu: `CN=Users,${BASE}` }), { code: 'AD_OUTSIDE_ROOT' });
  const done = await svc.bulk(req, { action: 'offboard', dns: [ANNA] });
  assert.equal(done.changed, 1);
  const moved = `CN=Anna Smith,${DISABLED}`;
  assert.ok(fake.get(moved));
  assert.equal(Number(fake.get(moved).attrs.useraccountcontrol) & 2, 2);
  await assert.rejects(svc.membership(req, { groups: [`CN=sg_hq_buh_full,OU=Groups,OU=HQ,${ROOT}`], members: [moved], action: 'remove' }), { code: 'AD_DRIVE_GROUP' });
  const removed = await svc.membership(req, { groups: [`CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`], members: [moved], action: 'remove' });
  assert.equal(removed.changed, 1);
  const again = await svc.membership(req, { groups: [`CN=VPN-Users,OU=Groups,OU=HQ,${ROOT}`], members: [moved], action: 'remove' });
  assert.equal(again.unchanged, 1, 'removing twice is «unchanged», not an error');
});

test('rights: no ad.* permission → refused; «sign in as» only reads; a missing domain password is asked for', { skip }, async () => {
  await assert.rejects(svc.tree(plainReq), { code: 'FORBIDDEN' });
  await assert.rejects(svc.unlock({ ...req, auth: { imp: 1 } }, { dn: ADMIN }), { code: 'IMPERSONATION_LIMIT' });
  const adminId = req.user.id;
  const keep = (await db.query(`SELECT secret FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [adminId])).rows[0].secret;
  await db.query(`DELETE FROM drive_credentials WHERE user_id = $1 AND server_id IS NULL`, [adminId]);
  await assert.rejects(svc.updateAttributes(req, { dn: ADMIN, changes: { title: 'Admin' } }), { code: 'FA_CREDENTIALS_REQUIRED' });
  await db.query(`INSERT INTO drive_credentials (user_id, server_id, username, secret, source, status, verified_at, updated_at) VALUES ($1, NULL, 'i.peterson', $2, 'self', 'ok', NOW(), NOW())`, [adminId, keep]);
  const changed = await svc.updateAttributes(req, { dn: ADMIN, changes: { title: 'Admin', unicodePwd: 'x' } });
  assert.equal(changed.outcome, 'changed');
  assert.equal(fake.get(ADMIN).attrs.title, 'Admin');
  assert.equal(fake.get(ADMIN).attrs.unicodepwd, undefined, 'only allowed attributes are written');
});

const withPermissions = (base, permissions) => ({ ...base, access: { ...base.access, permissions } });
const serviceBinds = () => fake.calls.filter((call) => call.op === 'bind' && canonDn(call.args[0]) === canonDn(SERVICE)).length;

test('protected accounts and groups need ad.admin everywhere: wizard groups, membership members', { skip }, async () => {
  const manageReq = withPermissions(req, ['ad.manage']);
  fake.calls.length = 0;
  await assert.rejects(svc.createUserAccount(manageReq, { givenName: 'Pat', sn: 'Lee', login: 'p.lee', ou: `OU=Users,OU=HQ,${ROOT}`, groups: [PROTECTED_GROUP] }), { code: 'AD_PROTECTED' });
  await assert.rejects(svc.membership(manageReq, { groups: [VPN], members: [ROOTADM], action: 'add' }), { code: 'AD_PROTECTED' });
  await assert.rejects(svc.membership(manageReq, { groups: [VPN], members: [ROOTADM], action: 'remove' }), { code: 'AD_PROTECTED' });
  assert.equal(writes().length, 0, 'nothing reached AD');
  // An AD directory administrator may.
  const added = await svc.membership(req, { groups: [VPN], members: [ROOTADM], action: 'add' });
  assert.equal(added.changed, 1);
  await svc.membership(req, { groups: [VPN], members: [ROOTADM], action: 'remove' });
});

test('folder access groups are written only by File server → Access: no edit, move or membership of their own', { skip }, async () => {
  fake.calls.length = 0;
  await assert.rejects(svc.updateAttributes(req, { dn: SG, changes: { description: 'x' } }), { code: 'AD_DRIVE_GROUP' });
  const preview = await svc.bulk(req, { action: 'move', dns: [SG], targetOu: DISABLED, dryRun: true });
  assert.equal(preview.items[0].refused, 'AD_DRIVE_GROUP');
  const moved = await svc.bulk(req, { action: 'move', dns: [SG], targetOu: DISABLED });
  assert.equal(moved.refused, 1);
  await assert.rejects(svc.membership(req, { groups: [VPN], members: [SG], action: 'add' }), { code: 'AD_DRIVE_GROUP' });
  assert.equal(writes().length, 0);
  assert.ok(fake.get(SG), 'the group stayed where File server → Access looks for it');
  const card = await svc.objectCard(req, SG);
  assert.deepEqual([card.actions.edit, card.actions.move, card.actions.groups], ['drive', 'drive', 'drive']);
});

test('bulk and membership read their targets in one batch, not one bind per DN', { skip }, async () => {
  fake.calls.length = 0;
  const preview = await svc.bulk(req, { action: 'disable', dns: [BOB, ROOTADM, ADMIN, `CN=Nobody,OU=Users,OU=HQ,${ROOT}`], dryRun: true });
  assert.deepEqual(preview.items.map((item) => item.refused || item.changes.join('+')), ['disable', 'disable', 'disable', 'AD_NOT_FOUND']);
  assert.equal(serviceBinds(), 1, 'one service bind for four targets');
  fake.calls.length = 0;
  const result = await svc.membership(req, { groups: [VPN], members: [BOB, ADMIN], action: 'add' });
  assert.equal(result.changed, 2);
  assert.equal(serviceBinds(), 3, 'groups, members and the administrator\'s own account: three reads in all');
  await svc.membership(req, { groups: [VPN], members: [BOB, ADMIN], action: 'remove' });
});

test('with StartTLS every bind as the administrator is protected (edits and the saved-password check)', { skip }, async () => {
  await setModule({ startTls: true });
  try {
    fake.calls.length = 0;
    await svc.updateAttributes(req, { dn: BOB, changes: { title: 'Tester' } });
    assert.equal(fake.get(BOB).attrs.title, 'Tester');
    await svc.saveCredential(req, 'admin-pw');
    const adminBinds = fake.calls.filter((call) => call.op === 'bind' && canonDn(call.args[0]) === canonDn(ADMIN));
    assert.equal(adminBinds.length, 2, 'the edit and the password check');
    assert.ok(adminBinds.every((call) => call.secure), 'never in clear');
    assert.ok(writes().every((call) => call.secure));
  } finally {
    await setModule({ startTls: false });
  }
  fake.calls.length = 0;
  await svc.updateAttributes(req, { dn: BOB, changes: { title: 'Tester 2' } });
  assert.ok(!fake.calls.some((call) => call.op === 'startTLS'), 'without StartTLS configured the connection is not upgraded');
});

test('a password reset whose flags fail is reported and journalled as partial, not as failed', { skip }, async () => {
  await setModule({ startTls: true });
  directoryAccess.setClientFactory(() => {
    const client = fake.client();
    const modify = client.modify;
    client.modify = async (dn, changes) => {
      const list = Array.isArray(changes) ? changes : [changes];
      if (list.some((change) => change.modification.type.toLowerCase() === 'pwdlastset')) throw Object.assign(new Error('00002098: SecErr: DSID-03150F94, problem 4003 (INSUFF_ACCESS_RIGHTS), data 0'), { code: 50 });
      return modify(dn, changes);
    };
    return client;
  });
  try {
    const result = await svc.resetPassword(req, { dn: BOB, password: 'Fresh-Password-2026', mustChange: true });
    assert.equal(result.outcome, 'partial');
    assert.deepEqual(result.warnings, ['flags_failed']);
    assert.deepEqual(result.steps.map((item) => [item.step, item.ok]), [['password', true], ['flags', false]]);
    assert.equal(result.steps[1].code, 'AD_DENIED');
    const row = (await db.query(`SELECT * FROM ad_journal WHERE action = 'password_reset' AND LOWER(target_dn) = LOWER($1) ORDER BY id DESC LIMIT 1`, [BOB])).rows[0];
    assert.deepEqual([row.ok, row.outcome, row.error_code, row.details.passwordSet, row.details.flagsSet], [true, 'partial', 'AD_DENIED', true, false]);
  } finally {
    directoryAccess.setClientFactory(() => fake.client());
    await setModule({ startTls: false });
  }
});

test('nothing outside the root is shown by its DN; login checks need ad.manage', { skip }, async () => {
  const admin = await svc.objectCard(req, ADMIN);
  const domainAdmins = admin.groups.find((group) => group.name === 'Domain Admins');
  assert.equal(domainAdmins.dn, null);
  const bob = await svc.objectCard(req, BOB);
  assert.deepEqual([bob.manager.dn, bob.manager.inScope, bob.manager.name, bob.object.manager], [null, false, 'Boss Outside', null]);
  const viewReq = withPermissions(req, ['ad.view']);
  await assert.rejects(svc.checkLogin(viewReq, { login: 'svc-portal' }), { code: 'FORBIDDEN' });
  await assert.rejects(svc.suggestLogin(viewReq, { first: 'Anna', last: 'Smith' }), { code: 'FORBIDDEN' });
  assert.equal((await svc.checkLogin(req, { login: 'svc-portal' })).taken, true);
});

test('portal links: a superadministrator\'s account is never re-pointed by others; refusals are journalled', { skip }, async () => {
  const plainId = plainReq.user.id;
  const adminId = req.user.id;
  const keep = (await db.query(`SELECT auth_source, external_id, directory_guid FROM users WHERE id = $1`, [plainId])).rows[0];
  const linker = { ...withPermissions(plainReq, ['users.manage', 'ad.view']) };
  try {
    await assert.rejects(svc.linkPortalUser(linker, { dn: BOB, userId: adminId }), { code: 'AD_LINK_SUPERADMIN' });
    const admin = (await db.query(`SELECT external_id FROM users WHERE id = $1`, [adminId])).rows[0];
    assert.equal(admin.external_id, ADMIN, 'the superadministrator still signs in with their own AD account');
    const row = (await db.query(`SELECT * FROM ad_journal WHERE action = 'portal_link' AND LOWER(target_dn) = LOWER($1) ORDER BY id DESC LIMIT 1`, [BOB])).rows[0];
    assert.deepEqual([row.ok, row.outcome, row.error_code, row.details.userId], [false, 'refused', 'AD_LINK_SUPERADMIN', adminId]);
    await assert.rejects(svc.unlinkPortalUser(linker, { dn: ADMIN }), { code: 'AD_LINK_SUPERADMIN' });
    assert.equal((await db.query(`SELECT external_id FROM users WHERE id = $1`, [adminId])).rows[0].external_id, ADMIN);
    // Their own portal account: allowed (the admin console's rule: self is always manageable).
    const linked = await svc.linkPortalUser(linker, { dn: BOB, userId: plainId });
    assert.equal(linked.user.id, plainId);
    assert.equal((await svc.unlinkPortalUser(linker, { dn: BOB })).outcome, 'changed');
  } finally {
    await db.query(`UPDATE users SET auth_source = $2, external_id = $3, directory_guid = $4 WHERE id = $1`, [plainId, keep.auth_source, keep.external_id, keep.directory_guid]);
  }
});

test('a display name longer than a CN: the CN is cut, the twin keeps its login', { skip }, async () => {
  const displayName = 'Anna-Maria Konstantinopolskaya-Vasilyeva-Rimskaya-Korsakova Junior II';
  const first = await svc.createUserAccount(req, { givenName: 'Anna-Maria', sn: 'Konstantinopolskaya', displayName, login: 'a.long', ou: `OU=Users,OU=HQ,${ROOT}` });
  const twin = await svc.createUserAccount(req, { givenName: 'Anna-Maria', sn: 'Konstantinopolskaya', displayName, login: 'a.long2', ou: `OU=Users,OU=HQ,${ROOT}` });
  assert.equal(parseDn(first.dn)[0].value.length, 64);
  assert.ok(parseDn(twin.dn)[0].value.length <= 64);
  assert.ok(parseDn(twin.dn)[0].value.endsWith(' (a.long2)'));
  assert.equal(fake.get(first.dn).attrs.displayname, displayName, 'the display name itself is kept whole');
});

test('reach errors while finding the administrator\'s own account get this module\'s codes', { skip }, async () => {
  let made = 0;
  const down = () => ({
    bind: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    },
    unbind: async () => {},
  });
  // The object read works; the next connection (the administrator's own account lookup) fails.
  directoryAccess.setClientFactory(() => (made++ === 0 ? fake.client() : down()));
  try {
    await assert.rejects(svc.updateAttributes(req, { dn: BOB, changes: { title: 'Unreachable' } }), { code: 'AD_UNAVAILABLE' });
  } finally {
    directoryAccess.setClientFactory(() => fake.client());
  }
});

test('the demo directory: without AD, filled by demo data, writable without LDAP, purged', { skip }, async () => {
  await setIntegration(false);
  fake.calls.length = 0;
  await demo.purgeModule('directory', req);
  const seeded = await demo.seedModule('directory', { ...req, locale: 'en' });
  assert.ok(seeded.counts.ad_demo_objects > 30);
  const overview = await svc.overview(req);
  assert.equal(overview.mode, 'demo');
  const top = await svc.tree(req);
  assert.ok(top.children.some((child) => child.name === 'HQ'));
  assert.ok(!top.children.some((child) => ['Service', 'Admins'].includes(child.name)), 'the demo hides its excluded OUs');
  const locked = await svc.listObjects(req, { flags: 'locked' });
  assert.equal(locked.total, 1);
  const user = locked.items[0];
  await svc.bulk(req, { action: 'disable', dns: [user.dn] });
  const card = await svc.objectCard(req, user.dn);
  assert.equal(card.object.enabled, false);
  assert.equal(card.history[0].action, 'disable');
  const reset = await svc.resetPassword(req, { dn: user.dn, password: 'Demo-Password-2026', mustChange: true });
  assert.equal(reset.outcome, 'changed');
  // Employee cards linked in the demo (by hand, twice) get their real value back on purge.
  const modulesRaw = JSON.parse((await db.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0].value);
  await setJson('modules', { ...modulesRaw, employees: { ...(modulesRaw.employees || {}), enabled: true } });
  const employee = (await db.query(`INSERT INTO employees (last_name, first_name, ad_account) VALUES ('Zz-directory-test', 'Demo', 'real.login') RETURNING id`)).rows[0].id;
  try {
    const others = (await svc.listObjects(req, { kinds: 'user', scope: 'sub' })).items.filter((item) => item.login);
    await svc.linkEmployee(req, { dn: others[0].dn, employeeId: employee });
    await svc.linkEmployee(req, { dn: others[1].dn, employeeId: employee });
    assert.equal((await db.query(`SELECT ad_account FROM employees WHERE id = $1`, [employee])).rows[0].ad_account, others[1].login);
    assert.equal(fake.calls.length, 0, 'the demo directory never calls LDAP');
    await demo.purgeModule('directory', req);
    assert.equal((await db.query(`SELECT ad_account FROM employees WHERE id = $1`, [employee])).rows[0].ad_account, 'real.login', 'no demo login survives the purge');
  } finally {
    await db.query(`DELETE FROM employees WHERE id = $1`, [employee]);
    await setJson('modules', modulesRaw);
  }
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM ad_demo_objects`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM ad_journal WHERE demo`)).rows[0].n, 0);
  assert.equal((await svc.overview(req)).mode, 'off');
});
