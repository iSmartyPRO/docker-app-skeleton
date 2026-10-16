import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_ACCESS_DEFAULTS, MODULE_CATALOG, resolveModules, sanitizeModules, sanitizeDriveAccess, sanitizeProjectAliases } from '../modules/catalog.js';
import {
  ancestorFolders,
  buildFolders,
  buildPairs,
  cleanPrefixes,
  cnOf,
  describeGroup,
  domainRoot,
  formatDescription,
  globRe,
  globToSubstring,
  isDisabled,
  isSecurityGroup,
  mapPath,
  newGroupNames,
  objectKind,
  parseDescription,
  parseGroupName,
  projectOf,
  sidToString,
  splitDn,
  userPaths,
} from '../modules/drive/access/naming.js';
import {
  accessOf,
  assertMemberAdd,
  groupRefusal,
  groupVisible,
  inverseOf,
  journalKinds,
  memberRefusal,
  requireSuperadmin,
  requireWrite,
  undoRefusal,
} from '../modules/drive/access/policy.js';
import {
  addMember,
  adError,
  bindFailureCode,
  createGroups,
  moveMember,
  rangedValues,
  removeMember,
  setClientFactory,
  verifyBind,
  withActor,
} from '../modules/drive/access/directory.js';
import { credentialProblem, resolveCredential } from '../modules/drive/access/credentials.js';
import { journalFilter, kindOf } from '../modules/drive/access/journal.js';
import { aliasCode, applyMembership, creationPlan, suggestName } from '../modules/drive/access/service.js';
import { attachGroupsToNtfs, registerNtfsAttach } from '../modules/drive/access/ntfsHook.js';

const SETTINGS = { ...DRIVE_ACCESS_DEFAULTS, defaultProject: 'co', shareMap: [{ shareId: 1, prefix: 'W:' }] };

const ldapError = (code, message = `ldap ${code}`) => Object.assign(new Error(message), { code });

/** A mock ldapts client: records calls, fails where told. */
function mockClient({ modify = {}, bind, add = {}, del = {}, search } = {}) {
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
    async modify(dn, change) {
      const op = change.operation;
      const value = change.modification.values[0];
      calls.push(['modify', op, dn, value]);
      const fail = modify[`${op}:${dn}`];
      if (fail) throw typeof fail === 'function' ? fail() : fail;
    },
    async add(dn, attrs) {
      calls.push(['add', dn, attrs]);
      if (add[dn]) throw add[dn];
    },
    async del(dn) {
      calls.push(['del', dn]);
      if (del[dn]) throw del[dn];
    },
    async search(base, options) {
      calls.push(['search', base, options.attributes]);
      return search ? search(base, options) : { searchEntries: [] };
    },
  };
}

// ── names and descriptions ───────────────────────────────────────────────────

test('group names: prefix, any project code, name part with underscores, type', () => {
  const co = parseGroupName('sg_co_hr_full', SETTINGS);
  assert.deepEqual([co.prefixed, co.project, co.stem, co.type, co.issues], [true, 'co', 'hr', 'full', []]);
  const wh = parseGroupName('SG_WH_06-accounting_read', SETTINGS);
  assert.deepEqual([wh.project, wh.stem, wh.type, wh.issues], ['wh', '06-accounting', 'read', []]);
  const multi = parseGroupName('sg_prb2_qaqc_styajka_full', SETTINGS);
  assert.deepEqual([multi.project, multi.stem, multi.type], ['prb2', 'qaqc_styajka', 'full']);
  // Any project code by default; an allow-list is a setting.
  assert.deepEqual(parseGroupName('sg_xx_hr_full', SETTINGS).issues, []);
  assert.deepEqual(parseGroupName('sg_xx_hr_full', { ...SETTINGS, projects: ['co', 'wh'] }).issues, ['project_unknown']);
  assert.deepEqual(parseGroupName('sg_co_hr', SETTINGS).issues, ['name_format']);
  assert.deepEqual(parseGroupName('sg_co_hr_write', SETTINGS).issues, ['name_format']);
  const other = parseGroupName('nextcloud_users', SETTINGS);
  assert.equal(other.prefixed, false);
  assert.deepEqual(other.issues, []);
  // sgManager_prb2 starts with "sg" but not with "sg_": not an access group.
  assert.equal(parseGroupName('sgManager_prb2', SETTINGS).prefixed, false);
  assert.equal(parseGroupName('adm_prb2', SETTINGS).prefixed, false);
});

test('descriptions: path;access, root, separators, UNC, mistakes', () => {
  assert.deepEqual(parseDescription('W:\\06-ACCOUNTING;Full Access'), { raw: 'W:\\06-ACCOUNTING;Full Access', path: 'W:\\06-ACCOUNTING', pathKey: 'w:\\06-accounting', root: false, access: 'full', issues: [] });
  const root = parseDescription('W:;Full Access');
  assert.deepEqual([root.path, root.root, root.issues], ['W:', true, []]);
  const deep = parseDescription(' w:\\a\\b c\\ ; read  only ');
  assert.deepEqual([deep.path, deep.access], ['W:\\a\\b c', 'read']);
  assert.equal(parseDescription('W:/a//b/;Read Only').path, 'W:\\a\\b');
  const unc = parseDescription('\\\\server\\share\\x;Read Only');
  assert.deepEqual([unc.path, unc.issues, unc.root], ['\\\\server\\share\\x', [], false]);
  assert.deepEqual(parseDescription('').issues, ['description_missing']);
  assert.deepEqual(parseDescription('W:\\HR').issues, ['description_format']);
  assert.deepEqual(parseDescription('W:\\HR;Modify').issues, ['access_unknown']);
  assert.deepEqual(parseDescription('HR;Read Only').issues, ['path_format']);
  assert.deepEqual(parseDescription('\\\\server;Read Only').issues, ['path_format']);
  assert.equal(formatDescription('W:\\07-LEGAL', 'read'), 'W:\\07-LEGAL;Read Only');
  assert.equal(formatDescription('w:/07-LEGAL/', 'full'), 'W:\\07-LEGAL;Full Access');
  assert.equal(parseDescription(formatDescription('W:\\07-LEGAL', 'full')).access, 'full');
});

