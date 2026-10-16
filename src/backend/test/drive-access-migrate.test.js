import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_ACCESS_DEFAULTS, resolveModules } from '../modules/catalog.js';
import { LEGACY_KEY, NEW_PERMISSION, OLD_PERMISSION, convertFolderAccess, migrateJournal, migratePermission, migrateSettings, saveLegacyCopy } from '../modules/drive/access/migrate.js';
import { sanitizeModules } from '../modules/catalog.js';

/*
 * The former «Доступ к папкам» module (modules.folderaccess, fa_journal, folderaccess.groups)
 * moves into the File server: settings, path prefixes, journal table and role permission.
 * A small in-memory database stands in for PostgreSQL; every step is run twice (idempotent).
 */

const OLD_SETTINGS = {
  prefix: 'sg_',
  orgCode: 'co',
  orgCodes: ['co', 'wh'],
  nameTemplate: '{prefix}{org}_{name}_{type}',
  groupsBase: '',
  newGroupOu: 'OU=Groups,OU=CO,OU=Accounts,DC=example,DC=com',
  subjectsBase: 'DC=example,DC=com',
  driveMap: [{ letter: 'W', shareId: 2 }, { letter: 'x', shareId: 9 }, { letter: 'Q', shareId: 0 }],
  typeMap: { full: 'modify', read: 'read_execute' },
  protectedGroups: ['sg_*_root_*'],
  otherGroups: ['nextcloud_*'],
};

/**
 * app_settings, drive_shares, app_roles and two journal tables, as far as the migration uses them.
 * `transaction` works like withTransaction: a throw inside rolls every change back. `failOn` (a regexp)
 * makes the matching statement throw, to test that.
 */
