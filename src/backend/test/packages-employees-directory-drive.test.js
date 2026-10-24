import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * Employees, the AD directory and the File server are module packages (docs/module-packages.md «Converting a
 * module», batch 4): the core no longer lists them anywhere, each builds into a package with the facts it had
 * while built in, their settings moved into the packages; the AD directory reads employee cards through the
 * Employees API (not its tables), the core reads the stored domain password through a hook (not
 * drive_credentials), the File server's gateway ships as Python files inside its package, and a public page
 * of a package (/d/<token>) gets that package in an anonymous visitor's shell list.
 * End to end: make package-check ID=employees|directory|drive (docs/package-testing.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const FRONT = join(ROOT, 'src/frontend/src');
const IDS = ['employees', 'directory', 'drive'];
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const moduleJson = (id) => JSON.parse(read(`src/backend/modules/${id}/module.json`));

test('core without them: not in MODULES, the manifest, the catalog; listed as package modules', async () => {
  const { MODULES } = await import('../modules/index.js');
  const { MODULE_CATALOG, BUILTIN_MODULE_IDS } = await import('../modules/catalog.js');
  const { MODULE_MANIFEST, BUILTIN_MANIFEST_IDS, PACKAGE_MODULE_IDS, validateManifests } = await import('../modules/manifest.js');
  for (const id of IDS) {
    assert.ok(!MODULES.some((module) => module.id === id), `${id} in MODULES`);
    assert.ok(!MODULE_CATALOG.some((module) => module.id === id), `${id} in the catalog`);
    assert.ok(!BUILTIN_MODULE_IDS.includes(id) && !BUILTIN_MANIFEST_IDS.includes(id), `${id} built in`);
    assert.ok(!MODULE_MANIFEST[id], `${id} in the manifest`);
    assert.ok(PACKAGE_MODULE_IDS.includes(id), `${id} in PACKAGE_MODULE_IDS`);
  }
  // The dashboard, Tasks and the org structure keep naming them in `enhances`.
  assert.deepEqual(validateManifests(MODULE_MANIFEST), []);
  assert.doesNotMatch(read('src/backend/modules/catalog.js'), /DRIVE_ACCESS_DEFAULTS|sanitizeDriveAccess|EMPLOYEES_DEFAULTS|sanitizeEmployees|DIRECTORY_DEFAULTS|sanitizeDirectory/);
});

test('core without them: the browser shell lists none of them; texts and tours in the modules; shared core files exposed', async () => {
  const registry = read('src/frontend/src/modules/registry.js');
  for (const id of IDS) {
    assert.doesNotMatch(registry, new RegExp(`id: '${id}'`), `${id} in modules/registry.js`);
    assert.match(registry, new RegExp(`'!\\./${id}/register\\.js'`), `${id}/register.js left out of the core glob`);
    assert.doesNotMatch(read('src/frontend/src/admin/navigation.js'), new RegExp(`id: '${id}',`), `${id} in admin/navigation.js`);
    assert.doesNotMatch(read('src/frontend/src/modules/manifest.js'), new RegExp(`^  ${id}: \\{`, 'm'), `${id} in MODULE_UI`);
    assert.match(readFileSync(join(FRONT, `modules/${id}/index.js`), 'utf8'), /import '\.\/register'/);
    assert.match(read(`src/frontend/src/modules/${id}/register.js`), /registerTour\(/);
  }
  assert.ok(!existsSync(join(FRONT, 'tour/content/drive.js')), 'the File server tour is in its package');
  for (const [id, ns] of [['employees', 'emp'], ['directory', 'directory'], ['drive', 'driveActivity'], ['drive', 'folderAccess']]) {
    for (const lang of ['en', 'ru', 'ky', 'tr', 'zh']) {
      assert.ok(!existsSync(join(FRONT, `locales/${lang}/${ns}.js`)), `core locales/${lang}/${ns}.js`);
      assert.ok(existsSync(join(FRONT, `modules/${id}/locales/${lang}/${ns}.js`)), `modules/${id}/locales/${lang}/${ns}.js`);
    }
  }
  // Files (core) still uses a few drive / driveSettings texts: those namespaces stay in the core, copied into the package.
  for (const ns of ['drive', 'driveSettings']) assert.ok(existsSync(join(FRONT, `locales/en/${ns}.js`)), `core ${ns}`);
  assert.deepEqual(moduleJson('drive').locales, ['drive', 'driveSettings']);
  const { EXPOSED_CORE } = await import(pathToFileURL(join(FRONT, 'platform/sdk/exposed.js')).href);
  for (const path of ['components/documents/viewers/DocumentViewer', 'components/filekit/UploadButton', 'components/filekit/folderUpload', 'lib/clipboard', 'modules/office/OfficeEditor', 'modules/org/public', 'modules/org/public/OrgChart']) {
    assert.ok(EXPOSED_CORE.includes(path), path);
  }
  // The public link page: drawn by the package for anonymous visitors (manifest web.publicPaths).
  assert.deepEqual(moduleJson('drive').web.publicPaths, ['/d/']);
  assert.match(read('src/frontend/src/modules/drive/register.js'), /contribute\('app\.publicRoutes', \{ id: 'drive\.link', path: '\/d\/:token'/);
});

test('core without them: sources stay out of the image; table and permission prefixes and «removed» rows declared', async () => {
  const ignore = read('.dockerignore').split('\n');
  for (const id of IDS) {
    assert.ok(ignore.includes(`src/backend/modules/${id}`) && ignore.includes(`src/frontend/src/modules/${id}`), `${id} in .dockerignore`);
  }
  // The image keeps the runtime of the File server's gateway (the package ships only the .py files).
  assert.match(read('Dockerfile'), /python3 py3-cryptography py3-pillow/);
  assert.match(read('Dockerfile'), /smbprotocol==/);
  assert.match(read('Dockerfile'), /dwg2dxf/);
  const { MODULE_TABLES, MODULE_PERMISSION_PREFIXES, ownsPermission, tablePatternProblem } = await import('../platform/packages/tableOwnership.js');
  const { CONVERTED_MODULES } = await import('../platform/packages/loader.js');
  const tables = { employees: ['employees', 'emp_%'], directory: ['ad_%'], drive: ['drive_%'] };
  for (const id of IDS) {
    const manifest = moduleJson(id);
    assert.deepEqual(manifest.tables, tables[id]);
    for (const pattern of manifest.tables) assert.equal(tablePatternProblem(id, pattern), null, `${id} ${pattern}`);
    for (const permission of manifest.permissions) assert.ok(ownsPermission(id, permission), `${id} ${permission}`);
    assert.equal(CONVERTED_MODULES[id].version, '1.0.0');
    assert.equal(CONVERTED_MODULES[id].name.ru, manifest.name.ru);
    assert.equal(manifest.version, '1.1.0');
  }
  assert.deepEqual(MODULE_TABLES.employees, ['emp_', 'employees']);
  // The AD directory's rights were always ad.*: a legacy permission prefix the core declares for it.
  assert.deepEqual(MODULE_PERMISSION_PREFIXES.directory, ['ad']);
  assert.equal(ownsPermission('crm', 'ad.view'), false);
  assert.equal(ownsPermission('directory', 'drive.admin'), false);
  // The id "ad" is reserved (the directory's legacy prefix): no package with it, and ad.* stays the directory's.
  assert.equal(ownsPermission('ad', 'ad.view'), false);
  assert.equal(ownsPermission('directory', 'ad.view'), true);
  const { normalizeManifest } = await import('../platform/packages/manifestFile.js');
  const { CATEGORIES, INTEGRATIONS } = await import('../modules/manifest.js');
  const ad = normalizeManifest({ id: 'ad', name: { en: 'AD', ru: 'AD' }, version: '1.0.0', core: '1.0.0', category: CATEGORIES[0], permissions: ['ad.view'] }, { categories: CATEGORIES, integrations: INTEGRATIONS });
  assert.ok(ad.problems.some((problem) => /id "ad" is reserved/.test(problem)), ad.problems.join('; '));
  assert.ok(ad.problems.some((problem) => /permission "ad.view"/.test(problem)), ad.problems.join('; '));
});

test('module.json + settings.js: the facts the built-in modules had', async () => {
  const { sourcePackage } = await import('./helpers/modules.js');
  const { MODULE_CATALOG, resolveModules, sanitizeModules } = await import('../modules/catalog.js');
  for (const id of IDS) {
    const module = await sourcePackage(id);
    assert.equal(module.id, id);
    assert.deepEqual(module.migrations.map((migration) => migration.id), ['001_init'], `${id}: migration 001`);
    assert.equal(MODULE_CATALOG.find((entry) => entry.id === id).sanitize, module.sanitizeSettings);
    assert.equal(resolveModules({})[id].enabled, false, `${id} off by default`);
  }
  const catalog = (id) => MODULE_CATALOG.find((entry) => entry.id === id);
  assert.deepEqual(catalog('employees').permissions, ['employees.view', 'employees.hr', 'employees.admin']);
  assert.deepEqual(catalog('directory').permissions, ['ad.view', 'ad.manage', 'ad.passwords', 'ad.admin']);
  assert.deepEqual(catalog('drive').permissions, ['drive.admin', 'drive.audit', 'drive.access']);
  assert.deepEqual(moduleJson('employees').requires.map((link) => link.id), ['org']);
  assert.deepEqual(moduleJson('directory').requires.map((link) => link.integration), ['activeDirectory']);
  assert.equal(moduleJson('directory').requires[0].demo, true);
  assert.deepEqual(moduleJson('drive').requires, []);
  assert.deepEqual(moduleJson('directory').enhances.map((link) => link.id), ['employees', 'drive']);
  // The File server's nested access block: defaults merged on read (upgradeSettings), sanitized on save.
  assert.equal(catalog('drive').upgrade, (await sourcePackage('drive')).upgradeSettings);
  const drive = resolveModules({ drive: { settings: { access: { prefix: 'xx_' } } } }).drive.settings;
  assert.equal(drive.access.prefix, 'xx_');
  assert.deepEqual(drive.access.typeMap, { full: 'modify', read: 'read_execute' });
  const saved = sanitizeModules(resolveModules({}), { drive: { settings: { title: ' Disk <x> ', access: { prefix: 'BAD PREFIX', projects: ['co', 'bad code'] } } } }).drive.settings;
  assert.equal(saved.title, 'Disk x');
  assert.equal(saved.access.prefix, 'sg_');
  assert.deepEqual(saved.access.projects, ['co']);
  assert.equal(resolveModules({}).employees.settings.birthdays, 'all');
  assert.equal(resolveModules({}).directory.settings.loginTemplate, '{f}.{last}');
});

test('register(ctx): providers, hooks and jobs are registered there, not at import; migration 001 through `db`', () => {
  for (const id of IDS) {
    const index = read(`src/backend/modules/${id}/index.js`);
    assert.doesNotMatch(index.split('export default')[0], /^\s*(register\w+|on\w+|provide\w+)\(/m, `${id}: nothing registered at import`);
    const schema = read(`src/backend/modules/${id}/schema.js`);
    const migration = schema.slice(schema.indexOf('export async function create'), schema.indexOf('/** The schema outside a package install'));
    assert.doesNotMatch(migration, /registerJob|onDirectory|\.catch\(/, `${id}: migration 001 registers nothing and swallows no error`);
    assert.doesNotMatch(migration, /REFERENCES (?!users\(|org_units\(|emp_|employees\(|ad_|drive_)/, `${id}: no foreign keys into other modules' tables`);
  }
  assert.match(read('src/backend/modules/employees/index.js'), /register\(ctx\) \{[\s\S]*registerPeopleProvider\(peopleProvider\);[\s\S]*startEmployees\(\);/);
  assert.match(read('src/backend/modules/drive/index.js'), /register\(ctx\) \{[\s\S]*onDirectorySignIn\(rememberLoginCredential\);[\s\S]*onDirectoryCredential\(storeDirectoryCredential\);[\s\S]*provideDirectoryCredentialInfo\(credentialInfo\);[\s\S]*registerOfficeProvider\(\);/);
  // The former «Доступ к папкам» module: moved in migration 001 on the migration's transaction (savepoints), retried by a job.
  const schema = read('src/backend/modules/drive/schema.js');
  assert.match(schema, /migrateFolderAccess\(\{ transaction: \(fn\) => inSavepoint\(db, fn\)/);
  assert.match(schema, /ensureSlugSchema\('drive', db\)/);
  assert.match(schema, /ensureJournalTable\(db\)/);
  assert.match(read('src/backend/modules/drive/index.js'), /registerJob\(\{ name: 'drive:folderaccess'/);
});

test('no raw SQL on other packages: the directory through the Employees API, the core through hooks', () => {
  for (const name of ['service', 'routes', 'ldap', 'employeeSection', 'driveLink', 'employeesLink']) {
    const text = read(`src/backend/modules/directory/${name}.js`);
    assert.doesNotMatch(text, /\b(FROM|UPDATE|JOIN|INTO)\s+(employees|emp_\w+|drive_\w+)\b/, `directory/${name}.js queries another module's tables`);
  }
  // The demo directory (demo data only) touches employee cards behind a table check.
  const demo = read('src/backend/modules/directory/demo.js');
  assert.match(demo, /to_regclass\('employees'\)/);
  assert.match(read('src/backend/modules/employees/api.js'), /cardsForAdAccounts, clearAdAccount, findCardsByName, setAdAccount/);
  // The core: no drive_credentials in services/userLinks.js, the hook instead.
  const links = read('src/backend/services/userLinks.js');
  assert.doesNotMatch(links, /drive_credentials/);
  assert.match(links, /directoryCredentialInfo/);
  for (const name of ['credentials', 'servers', 'links']) assert.doesNotMatch(read(`src/backend/modules/drive/${name}.js`), /services\/crypto\.js|config\/app\.js/, `drive/${name}.js imports a sensitive core file`);
  assert.doesNotMatch(read('src/backend/modules/drive/access/credentials.js'), /from '\.\.\/\.\.\/\.\.\/services\/crypto\.js'/);
});

test('core hooks: the stored domain password answers through the File server, null without it', async () => {
  const { directoryCredentialInfo, provideDirectoryCredentialInfo } = await import('../services/hooks.js');
  assert.equal(await directoryCredentialInfo(5), null);
  const off = provideDirectoryCredentialInfo(async (userId) => ({ username: `u${userId}`, source: 'login', status: 'ok' }));
  assert.deepEqual(await directoryCredentialInfo(5), { username: 'u5', source: 'login', status: 'ok' });
  provideDirectoryCredentialInfo(async () => {
    throw new Error('table missing');
  });
  assert.equal(await directoryCredentialInfo(5), null, 'a failing provider answers null');
  off();
  provideDirectoryCredentialInfo(null);
  assert.equal(await directoryCredentialInfo(5), null);
});

test('module tokens: the same key the File server used while built in (visitor sessions keep working)', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const config = (await import('../config/app.js')).default;
  const { moduleTokens } = await import('../services/secrets.js');
  const drive = moduleTokens('drive');
  const old = jwt.sign({ lid: 3, v: 1, s: 'r' }, `${config.auth.jwtSecret || 'dev-secret'}:drive-link`, { expiresIn: '1h' });
  assert.equal(drive.verify('drive-link', old).lid, 3);
  const made = drive.sign('drive-link', { lid: 4 }, { expiresIn: '1h' });
  assert.equal(jwt.verify(made, `${config.auth.jwtSecret || 'dev-secret'}:drive-link`).lid, 4);
  assert.throws(() => drive.sign('Bad Purpose', {}), /purpose/);
  const sdk = await import('../platform/sdk/server.js');
  for (const name of ['moduleTokens', 'provideDirectoryCredentialInfo']) assert.equal(typeof sdk[name], 'function', name);
  assert.equal(sdk.signModuleToken, undefined, 'no purpose-only signing in the SDK');
});

test('module tokens: a package signs only its own purposes — never the core\'s (Files, KB, Google), never another package\'s', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const config = (await import('../config/app.js')).default;
  const { CORE_TOKEN_PURPOSES, LEGACY_TOKEN_PURPOSES, moduleTokens, tokenPurposeAllowed } = await import('../services/secrets.js');
  const { BUILTIN_MODULE_IDS } = await import('../modules/catalog.js');
  const { moduleContext } = await import('../platform/registry.js');
  const secret = config.auth.jwtSecret || 'dev-secret';
  const files = jwt.sign({ lid: 1, v: 1, scope: 'rw' }, `${secret}:files-link`, { expiresIn: '1h' });
  for (const id of ['drive', 'hello', 'qr']) {
    const tokens = moduleTokens(id);
    // The core's purposes (Files and KB visitor sessions, the Google sign-in state) — neither sign nor verify.
    for (const purpose of ['files-link', 'kb-share', 'google-state', 'seal', ...CORE_TOKEN_PURPOSES]) {
      assert.throws(() => tokens.sign(purpose, { lid: 1 }), (err) => err.code === 'TOKEN_PURPOSE_DENIED', `${id} ${purpose}`);
      assert.throws(() => tokens.verify(purpose, files), (err) => err.code === 'TOKEN_PURPOSE_DENIED', `${id} ${purpose}`);
    }
    // Its own: pkg-<id>, pkg-<id>-<name>.
    const own = tokens.sign(`pkg-${id}-visit`, { a: 1 });
    assert.equal(jwt.verify(own, `${secret}:pkg-${id}-visit`).a, 1);
    assert.equal(tokens.verify(`pkg-${id}`, tokens.sign(`pkg-${id}`, { b: 2 })).b, 2);
    // Another package's.
    assert.throws(() => tokens.sign(`pkg-other-visit`, {}), /TOKEN_PURPOSE_DENIED|may not/);
  }
  // Legacy purposes: only their owner.
  assert.deepEqual(LEGACY_TOKEN_PURPOSES, { drive: ['drive-link'] });
  assert.throws(() => moduleTokens('hello').sign('drive-link', {}), (err) => err.code === 'TOKEN_PURPOSE_DENIED');
  assert.equal(tokenPurposeAllowed('drive', 'drive-link'), true);
  // No legacy purpose is a core one; ids have no "-" so pkg-a-… belongs to a only.
  for (const list of Object.values(LEGACY_TOKEN_PURPOSES)) for (const purpose of list) assert.ok(!CORE_TOKEN_PURPOSES.includes(purpose) && !purpose.startsWith('pkg-'));
  assert.equal(tokenPurposeAllowed('ab', 'pkg-ab-c-d'), true);
  assert.equal(tokenPurposeAllowed('ab_c', 'pkg-ab-c-d'), false);
  // A module built into the core gets no helper (its keys are its own code's).
  for (const id of ['files', 'kb', ...BUILTIN_MODULE_IDS.slice(0, 5)]) assert.throws(() => moduleTokens(id), (err) => err.code === 'TOKEN_PURPOSE_DENIED', id);
  assert.throws(() => moduleTokens('Bad-Id'), (err) => err.code === 'TOKEN_PURPOSE_DENIED');
  // register(ctx): ctx.tokens is bound to the module.
  const ctx = moduleContext({ id: 'hello' });
  assert.equal(ctx.tokens.id, 'hello');
  assert.throws(() => ctx.tokens.sign('files-link', {}), (err) => err.code === 'TOKEN_PURPOSE_DENIED');
  assert.ok(ctx.tokens.sign('pkg-hello-x', {}));
});

test('public pages of packages: an anonymous visitor of /d/<token> gets that package alone, while it is on', async () => {
  const { normalizeManifest } = await import('../platform/packages/manifestFile.js');
  const { CATEGORIES, INTEGRATIONS } = await import('../modules/manifest.js');
  const base = { id: 'hello', name: { en: 'Hello', ru: 'Привет' }, version: '1.0.0', core: '1.0.0', category: CATEGORIES[0], web: { entry: 'web/index.js' } };
  const check = (publicPaths) => normalizeManifest({ ...base, web: { ...base.web, publicPaths } }, { categories: CATEGORIES, integrations: INTEGRATIONS });
  assert.deepEqual(check(['/h/', '/h/']).manifest.web.publicPaths, ['/h/']);
  for (const bad of [['/app/'], ['/api/'], ['h/'], ['/h'], ['/a/b/'], [1]]) assert.ok(check(bad).problems.length, JSON.stringify(bad));
  // The core's own public pages and paths (Files links, KB shares, sign-in callbacks, setup, install…).
  for (const core of ['/l/', '/s/', '/res/', '/auth/', '/setup/', '/install/', '/api/', '/apps/', '/help/', '/health/']) assert.ok(check([core]).problems.some((problem) => /portal itself/.test(problem)), core);
  // Owned public paths: /q/ is QR's (nginx), /d/ the File server's — nobody else's.
  const { publicPathProblem } = await import('../platform/packages/manifestFile.js');
  assert.match(check(['/q/']).problems.join(';'), /belongs to the module "qr"/);
  assert.match(check(['/d/']).problems.join(';'), /belongs to the module "drive"/);
  assert.equal(publicPathProblem('qr', '/q/'), null);
  assert.equal(publicPathProblem('drive', '/d/'), null);
  assert.deepEqual(normalizeManifest({ ...base, id: 'drive', web: { ...base.web, publicPaths: ['/d/'] } }, { categories: CATEGORIES, integrations: INTEGRATIONS }).manifest.web.publicPaths, ['/d/']);
  assert.ok(normalizeManifest({ ...base, web: { ...base.web, publicPaths: '/h/' } }, { categories: CATEGORIES, integrations: INTEGRATIONS }).problems.length);

  const { setLoadedForTests, resetLoader, shellPackages, publicPathPackages } = await import('../platform/packages/loader.js');
  try {
    setLoadedForTests({ id: 'drive', version: '1.1.0', manifest: { id: 'drive', name: { en: 'File server' }, web: { entry: 'web/index.js', css: [], publicPaths: ['/d/'] } } });
    setLoadedForTests({ id: 'qr', version: '1.1.0', manifest: { id: 'qr', name: { en: 'QR' }, web: { entry: 'web/index.js', css: [] } } });
    assert.deepEqual(publicPathPackages('/d/abc123'), ['drive']);
    assert.deepEqual(publicPathPackages('/d/abc/def'), ['drive']);
    // Anywhere else nothing (answered without reading the settings: no database here).
    for (const path of ['/login', '/d/', '/dx/abc', '', 'd/abc', '//d/x']) {
      assert.deepEqual(publicPathPackages(path), [], path);
      assert.deepEqual(await shellPackages({ signedIn: false, path }), { bootId: (await shellPackages({ signedIn: false })).bootId, signedIn: false, modules: [] }, path);
    }
  } finally {
    resetLoader();
  }
  const logic = await import(pathToFileURL(join(FRONT, 'platform/packages/loaderLogic.js')).href);
  assert.equal(logic.installedUrl('/d/abc'), '/api/modules/installed?path=%2Fd%2Fabc');
  assert.equal(logic.installedUrl('/'), '/api/modules/installed');
  assert.equal(logic.installedUrl(''), '/api/modules/installed');
  // After signing in only packages the page has not prepared reload it (a public page may have loaded its own).
  assert.equal(logic.lateAnswerAction({ data: { signedIn: true, modules: [{ id: 'drive' }] } }, [{ id: 'drive' }], { afterSignIn: true }), null);
  assert.equal(logic.lateAnswerAction({ data: { signedIn: true, modules: [{ id: 'drive' }, { id: 'crm' }] } }, [{ id: 'drive' }], { afterSignIn: true }), 'reload');
});

test('shell: public pages of a package wait for its web entry; the catch-all does not redirect the opened page while its list is on its way', async () => {
  const logic = await import(pathToFileURL(join(FRONT, 'platform/packages/loaderLogic.js')).href);
  // The server sends publicPaths in the shell list (placeholders before the first render).
  assert.match(read('src/backend/platform/packages/loader.js'), /settings: Boolean\(manifest\.web\.settings\), \.\.\.\(manifest\.web\.publicPaths\?\.length \? \{ publicPaths: manifest\.web\.publicPaths \} : \{\}\)/);
  const drive = { id: 'drive', enabled: true, web: { entry: '/modules/drive/1.1.0/web/index.js', publicPaths: ['/d/', '/bad', 7] } };
  assert.deepEqual(logic.publicPrefixesOf(drive), ['/d/']);
  assert.deepEqual(logic.publicPrefixesOf({ ...drive, enabled: false }), [], 'a switched-off package holds no place');
  assert.deepEqual(logic.publicPrefixesOf({ ...drive, web: { publicPaths: ['/d/'] } }), [], 'no entry, no page');
  assert.deepEqual(logic.publicPrefixesOf({ id: 'x', web: { entry: 'e' } }), []);
  assert.equal(logic.placeholderRoute('/d/'), '/d/*');
  // The catch-all: held for the opened page while the list is pending, at most a minute; never for another page.
  assert.equal(logic.holdsCatchAll({ listPending: true, startPath: '/d/abc', path: '/d/abc', elapsedMs: 3000 }), true);
  assert.equal(logic.holdsCatchAll({ listPending: true, startPath: '/d/abc', path: '/d/abc', elapsedMs: 61000 }), false);
  assert.equal(logic.holdsCatchAll({ listPending: false, startPath: '/d/abc', path: '/d/abc' }), false);
  assert.equal(logic.holdsCatchAll({ listPending: true, startPath: '/d/abc', path: '/elsewhere' }), false);
  // A late answer: an anonymous visitor's public packages join in place; a signed-in shell reloads (once).
  assert.equal(logic.lateAnswerPlan({ signedIn: false, modules: [{ id: 'drive' }] }), 'prepare');
  assert.equal(logic.lateAnswerPlan({ signedIn: true, modules: [{ id: 'crm' }] }), 'reload');
  // The browser side: placeholders registered before the first render, retries ask for the ORIGINAL path.
  const loader = readFileSync(join(FRONT, 'platform/packages/loader.js'), 'utf8');
  assert.match(loader, /fetchList\(\(\.\.\.args\) => fetch\(\.\.\.args\), timeoutMs, \{ path: START_PATH \}\)/);
  assert.doesNotMatch(loader, /window\.location\.pathname/);
  assert.match(loader, /addPublicPlaceholders\(pkg\);/);
  assert.match(readFileSync(join(FRONT, 'App.jsx'), 'utf8'), /<Route path="\*" element=\{<CatchAll \/>\} \/>/);
  assert.match(readFileSync(join(FRONT, 'main.jsx'), 'utf8'), /loadInstalledPackages\(\{ timeoutMs: 1500 \}\)\.finally/);
});

test('build: each builds into a package (server part; web with MODULE_BUILD_WEB=1); the gateway ships with the File server', { timeout: 900_000 }, async () => {
  const { buildModule } = await import(pathToFileURL(join(ROOT, 'scripts/build-module.mjs')).href);
  const { openPackage } = await import('../platform/packages/archive.js');
  const web = process.env.MODULE_BUILD_WEB === '1';
  const out = mkdtempSync(join(tmpdir(), 'portal-pk2-build-'));
  try {
    for (const id of IDS) {
      const result = await buildModule(id, { keep: true, unsigned: true, out, 'no-web': !web, 'no-write': true });
      const opened = openPackage(readFileSync(result.file), { allowUnsigned: true });
      const m = opened.manifest;
      const names = opened.files.map((item) => item.name);
      const file = (name) => opened.files.find((item) => item.name === name)?.data.toString();
      assert.equal(m.id, id);
      assert.equal(m.version, moduleJson(id).version);
      assert.match(file('server/index.js'), /001_init/);
      // Other modules are reached through the registry only: no other module's code in the bundle.
      assert.doesNotMatch(file('server/index.js'), /@portal\/sdk\/core\/modules\/(employees|directory|drive|crm|contracts|masterplan|procurement|warehouse)\//);
      assert.doesNotMatch(file('server/index.js'), /@portal\/sdk\/core\/(services\/crypto|config\/app)\.js/);
      for (const ns of ['apps', 'settings', 'permissions', 'tour']) assert.ok(m.locales.ru.includes(ns), `${id} ${ns}`);
      if (id === 'drive') {
        // gate.js finds the gateway next to server/index.js (new URL('./gateway/smbgate.py', import.meta.url)).
        assert.ok(names.includes('server/gateway/smbgate.py') && names.includes('server/gateway/ntacl.py'), 'gateway files');
        assert.ok(!names.some((name) => /__pycache__|\.pyc$|test_\w+\.py$/.test(name)), 'no bytecode or gateway tests');
        assert.match(file('server/index.js'), /new URL\("\.\/gateway\/smbgate\.py", import\.meta\.url\)/);
        for (const ns of ['drive', 'driveSettings', 'driveActivity', 'folderAccess']) assert.ok(m.locales.ru.includes(ns), `drive ${ns}`);
        assert.deepEqual(m.web?.publicPaths || (web ? null : ['/d/']), ['/d/']);
      }
      if (id === 'employees') assert.ok(m.locales.ru.includes('emp'));
      if (id === 'directory') assert.ok(m.locales.ru.includes('directory'));
      if (web) {
        assert.ok(m.web?.entry, `${id}: web entry`);
        assert.equal(m.web.settings, true, `${id}: settings screen`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