test('paths map to File server folders by the longest prefix (case, \\ or /)', () => {
  const map = [
    { shareId: 1, prefix: 'G:\\' },
    { shareId: 2, prefix: 'g:/ПРБ-2/_DocArch' },
    { shareId: 3, prefix: '\\\\fs\\data' },
  ];
  assert.deepEqual(mapPath('G:\\ПРБ-2\\_DocArch\\10-BUH', map), { shareId: 2, relPath: '10-BUH', prefix: 'G:\\ПРБ-2\\_DocArch' });
  assert.deepEqual(mapPath('G:\\прб-2\\_docarch', map), { shareId: 2, relPath: '', prefix: 'G:\\ПРБ-2\\_DocArch' });
  assert.deepEqual(mapPath('G:\\ПРБ-2', map), { shareId: 1, relPath: 'ПРБ-2', prefix: 'G:' });
  // A prefix matches whole path parts only.
  assert.deepEqual(mapPath('G:\\ПРБ-2\\_DocArchive', map), { shareId: 1, relPath: 'ПРБ-2/_DocArchive', prefix: 'G:' });
  assert.deepEqual(mapPath('\\\\FS\\Data\\a', map), { shareId: 3, relPath: 'a', prefix: '\\\\fs\\data' });
  assert.equal(mapPath('W:\\HR', map), null);
  assert.equal(mapPath('\\\\fs\\other', map), null);
  assert.deepEqual(userPaths(['W:', 'G:\\ПРБ-2\\_DocArch'], '06-HR/Archive'), ['W:\\06-HR\\Archive', 'G:\\ПРБ-2\\_DocArch\\06-HR\\Archive']);
  assert.deepEqual(userPaths(['W:'], ''), ['W:']);
  assert.deepEqual(cleanPrefixes(['w:', 'W:\\', ' G:/ПРБ-2/_DocArch/ ', 'nonsense', '', '\\\\fs']), ['W:', 'G:\\ПРБ-2\\_DocArch']);
  assert.deepEqual(cleanPrefixes('W:\nG:\\X'), ['W:', 'G:\\X']);
});

test('projects: the first OU below the search base, "Groups" skipped', () => {
  const gescons = ['OU=Accounts,DC=gescons,DC=ru'];
  assert.deepEqual(projectOf('CN=sg_prb2_buh_full,OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', gescons), {
    groupsOu: 'OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru',
    project: 'ПРБ-2',
    projectDn: 'OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru',
  });
  // Nested OU inside the project's Groups OU: still the project (was "Groups").
  const nested = projectOf('CN=sg_prb2_x_full,OU=Sec,OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', gescons);
  assert.equal(nested.project, 'ПРБ-2');
  assert.equal(nested.projectDn, 'OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru');
  assert.equal(nested.groupsOu, 'OU=Sec,OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru');
  // Right in the base, or in a Groups OU right under it: no project (was "Accounts" / "Groups").
  assert.deepEqual(projectOf('CN=sg_x_y_full,OU=Accounts,DC=gescons,DC=ru', gescons), { groupsOu: 'OU=Accounts,DC=gescons,DC=ru', project: null, projectDn: null });
  assert.equal(projectOf('CN=sg_x_y_full,OU=Groups,OU=Accounts,DC=gescons,DC=ru', gescons).project, null);
  // A group right in a project OU under the base: that OU.
  assert.equal(projectOf('CN=sg_it_x_full,OU=IT,OU=Accounts,DC=c,DC=ru', ['OU=Accounts,DC=c,DC=ru']).project, 'IT');
  // The broadest base decides: an OU list of Groups OUs plus the AD base DN.
  assert.equal(projectOf('CN=sg_prb2_buh_full,OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', ['OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', ...gescons]).project, 'ПРБ-2');
  // Only the project's Groups OU as base: the project above it.
  assert.equal(projectOf('CN=sg_prb2_buh_full,OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', ['ou=groups, ou=ПРБ-2,ou=accounts,dc=gescons,dc=ru']).project, 'ПРБ-2');
  // White Hills (base OU=Accounts), and without a base / with the domain root: the OU holding "Groups".
  assert.equal(projectOf('CN=sg_wh_hr_full,OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg', ['OU=Accounts,DC=whitehills,DC=kg']).project, 'CO');
  assert.equal(projectOf('CN=sg_co_hr_full,OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg').project, 'CO');
  assert.equal(projectOf('CN=sg_co_hr_full,OU=Sec,OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg', ['DC=whitehills,DC=kg']).project, 'CO');
  assert.equal(projectOf('CN=sg_it_x_full,OU=IT,OU=Accounts,DC=c,DC=ru', ['DC=c,DC=ru']).project, 'IT');
  assert.equal(projectOf('CN=g,DC=c,DC=ru').project, null);
  assert.equal(projectOf('CN=g,CN=Users,DC=c,DC=ru').project, null);
  // A base that does not hold the group is ignored.
  assert.equal(projectOf('CN=sg_co_hr_full,OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg', ['OU=Other,DC=whitehills,DC=kg']).project, 'CO');
  assert.deepEqual(splitDn('CN=Ivanov\\, Ivan,OU=Users,DC=corp'), ['CN=Ivanov\\, Ivan', 'OU=Users', 'DC=corp']);
});