function fakeDb({ modules, shares = [], roles = [], tables = { fa_journal: [{ id: 1 }, { id: 2 }] }, settings = {} } = {}) {
  const db = { settings: { ...(modules === undefined ? {} : { modules: JSON.stringify(modules) }), ...settings }, shares: structuredClone(shares), roles: structuredClone(roles), tables: structuredClone(tables), indexes: ['fa_journal_at_idx', 'fa_journal_user_idx', 'fa_journal_member_idx', 'fa_journal_pkey', 'fa_journal_id_seq'], log: [], failOn: null, locks: 0 };
  const run = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    db.log.push(text);
    if (db.failOn && db.failOn.test(text)) throw new Error('boom');
    if (text.startsWith('SELECT pg_advisory_xact_lock')) {
      db.locks += 1;
      return { rows: [] };
    }
    if (text.startsWith("SELECT value FROM app_settings WHERE key = 'modules' FOR UPDATE")) return { rows: db.settings.modules ? [{ value: db.settings.modules }] : [] };
    if (text.startsWith('SELECT value FROM app_settings WHERE key = $1 FOR UPDATE')) return { rows: db.settings[params[0]] ? [{ value: db.settings[params[0]] }] : [] };
    if (text.startsWith('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING')) {
      if (db.settings[params[0]] !== undefined) return { rowCount: 0, rows: [] };
      db.settings[params[0]] = params[1];
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE')) {
      db.settings[params[0]] = params[1];
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('SELECT path_prefixes FROM drive_shares WHERE id = $1')) {
      const share = db.shares.find((row) => row.id === params[0]);
      return { rows: share ? [{ path_prefixes: share.path_prefixes }] : [] };
    }
    if (text.startsWith('UPDATE drive_shares SET path_prefixes = $2 WHERE id = $1')) {
      db.shares.find((row) => row.id === params[0]).path_prefixes = params[1];
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('UPDATE app_roles SET permissions = array_append(permissions, $2)')) {
      const [from, to] = params;
      let count = 0;
      for (const role of db.roles) {
        if (!role.permissions.includes(from) || role.permissions.includes(to)) continue;
        count += 1;
        role.permissions.push(to);
      }
      return { rowCount: count, rows: [] };
    }
    if (text.startsWith('SELECT to_regclass')) return { rows: [{ old: db.tables.fa_journal ? 'fa_journal' : null, new: db.tables.drive_access_journal ? 'drive_access_journal' : null }] };
    if (text.startsWith('SELECT COUNT(*)::int AS n FROM drive_access_journal')) return { rows: [{ n: db.tables.drive_access_journal.length }] };
    if (text === 'DROP TABLE drive_access_journal') {
      delete db.tables.drive_access_journal;
      return { rows: [] };
    }
    if (text === 'ALTER TABLE fa_journal RENAME TO drive_access_journal') {
      db.tables.drive_access_journal = db.tables.fa_journal;
      delete db.tables.fa_journal;
      return { rows: [] };
    }
    const renamed = text.match(/^ALTER (?:INDEX|SEQUENCE) IF EXISTS (\S+) RENAME TO (\S+)$/);
    if (renamed) {
      db.indexes = db.indexes.map((name) => (name === renamed[1] ? renamed[2] : name));
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${text}`);
  };
  const transaction = async (fn) => {
    const saved = structuredClone({ settings: db.settings, shares: db.shares, roles: db.roles, tables: db.tables, indexes: db.indexes });
    try {
      return await fn({ query: run });
    } catch (err) {
      Object.assign(db, saved);
      throw err;
    }
  };
  return { db, run, transaction };
}

test('old settings convert: enabled, project codes, template, letters → share prefixes', () => {
  const { access, prefixes } = convertFolderAccess({ enabled: true, settings: OLD_SETTINGS });
  assert.equal(access.enabled, true);
  assert.deepEqual(access.projects, ['co', 'wh']);
  assert.equal(access.defaultProject, 'co');
  // The other accepted code was the old name of the main one: new pairs get co, not wh.
  assert.deepEqual(access.projectAliases, { wh: 'co' });
  assert.equal(access.nameTemplate, '{prefix}{project}_{name}_{type}');
  assert.equal(access.newGroupOu, OLD_SETTINGS.newGroupOu);
  assert.equal(access.subjectsBase, 'DC=example,DC=com');
  assert.deepEqual(access.typeMap, OLD_SETTINGS.typeMap);
  assert.equal(access.driveMap, undefined);
  assert.equal(access.orgCodes, undefined);
  assert.deepEqual(Object.keys(access).sort(), Object.keys(DRIVE_ACCESS_DEFAULTS).sort());
  assert.deepEqual(prefixes, [{ shareId: 2, prefix: 'W:' }, { shareId: 9, prefix: 'X:' }]);
  // Off stays off; nothing set → the defaults.
  assert.equal(convertFolderAccess({ enabled: false, settings: OLD_SETTINGS }).access.enabled, false);
  assert.deepEqual(convertFolderAccess({}).access, { ...DRIVE_ACCESS_DEFAULTS });
});

test('settings move into the File server once; shares get their prefixes; the old block stays (rollback)', async () => {
  const modules = { drive: { enabled: true, settings: { title: 'Диск', rememberLogin: true } }, folderaccess: { enabled: true, settings: OLD_SETTINGS }, kb: { enabled: true } };
  const { db, transaction } = fakeDb({ modules, shares: [{ id: 1, path_prefixes: [] }, { id: 2, path_prefixes: ['G:\\'] }] });
  assert.equal(await saveLegacyCopy(transaction), true);
  const first = await migrateSettings(transaction);
  assert.equal(first.migrated, true);
  assert.equal(first.enabled, true);
  assert.deepEqual(first.prefixes, [{ shareId: 2, prefix: 'W:' }]);
  const stored = JSON.parse(db.settings.modules);
  assert.deepEqual(stored.folderaccess, modules.folderaccess, 'v1.4 still finds its block');
  assert.equal(stored.kb.enabled, true);
  assert.equal(stored.drive.enabled, true);
  assert.equal(stored.drive.settings.title, 'Диск');
  assert.equal(stored.drive.settings.access.enabled, true);
  assert.equal(stored.drive.settings.access.defaultProject, 'co');
  assert.deepEqual(stored.drive.settings.access.projectAliases, { wh: 'co' });
  assert.deepEqual(db.shares.find((share) => share.id === 2).path_prefixes, ['G:', 'W:']);
  assert.deepEqual(db.shares.find((share) => share.id === 1).path_prefixes, []);
  const legacy = JSON.parse(db.settings[LEGACY_KEY]);
  assert.deepEqual(legacy.folderaccess, modules.folderaccess);
  assert.ok(legacy.migratedAt && legacy.savedAt);
  // Each step ran under the advisory lock and read with FOR UPDATE.
  assert.equal(db.locks, 2);
  assert.ok(db.log.some((line) => /key = 'modules' FOR UPDATE/.test(line)));
  // The resolved settings read it back over the defaults.
  const resolved = resolveModules(stored);
  assert.equal(resolved.drive.settings.access.enabled, true);
  assert.deepEqual(resolved.drive.settings.access.projects, ['co', 'wh']);
  assert.equal(resolved.folderaccess, undefined);
  // Second start: nothing to do, nothing written.
  assert.equal(await saveLegacyCopy(transaction), false);
  const before = structuredClone(db.settings);
  assert.deepEqual(await migrateSettings(transaction), { migrated: false });
  assert.deepEqual(db.settings, before);
  assert.deepEqual(db.shares.find((share) => share.id === 2).path_prefixes, ['G:', 'W:']);
});

test('a failed settings move changes nothing, survives a save of Settings → Modules and is retried from the copy', async () => {
  const modules = { drive: { enabled: true, settings: { title: 'Диск' } }, folderaccess: { enabled: true, settings: OLD_SETTINGS } };
  const { db, transaction } = fakeDb({ modules, shares: [{ id: 2, path_prefixes: [] }] });
  assert.equal(await saveLegacyCopy(transaction), true);
  // The write of the modules fails after the share was already updated: all of it is rolled back.
  db.failOn = /^INSERT INTO app_settings .* DO UPDATE/;
  await assert.rejects(migrateSettings(transaction), /boom/);
  assert.deepEqual(db.shares[0].path_prefixes, []);
  assert.equal(JSON.parse(db.settings.modules).drive.settings.access, undefined);
  assert.equal(JSON.parse(db.settings[LEGACY_KEY]).migratedAt, null);
  db.failOn = null;
  // An administrator saves the modules page in between: the catalog-only map drops modules.folderaccess.
  db.settings.modules = JSON.stringify(sanitizeModules(resolveModules(JSON.parse(db.settings.modules)), { kb: { enabled: true } }));
  assert.equal(JSON.parse(db.settings.modules).folderaccess, undefined);
  // Next start: the copy carries it.
  assert.equal(await saveLegacyCopy(transaction), false);
  const out = await migrateSettings(transaction);
  assert.deepEqual([out.migrated, out.enabled, out.prefixes], [true, true, [{ shareId: 2, prefix: 'W:' }]]);
  assert.equal(JSON.parse(db.settings.modules).drive.settings.access.enabled, true);
  assert.deepEqual(db.shares[0].path_prefixes, ['W:']);
  assert.deepEqual(await migrateSettings(transaction), { migrated: false });
});

test('an access block that already exists is kept', async () => {
  const modules = { drive: { settings: { access: { enabled: false, prefix: 'grp_' } } }, folderaccess: { enabled: true, settings: OLD_SETTINGS } };
  const { db, transaction } = fakeDb({ modules, shares: [{ id: 2, path_prefixes: [] }] });
  const out = await migrateSettings(transaction);
  assert.deepEqual([out.migrated, out.carried, out.prefixes], [true, false, []]);
  const stored = JSON.parse(db.settings.modules);
  assert.deepEqual(stored.drive.settings.access, { enabled: false, prefix: 'grp_' });
  assert.deepEqual(stored.folderaccess, modules.folderaccess);
  assert.deepEqual(db.shares[0].path_prefixes, []);
  assert.ok(JSON.parse(db.settings[LEGACY_KEY]).migratedAt);
});

test('no stored modules, or no old module: nothing happens', async () => {
  const empty = fakeDb({});
  assert.equal(await saveLegacyCopy(empty.transaction), false);
  assert.deepEqual(await migrateSettings(empty.transaction), { migrated: false });
  assert.deepEqual(empty.db.settings, {});
  const plain = fakeDb({ modules: { drive: { enabled: true } } });
  assert.deepEqual(await migrateSettings(plain.transaction), { migrated: false });
  assert.equal(plain.db.settings.modules, JSON.stringify({ drive: { enabled: true } }));
  // A missing share (deleted since) is skipped.
  const gone = fakeDb({ modules: { folderaccess: { enabled: false, settings: OLD_SETTINGS } } });
  const out = await migrateSettings(gone.transaction);
  assert.deepEqual([out.migrated, out.enabled, out.prefixes], [true, false, []]);
  assert.equal(JSON.parse(gone.db.settings.modules).drive.settings.access.enabled, false);
});

test('roles: drive.access is added next to folderaccess.groups, once, without duplicates', async () => {
  const { db, run } = fakeDb({
    roles: [
      { key: 'sysadmin', permissions: ['drive.admin', OLD_PERMISSION] },
      { key: 'both', permissions: [OLD_PERMISSION, NEW_PERMISSION] },
      { key: 'other', permissions: ['kb.admin'] },
    ],
  });
  assert.equal(await migratePermission(run), 1);
  const expected = [['drive.admin', OLD_PERMISSION, NEW_PERMISSION], [OLD_PERMISSION, NEW_PERMISSION], ['kb.admin']];
  assert.deepEqual(db.roles.map((role) => role.permissions), expected);
  assert.equal(await migratePermission(run), 0);
  assert.deepEqual(db.roles.map((role) => role.permissions), expected);
});

test('journal: fa_journal is renamed with its rows, indexes and sequence, once', async () => {
  const { db, transaction } = fakeDb();
  assert.equal(await migrateJournal(transaction), 'renamed');
  assert.deepEqual(db.tables, { drive_access_journal: [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(db.indexes, ['drive_access_journal_at_idx', 'drive_access_journal_user_idx', 'drive_access_journal_member_idx', 'drive_access_journal_pkey', 'drive_access_journal_id_seq']);
  assert.equal(db.locks, 1);
  assert.equal(await migrateJournal(transaction), 'none');
  assert.deepEqual(db.tables, { drive_access_journal: [{ id: 1 }, { id: 2 }] });
  // An empty new table (created by an earlier start) gives way to the old one…
  const both = fakeDb({ tables: { fa_journal: [{ id: 5 }], drive_access_journal: [] } });
  assert.equal(await migrateJournal(both.transaction), 'renamed');
  assert.deepEqual(both.db.tables, { drive_access_journal: [{ id: 5 }] });
  // …a new one with rows is never dropped.
  const busy = fakeDb({ tables: { fa_journal: [{ id: 5 }], drive_access_journal: [{ id: 1 }] } });
  assert.equal(await migrateJournal(busy.transaction), 'kept');
  assert.deepEqual(Object.keys(busy.db.tables).sort(), ['drive_access_journal', 'fa_journal']);
});

test('journal: a rename that stops halfway is rolled back as a whole (no half-renamed indexes)', async () => {
  const { db, transaction } = fakeDb();
  db.failOn = /fa_journal_member_idx/;
  await assert.rejects(migrateJournal(transaction), /boom/);
  assert.deepEqual(Object.keys(db.tables), ['fa_journal']);
  assert.ok(db.indexes.every((name) => name.startsWith('fa_journal_')));
  db.failOn = null;
  assert.equal(await migrateJournal(transaction), 'renamed');
  assert.ok(db.indexes.every((name) => name.startsWith('drive_access_journal_')));
});