test('a group needs review on any mismatch', () => {
  const ok = describeGroup({ dn: 'CN=sg_co_hr_full,OU=G', name: 'sg_co_hr_full', description: 'W:\\06-HR;Full Access', members: ['a', 'b'] }, SETTINGS);
  assert.equal(ok.needsReview, false);
  assert.equal(ok.shareId, 1);
  assert.equal(ok.relPath, '06-HR');
  assert.equal(ok.memberCount, 2);
  assert.equal(ok.root, false);
  const wrongType = describeGroup({ dn: 'x', name: 'sg_co_hr_full', description: 'W:\\06-HR;Read Only' }, SETTINGS);
  assert.deepEqual(wrongType.issues, ['type_mismatch']);
  // The description decides the access type.
  assert.equal(wrongType.type, 'read');
  const unmapped = describeGroup({ dn: 'x', name: 'sg_co_hr_read', description: 'X:\\HR;Read Only' }, SETTINGS);
  assert.deepEqual(unmapped.issues, ['path_unmapped']);
  const noDesc = describeGroup({ dn: 'x', name: 'sg_co_hr_read', description: '' }, SETTINGS);
  assert.ok(noDesc.needsReview);
  const root = describeGroup({ dn: 'x', name: 'sg_co_root_full', description: 'W:;Full Access' }, SETTINGS);
  assert.equal(root.root, true);
  assert.equal(root.protected, true);
  // Root by its description even when the name does not match the protected pattern.
  assert.equal(describeGroup({ dn: 'x', name: 'sg_co_all_read', description: 'W:;Read Only' }, SETTINGS).root, true);
  const other = describeGroup({ dn: 'x', name: 'nextcloud_admins', description: 'whatever' }, SETTINGS);
  assert.equal(other.kind, 'other');
  assert.equal(other.needsReview, false);
});

test('groups pair up, and pairs group into folders by their description', () => {
  const groups = [
    { dn: '1', name: 'sg_co_hr_full', description: 'W:\\06-HR;Full Access', members: ['a'] },
    { dn: '2', name: 'sg_co_hr_read', description: 'W:\\06-HR;Read Only', members: ['b', 'c'] },
    { dn: '3', name: 'sg_wh_it_full', description: 'W:\\09-IT;Full Access' },
    { dn: '4', name: 'sg_co_pm_full', description: 'W:\\10-PM;Full Access' },
    { dn: '5', name: 'sg_co_pm_read', description: 'W:\\11-PM;Read Only' },
    { dn: '6', name: 'nextcloud_users', description: '' },
    { dn: '7', name: 'sg_co_odd_full', description: '' },
  ].map((entry) => describeGroup(entry, SETTINGS));
  const pairs = Object.fromEntries(buildPairs(groups).map((pair) => [pair.key, pair]));
  assert.equal(pairs.co_hr.needsReview, false);
  assert.equal(pairs.co_hr.memberCount, 3);
  assert.equal(pairs.co_hr.groups.full.dn, '1');
  assert.equal(pairs.co_hr.groups.read.dn, '2');
  assert.deepEqual(pairs.wh_it.issues, ['pair_incomplete']);
  assert.ok(pairs.co_pm.issues.includes('path_mismatch'));
  const folders = buildFolders(groups);
  const byKey = Object.fromEntries(folders.map((folder) => [folder.key, folder]));
  const hr = byKey['p:w:\\06-hr'];
  assert.equal(hr.name, '06-HR');
  assert.equal(hr.relPath, '06-HR');
  assert.equal(hr.pairs.length, 1);
  assert.equal(hr.memberCount, 3);
  assert.equal(byKey['~nextcloud_users'].kind, 'other');
  assert.equal(byKey['~nextcloud_users'].needsReview, false);
  assert.ok(byKey['n:co_odd'].needsReview);
  // Other groups come last.
  assert.equal(folders.at(-1).kind, 'other');
});

test('gescons: the second company\'s groups (projects, nested and shared folders, inheritance)', () => {
  const settings = { ...SETTINGS, shareMap: [{ shareId: 7, prefix: 'G:\\ПРБ-2\\_DocArch' }, { shareId: 8, prefix: 'G:\\ПРБ-2' }], bases: ['OU=Accounts,DC=gescons,DC=ru'] };
  const ou = 'OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru';
  const g = (name, description) => describeGroup({ dn: `CN=${name},${ou}`, name, description, members: [] }, settings);
  const groups = [
    g('sg_prb2_buh_full', 'G:\\ПРБ-2\\_DocArch\\10-BUH;Full Access'),
    g('sg_prb2_buh_read', 'G:\\ПРБ-2\\_DocArch\\10-BUH;Read Only'),
    g('sg_prb2_qaqc_styajka_full', 'G:\\ПРБ-2\\_DocArch\\3-QA,QC\\СТЯЖКА;Full Access'),
    g('sg_prb2_qaqc_full', 'G:\\ПРБ-2\\_DocArch\\3-QA,QC;Full Access'),
    g('sg_prb2_specification_full', 'G:\\ПРБ-2\\_DocArch\\3-QA,QC;Full Access'),
    g('sg_prb2_technicaloffice_full', 'G:\\ПРБ-2\\_DocArch\\13-TECHNICAL OFFICE;Full Access'),
    g('sg_prb2_root_full', 'G:\\ПРБ-2;Full Access'),
  ];
  const [buh, , styajka] = groups;
  assert.deepEqual([buh.project, buh.code, buh.stem, buh.shareId, buh.relPath], ['ПРБ-2', 'prb2', 'buh', 7, '10-BUH']);
  // Underscore in the name part, a nested Cyrillic folder, a comma in the path.
  assert.deepEqual([styajka.stem, styajka.type, styajka.path, styajka.relPath, styajka.issues.filter((issue) => issue !== 'pair_incomplete')], ['qaqc_styajka', 'full', 'G:\\ПРБ-2\\_DocArch\\3-QA,QC\\СТЯЖКА', '3-QA,QC/СТЯЖКА', []]);
  const tech = groups[5];
  assert.deepEqual([tech.relPath, tech.issues], ['13-TECHNICAL OFFICE', []]);
  const root = groups[6];
  assert.deepEqual([root.root, root.protected, root.shareId, root.relPath], [true, true, 8, '']);
  const folders = buildFolders(groups);
  const qaqc = folders.find((folder) => folder.pathKey === 'g:\\прб-2\\_docarch\\3-qa,qc');
  // Two different pairs open the same folder.
  assert.deepEqual(qaqc.pairs.map((pair) => pair.key), ['prb2_qaqc', 'prb2_specification']);
  assert.equal(qaqc.project, 'ПРБ-2');
  // Inherited access: the folders above with groups, nearest first.
  assert.deepEqual(ancestorFolders(folders, ['g:\\прб-2\\_docarch\\3-qa,qc\\стяжка']).map((folder) => folder.path), ['G:\\ПРБ-2\\_DocArch\\3-QA,QC', 'G:\\ПРБ-2']);
  assert.deepEqual(ancestorFolders(folders, ['g:\\прб-2']), []);
  // Non-access groups of the same OU: sgManager_ and adm_ are not prefixed; a distribution list is skipped on read.
  assert.equal(describeGroup({ dn: `CN=sgManager_prb2,${ou}`, name: 'sgManager_prb2', description: '' }, settings).kind, 'other');
  assert.equal(isSecurityGroup('-2147483646'), true);
  assert.equal(isSecurityGroup('2'), false);
  assert.equal(isSecurityGroup(undefined), true);
});

test('a new pair takes its project code and OU from the folder or the folder above, else the settings', () => {
  const ou = 'OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru';
  const settings = { ...SETTINGS, defaultProject: 'co', newGroupOu: 'OU=Groups,OU=CO,OU=Accounts,DC=gescons,DC=ru', bases: ['OU=Accounts,DC=gescons,DC=ru'] };
  const folders = buildFolders([
    describeGroup({ dn: `CN=sg_prb2_root_full,${ou}`, name: 'sg_prb2_root_full', description: 'G:\\ПРБ-2;Full Access' }, settings),
    describeGroup({ dn: `CN=sg_prb2_buh_full,${ou}`, name: 'sg_prb2_buh_full', description: 'G:\\ПРБ-2\\_DocArch\\10-BUH;Full Access' }, settings),
  ]);
  const plan = (overrides) => ({ derivedCode: null, fromPath: null, source: 'settings', ...overrides });
  assert.deepEqual(creationPlan(settings, folders, 'G:\\ПРБ-2\\_DocArch\\10-BUH\\Акты'), plan({ project: 'ПРБ-2', code: 'prb2', ou, from: 'prb2_buh', fromPath: 'G:\\ПРБ-2\\_DocArch\\10-BUH', source: 'folder' }));
  assert.deepEqual(creationPlan(settings, folders, 'G:\\ПРБ-2\\_DocArch\\11-NEW'), plan({ project: 'ПРБ-2', code: 'prb2', ou, from: 'prb2_root', fromPath: 'G:\\ПРБ-2', source: 'folder' }));
  assert.deepEqual(creationPlan(settings, folders, 'W:\\07-LEGAL'), plan({ project: null, code: 'co', ou: settings.newGroupOu, from: null }));
  assert.deepEqual(creationPlan({ ...settings, defaultProject: '', newGroupOu: '' }, folders, 'W:\\07-LEGAL'), plan({ project: null, code: null, ou: null, from: null }));
});

test('new group names follow the template and refuse odd names', () => {
  assert.deepEqual(newGroupNames('Legal', SETTINGS, 'co'), { full: 'sg_co_legal_full', read: 'sg_co_legal_read' });
  assert.deepEqual(newGroupNames('qaqc_styajka', SETTINGS, 'prb2'), { full: 'sg_prb2_qaqc_styajka_full', read: 'sg_prb2_qaqc_styajka_read' });
  // The old {org} token still works.
  assert.deepEqual(newGroupNames('07-legal', { ...SETTINGS, nameTemplate: 'grp-{org}-{name}-{type}' }, 'co'), { full: 'grp-co-07-legal-full', read: 'grp-co-07-legal-read' });
  // The default project when none is given; none at all → no names.
  assert.deepEqual(newGroupNames('hr', { ...SETTINGS, defaultProject: 'wh' }), { full: 'sg_wh_hr_full', read: 'sg_wh_hr_read' });
  assert.equal(newGroupNames('hr', { ...SETTINGS, defaultProject: '' }), null);
  for (const bad of ['', 'юрист', 'a b', '../x', 'x;y', 'a'.repeat(80)]) assert.equal(newGroupNames(bad, SETTINGS, 'co'), null, bad);
  assert.equal(suggestName('13-TECHNICAL OFFICE'), 'technical-office');
  assert.equal(suggestName('3-QA,QC/СТЯЖКА'), 'styazhka');
  assert.equal(suggestName(''), '');
});

test('globs, DNs, SIDs and account flags', () => {
  assert.ok(globRe('sg_*_root_*').test('SG_CO_ROOT_FULL'));
  assert.ok(!globRe('sg_*_root_*').test('sg_co_hr_full'));
  assert.ok(!globRe('a.b').test('axb'));
  assert.deepEqual(globToSubstring('sg_*'), { initial: 'sg_', any: [], final: undefined });
  assert.deepEqual(globToSubstring('a*b*c'), { initial: 'a', any: ['b'], final: 'c' });
  assert.deepEqual(globToSubstring('exact'), { equal: 'exact' });
  assert.equal(cnOf('CN=Ivanov\\, Ivan,OU=Users,DC=corp'), 'Ivanov, Ivan');
  assert.equal(domainRoot('OU=Accounts,DC=whitehills,DC=kg'), 'DC=whitehills,DC=kg');
  // S-1-5-21-1-2-3-1105
  const sid = Buffer.from([1, 5, 0, 0, 0, 0, 0, 5, 21, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0x51, 0x04, 0, 0]);
  assert.equal(sidToString(sid), 'S-1-5-21-1-2-3-1105');
  assert.equal(sidToString(Buffer.from([1])), null);
  assert.equal(objectKind(['top', 'person', 'organizationalPerson', 'user', 'computer']), 'computer');
  assert.equal(objectKind(['top', 'person', 'organizationalPerson', 'user']), 'user');
  assert.equal(objectKind(['top', 'group']), 'group');
  assert.equal(isDisabled('514'), true);
  assert.equal(isDisabled(['512']), false);
});

test('access settings are sanitised, live in the File server settings and are off by default', () => {
  const next = sanitizeDriveAccess(DRIVE_ACCESS_DEFAULTS, {
    prefix: 'SG_',
    projects: ['co', 'PRB2', 'bad code'],
    defaultProject: 'xx',
    nameTemplate: '{org}_{name}',
    newGroupOu: 'OU=Groups,OU=CO,DC=corp,DC=kg',
    groupsBase: 'not a dn',
    groupOus: ['OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru', 'nonsense'],
    typeMap: { full: 'full_control', read: 'everything' },
    protectedGroups: ['sg_*_root_*', '*', 'bad pattern!'],
    driveMap: [{ letter: 'W', shareId: 1 }],
  });
  assert.equal(next.prefix, 'sg_');
  assert.deepEqual(next.projects, ['co', 'prb2']);
  assert.equal(next.defaultProject, 'xx');
  assert.equal(next.nameTemplate, DRIVE_ACCESS_DEFAULTS.nameTemplate);
  assert.equal(next.newGroupOu, 'OU=Groups,OU=CO,DC=corp,DC=kg');
  assert.equal(next.groupsBase, '');
  assert.deepEqual(next.groupOus, ['OU=Groups,OU=ПРБ-2,OU=Accounts,DC=gescons,DC=ru']);
  assert.deepEqual(next.typeMap, { full: 'full_control', read: 'read_execute' });
  assert.deepEqual(next.protectedGroups, ['sg_*_root_*']);
  assert.equal(next.driveMap, undefined);
  assert.equal(resolveModules({}).drive.settings.access.enabled, false);
  assert.equal(resolveModules({}).folderaccess, undefined);
  const modules = sanitizeModules(resolveModules({}), { drive: { enabled: true, settings: { access: { enabled: true, defaultProject: 'co' } } } });
  assert.equal(modules.drive.settings.access.enabled, true);
  assert.equal(modules.drive.settings.access.defaultProject, 'co');
  assert.equal(modules.drive.settings.access.prefix, 'sg_');
  // A stored block missing new keys gets the defaults.
  assert.deepEqual(resolveModules({ drive: { settings: { access: { enabled: true } } } }).drive.settings.access.groupOus, []);
  assert.ok(MODULE_CATALOG.find((module) => module.id === 'drive').permissions.includes('drive.access'));
});

// ── who may do what ──────────────────────────────────────────────────────────

const sg = (name, extra = {}) => describeGroup({ dn: `CN=${name},OU=G`, name, description: extra.description ?? 'W:\\06-HR;Full Access' }, SETTINGS);

test('roles: superadmin, system administrator, nobody; impersonation and tokens', () => {
  assert.deepEqual(accessOf({ permissions: ['*'] }), { role: 'superadmin', canWrite: true, readOnly: null });
  assert.deepEqual(accessOf({ permissions: ['drive.access'] }), { role: 'sysadmin', canWrite: true, readOnly: null });
  assert.equal(accessOf({ permissions: ['drive.admin'] }).role, null);
  assert.deepEqual(accessOf({ permissions: ['*'], impersonating: true }), { role: 'superadmin', canWrite: false, readOnly: 'impersonation' });
  assert.equal(accessOf({ permissions: ['*'], apiToken: true }).role, null);
  assert.throws(() => requireWrite(accessOf({ permissions: ['*'], impersonating: true })), { code: 'IMPERSONATION_LIMIT' });
  assert.throws(() => requireWrite(accessOf({ permissions: [] })), { code: 'FORBIDDEN' });
  assert.throws(() => requireSuperadmin(accessOf({ permissions: ['drive.access'] })), { code: 'FA_SUPERADMIN_ONLY' });
  assert.doesNotThrow(() => requireSuperadmin(accessOf({ permissions: ['*'] })));
});

test('system administrators: no root, no foreign groups, only people', () => {
  const hr = sg('sg_co_hr_full');
  const root = sg('sg_co_root_full', { description: 'W:;Full Access' });
  const other = describeGroup({ dn: 'CN=nextcloud_users', name: 'nextcloud_users', description: '' }, SETTINGS);
  assert.equal(groupRefusal('sysadmin', hr), null);
  assert.equal(groupRefusal('sysadmin', root), 'FA_GROUP_PROTECTED');
  assert.equal(groupRefusal('sysadmin', other), 'FA_GROUP_NOT_ALLOWED');
  assert.equal(groupRefusal('sysadmin', null), 'FA_GROUP_NOT_FOUND');
  assert.equal(groupRefusal('superadmin', root), null);
  assert.equal(groupRefusal('superadmin', other), null);
  assert.equal(groupRefusal(null, hr), 'FORBIDDEN');
  assert.equal(groupVisible('sysadmin', other), false);
  assert.equal(groupVisible('superadmin', other), true);
  assert.equal(memberRefusal('sysadmin', { kind: 'user' }), null);
  for (const kind of ['group', 'computer', 'contact', 'foreign']) assert.equal(memberRefusal('sysadmin', { kind }), 'FA_ONLY_USERS', kind);
  assert.equal(memberRefusal('superadmin', { kind: 'group' }), null);
  assert.equal(memberRefusal('superadmin', { kind: 'contact' }), 'FA_MEMBER_KIND');
  assert.equal(memberRefusal('sysadmin', null), 'FA_MEMBER_NOT_FOUND');
  assert.throws(() => assertMemberAdd('sysadmin', root, { kind: 'user' }), { code: 'FA_GROUP_PROTECTED', statusCode: 403 });
  assert.throws(() => assertMemberAdd('sysadmin', hr, { kind: 'computer' }), { code: 'FA_ONLY_USERS' });
  assert.deepEqual(journalKinds('sysadmin'), ['membership']);
  assert.equal(journalKinds('superadmin'), null);
});

test('undo: membership only, once, own changes for system administrators', () => {
  const row = { id: 7, action: 'member_add', ok: true, outcome: 'changed', user_id: 5, undone_by: null, group_dn: 'G', member_dn: 'M' };
  assert.equal(undoRefusal('sysadmin', 5, row), null);
  assert.equal(undoRefusal('sysadmin', 6, row), 'FA_UNDO_NOT_OWN');
  assert.equal(undoRefusal('superadmin', 6, row), null);
  assert.equal(undoRefusal('superadmin', 5, { ...row, undone_by: 9 }), 'FA_UNDO_DONE');
  assert.equal(undoRefusal('superadmin', 5, { ...row, outcome: 'unchanged' }), 'FA_UNDO_NOTHING');
  assert.equal(undoRefusal('superadmin', 5, { ...row, ok: false, outcome: 'failed' }), 'FA_UNDO_NOTHING');
  assert.equal(undoRefusal('superadmin', 5, { ...row, action: 'group_delete' }), 'FA_UNDO_UNSUPPORTED');
  assert.equal(undoRefusal('superadmin', 5, null), 'NOT_FOUND');
  assert.deepEqual(inverseOf(row), { action: 'member_remove', groupDn: 'G', memberDn: 'M' });
  assert.deepEqual(inverseOf({ ...row, action: 'member_remove' }), { action: 'member_add', groupDn: 'G', memberDn: 'M' });
  const move = { ...row, action: 'member_move', to_group_dn: 'T', before: { inFrom: true, inTo: false } };
  assert.deepEqual(inverseOf(move), { action: 'member_move', groupDn: 'T', toGroupDn: 'G', memberDn: 'M' });
  assert.deepEqual(inverseOf({ ...move, before: { inFrom: true, inTo: true } }), { action: 'member_add', groupDn: 'G', memberDn: 'M' });
  assert.deepEqual(inverseOf({ ...move, before: { inFrom: false, inTo: false } }), { action: 'member_remove', groupDn: 'T', memberDn: 'M' });
  assert.equal(kindOf('member_move'), 'membership');
  assert.equal(kindOf('group_create'), 'group');
});

test('journal filters keep system administrators to membership changes', () => {
  const limited = journalFilter({ actions: 'member_add,bogus', result: 'failed', group: 'hr_%' }, ['membership']);
  assert.match(limited.sql, /j\.kind = ANY\(\$1\)/);
  assert.deepEqual(limited.params[0], ['membership']);
  assert.deepEqual(limited.params[1], ['member_add']);
  assert.match(limited.sql, /j\.ok = FALSE/);
  assert.equal(limited.params[2], '%hr\\_\\%%');
  assert.equal(journalFilter({}, null).sql, '');
  const mine = journalFilter({ mine: '1', viewer: 4 }, null);
  assert.deepEqual(mine.params, [4]);
});

// ── credentials ──────────────────────────────────────────────────────────────

test('credential resolution: linked account, saved password, parked, unreadable', () => {
  const user = { auth_source: 'ldap', external_id: 'CN=Admin,OU=IT,DC=corp' };
  const open = (secret) => (secret === 'sealed' ? 'pw' : null);
  assert.equal(resolveCredential({ auth_source: 'local', external_id: null }, null, open).state, 'not_linked');
  assert.equal(resolveCredential(null, null, open).state, 'not_linked');
  assert.deepEqual(resolveCredential(user, null, open), { state: 'missing', dn: user.external_id, row: null });
  const row = { id: 1, secret: 'sealed', status: 'ok' };
  const ok = resolveCredential(user, row, open);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.password, 'pw');
  assert.equal(ok.dn, user.external_id);
  assert.equal(resolveCredential(user, { ...row, status: 'ACCOUNT_LOCKED' }, open).state, 'failed');
  assert.equal(resolveCredential(user, { ...row, secret: 'garbled' }, open).state, 'unreadable');
  assert.equal(credentialProblem({ state: 'ok' }), null);
  assert.equal(credentialProblem({ state: 'not_linked' }).code, 'FA_NOT_LINKED');
  assert.equal(credentialProblem({ state: 'missing' }).code, 'FA_CREDENTIALS_REQUIRED');
  assert.equal(credentialProblem({ state: 'unreadable' }).code, 'FA_CREDENTIALS_REQUIRED');
  const failed = credentialProblem({ state: 'failed', reason: 'ACCOUNT_LOCKED' });
  assert.equal(failed.code, 'FA_CREDENTIALS_FAILED');
  assert.equal(failed.statusCode, 403);
  assert.deepEqual(failed.details, { reason: 'ACCOUNT_LOCKED' });
});

test('binds as the acting administrator; a rejected password says why', async () => {
  const cfg = { host: 'dc', baseDn: 'DC=corp' };
  const client = mockClient();
  setClientFactory(() => client);
  try {
    const result = await withActor(cfg, { dn: 'CN=Admin,DC=corp', password: 'pw' }, async (c) => {
      await addMember(c, 'CN=G', 'CN=U');
      return 'done';
    });
    assert.equal(result, 'done');
    assert.deepEqual(client.calls[0], ['bind', 'CN=Admin,DC=corp']);
    assert.deepEqual(client.calls.at(-1), ['unbind']);

    const locked = mockClient({ bind: () => ldapError(49, '80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 775, v4563') });
    setClientFactory(() => locked);
    await assert.rejects(withActor(cfg, { dn: 'CN=Admin', password: 'old' }, async () => 'never'), (err) => err.code === 'FA_CREDENTIALS_FAILED' && err.details.reason === 'ACCOUNT_LOCKED');
    assert.deepEqual(locked.calls.at(-1), ['unbind']);
    await assert.rejects(withActor(cfg, { dn: 'CN=Admin', password: '' }, async () => 'never'), { code: 'FA_CREDENTIALS_REQUIRED' });

    const wrong = mockClient({ bind: () => ldapError(49, 'data 52e') });
    setClientFactory(() => wrong);
    assert.deepEqual(await verifyBind(cfg, 'CN=Admin', 'x'), { ok: false, reason: 'AUTH_FAILED' });
    setClientFactory(() => mockClient());
    assert.deepEqual(await verifyBind(cfg, 'CN=Admin', 'x'), { ok: true });
    const down = mockClient({ bind: () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
    setClientFactory(() => down);
    await assert.rejects(verifyBind(cfg, 'CN=Admin', 'x'), { code: 'FA_AD_UNAVAILABLE' });
  } finally {
    setClientFactory(null);
  }
  assert.equal(bindFailureCode({ message: 'data 533' }), 'ACCOUNT_DISABLED');
  assert.equal(bindFailureCode({ message: 'data 532' }), 'PASSWORD_EXPIRED');
});

// ── the LDAP write layer ─────────────────────────────────────────────────────

test('membership changes are idempotent', async () => {
  const client = mockClient({
    modify: {
      'add:CN=Has': ldapError(68, '00000562: UpdErr: DSID-031A11C4, problem 6005 (ENTRY_EXISTS), data 0'),
      'add:CN=HasAD53': ldapError(53, '00000562: SvcErr: WILL_NOT_PERFORM'),
      'delete:CN=Not': ldapError(53, '00000561: SvcErr: DSID-031A1254, problem 5003 (WILL_NOT_PERFORM), data 0'),
      'delete:CN=Not16': ldapError(16, 'no such attribute'),
      'add:CN=Denied': ldapError(50, '00002098: SecErr: DSID-03150F94, problem 4003 (INSUFF_ACCESS_RIGHTS)'),
      'delete:CN=Refused': ldapError(53, '0000209A: SvcErr: something else'),
    },
  });
  assert.equal(await addMember(client, 'CN=G', 'CN=U'), 'added');
  assert.deepEqual(client.calls[0], ['modify', 'add', 'CN=G', 'CN=U']);
  assert.equal(await addMember(client, 'CN=Has', 'CN=U'), 'unchanged');
  assert.equal(await addMember(client, 'CN=HasAD53', 'CN=U'), 'unchanged');
  assert.equal(await removeMember(client, 'CN=G', 'CN=U'), 'removed');
  assert.equal(await removeMember(client, 'CN=Not', 'CN=U'), 'unchanged');
  assert.equal(await removeMember(client, 'CN=Not16', 'CN=U'), 'unchanged');
  await assert.rejects(addMember(client, 'CN=Denied', 'CN=U'), { code: 50 });
  await assert.rejects(removeMember(client, 'CN=Refused', 'CN=U'), { code: 53 });
  assert.equal(adError(ldapError(50)).code, 'FA_AD_DENIED');
  assert.equal(adError(ldapError(50)).statusCode, 403);
  assert.equal(adError(ldapError(32)).code, 'FA_AD_NOT_FOUND');
  assert.equal(adError(new Error('socket hang up')).code, 'FA_AD_UNAVAILABLE');
});

test('move = add to the new group, then remove from the old one, with rollback', async () => {
  const ok = mockClient();
  assert.deepEqual(await moveMember(ok, 'CN=Read', 'CN=Full', 'CN=U'), { added: 'added', removed: 'removed' });
  assert.deepEqual(
    ok.calls.map((call) => call.slice(0, 3)),
    [
      ['modify', 'add', 'CN=Full'],
      ['modify', 'delete', 'CN=Read'],
    ]
  );

  // Removal refused: the addition is taken back, the error says so.
  const refused = mockClient({ modify: { 'delete:CN=Read': ldapError(50) } });
  await assert.rejects(moveMember(refused, 'CN=Read', 'CN=Full', 'CN=U'), (err) => err.code === 50 && err.rolledBack === true);
  assert.deepEqual(refused.calls.at(-1), ['modify', 'delete', 'CN=Full', 'CN=U']);

  // Already in the target: nothing to roll back (the person stays where they were).
  const already = mockClient({ modify: { 'add:CN=Full': ldapError(68), 'delete:CN=Read': ldapError(50) } });
  await assert.rejects(moveMember(already, 'CN=Read', 'CN=Full', 'CN=U'), (err) => err.rolledBack === true);
  assert.equal(already.calls.filter((call) => call[1] === 'delete').length, 1);

  // Rollback itself fails: reported, so the UI can warn that the person is in both groups.
  let deletes = 0;
  const stuck = mockClient({ modify: { 'delete:CN=Read': ldapError(50), 'delete:CN=Full': () => (deletes++, ldapError(51)) } });
  await assert.rejects(moveMember(stuck, 'CN=Read', 'CN=Full', 'CN=U'), (err) => err.rolledBack === false);
  assert.equal(deletes, 1);

  // Adding refused: nothing removed.
  const denied = mockClient({ modify: { 'add:CN=Full': ldapError(50) } });
  await assert.rejects(moveMember(denied, 'CN=Read', 'CN=Full', 'CN=U'), { code: 50 });
  assert.equal(denied.calls.length, 1);
});

test('creating a group pair rolls back the first group when the second fails', async () => {
  const pair = [
    { name: 'sg_co_legal_full', description: 'W:\\07-LEGAL;Full Access' },
    { name: 'sg_co_legal_read', description: 'W:\\07-LEGAL;Read Only' },
  ];
  const ok = mockClient();
  const dns = await createGroups(ok, 'OU=Groups,DC=corp', pair);
  assert.deepEqual(dns, ['CN=sg_co_legal_full,OU=Groups,DC=corp', 'CN=sg_co_legal_read,OU=Groups,DC=corp']);
  assert.equal(ok.calls[0][2].groupType, '-2147483646');
  assert.equal(ok.calls[0][2].sAMAccountName, 'sg_co_legal_full');
  assert.equal(ok.calls[1][2].description, 'W:\\07-LEGAL;Read Only');
  const failing = mockClient({ add: { 'CN=sg_co_legal_read,OU=Groups,DC=corp': ldapError(50) } });
  await assert.rejects(createGroups(failing, 'OU=Groups,DC=corp', pair), (err) => err.rolledBack === true);
  assert.deepEqual(failing.calls.at(-1), ['del', 'CN=sg_co_legal_full,OU=Groups,DC=corp']);
});

test('ranged member retrieval follows AD ranges past 1500 values', async () => {
  const first = Array.from({ length: 1500 }, (_, i) => `CN=u${i}`);
  const client = mockClient({
    search: (base, options) => {
      const [attr] = options.attributes;
      if (attr === 'member;range=1500-*') return { searchEntries: [{ dn: base, 'member;range=1500-2999': Array.from({ length: 1500 }, (_, i) => `CN=u${1500 + i}`) }] };
      if (attr === 'member;range=3000-*') return { searchEntries: [{ dn: base, 'member;range=3000-*': ['CN=last'] }] };
      return { searchEntries: [] };
    },
  });
  const values = await rangedValues(client, { dn: 'CN=Big', 'member;range=0-1499': first }, 'member');
  assert.equal(values.length, 3001);
  assert.equal(values.at(-1), 'CN=last');
  assert.deepEqual(await rangedValues(client, { dn: 'CN=Small', member: 'CN=one' }, 'member'), ['CN=one']);
  assert.deepEqual(await rangedValues(client, { dn: 'CN=Empty' }, 'member'), []);
});

test('each membership change is journalled with its result', async () => {
  const rows = [];
  const record = async (actor, entry) => {
    rows.push({ actor, ...entry });
    return rows.length;
  };
  const actor = { userId: 1, adAccount: 'admin' };
  const group = { dn: 'CN=Full', name: 'sg_co_hr_full' };
  const toGroup = { dn: 'CN=Read', name: 'sg_co_hr_read' };
  const member = { dn: 'CN=U', name: 'Ivan', login: 'ivan' };
  const client = mockClient({ modify: { 'add:CN=Denied': ldapError(50), 'delete:CN=Full': ldapError(50) } });

  const added = await applyMembership(client, actor, { action: 'member_add', group, member }, record);
  assert.deepEqual([added.ok, added.outcome, added.journalId], [true, 'changed', 1]);
  assert.deepEqual(rows[0].before, { member: false });
  assert.equal(rows[0].member.login, 'ivan');

  const denied = await applyMembership(client, actor, { action: 'member_add', group: { dn: 'CN=Denied', name: 'x' }, member }, record);
  assert.deepEqual([denied.ok, denied.code, denied.outcome], [false, 'FA_AD_DENIED', 'failed']);
  assert.equal(rows[1].ok, false);
  assert.equal(rows[1].errorCode, 'FA_AD_DENIED');

  const moved = await applyMembership(client, actor, { action: 'member_move', group, toGroup, member }, record);
  assert.deepEqual([moved.ok, moved.outcome, moved.rolledBack], [false, 'rolled_back', true]);
  assert.equal(rows[2].toGroup.name, 'sg_co_hr_read');
});

test('the NTFS hook is pending until the engine registers', async () => {
  assert.deepEqual(await attachGroupsToNtfs({}), { status: 'pending', code: 'FA_NTFS_NOT_AVAILABLE' });
  registerNtfsAttach(async (input) => ({ status: 'applied', got: input.groups.length }));
  assert.deepEqual(await attachGroupsToNtfs({ groups: [1, 2] }), { status: 'applied', got: 2 });
  registerNtfsAttach(async () => {
    throw Object.assign(new Error('denied'), { code: 'ACCESS_DENIED' });
  });
  assert.equal((await attachGroupsToNtfs({})).status, 'failed');
  registerNtfsAttach(null);
});

test('project aliases: pairs under the White Hills root (sg_wh_root_*) are offered as co', () => {
  const ou = 'OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg';
  const settings = { ...SETTINGS, projects: ['co', 'wh'], defaultProject: 'co', projectAliases: { wh: 'co' }, newGroupOu: ou, bases: ['OU=Accounts,DC=whitehills,DC=kg'] };
  const folders = buildFolders([
    describeGroup({ dn: `CN=sg_wh_root_full,${ou}`, name: 'sg_wh_root_full', description: 'W:;Full Access' }, settings),
    describeGroup({ dn: `CN=sg_wh_hr_full,${ou}`, name: 'sg_wh_hr_full', description: 'W:\\06-HR;Full Access' }, settings),
  ]);
  const plan = creationPlan(settings, folders, 'W:\\07-LEGAL');
  assert.deepEqual([plan.code, plan.derivedCode, plan.ou, plan.project, plan.source, plan.fromPath], ['co', 'wh', ou, 'CO', 'folder', 'W:']);
  assert.equal(creationPlan(settings, folders, 'W:\\06-HR\\Архив').code, 'co');
  // No aliases: the derived code as before.
  assert.equal(creationPlan({ ...settings, projectAliases: {} }, folders, 'W:\\07-LEGAL').code, 'wh');
  assert.equal(aliasCode({ projectAliases: { wh: 'co' } }, 'WH'), 'co');
  assert.equal(aliasCode({ projectAliases: { wh: 'co' } }, 'prb2'), 'prb2');
  assert.equal(aliasCode({}, ''), null);
  assert.equal(aliasCode({ projectAliases: {} }, 'constructor'), 'constructor');
});

test('project aliases are cleaned: valid codes only, no self-maps; text lists accepted', () => {
  assert.deepEqual(sanitizeProjectAliases({ WH: 'co', co: 'co', 'bad code': 'x', __proto__: { a: 'b' }, x: '' }), { wh: 'co' });
  assert.deepEqual(sanitizeProjectAliases('wh=co\nold → new, a:b'), { wh: 'co', old: 'new', a: 'b' });
  assert.deepEqual(sanitizeProjectAliases([{ from: 'wh', to: 'co' }, ['x', 'y']]), { wh: 'co', x: 'y' });
  assert.deepEqual(sanitizeProjectAliases(null), {});
  assert.deepEqual(sanitizeDriveAccess(DRIVE_ACCESS_DEFAULTS, { projectAliases: { wh: 'co' } }).projectAliases, { wh: 'co' });
  assert.deepEqual(sanitizeDriveAccess(DRIVE_ACCESS_DEFAULTS, {}).projectAliases, {});
});

test('the Files module settings take no access block (only the File server has one)', () => {
  const files = MODULE_CATALOG.find((module) => module.id === 'files');
  const next = files.sanitize({ ...files.defaults }, { access: { enabled: true, prefix: 'x_' }, trashDays: 7 });
  assert.equal(next.access, undefined);
  assert.equal(next.trashDays, 7);
  const stored = sanitizeModules(resolveModules({}), { files: { settings: { access: { enabled: true } } }, drive: { settings: { access: { enabled: true } } } });
  assert.equal(stored.files.settings.access, undefined);
  assert.equal(stored.drive.settings.access.enabled, true);
});
