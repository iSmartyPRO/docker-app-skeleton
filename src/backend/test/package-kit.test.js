import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * The pure parts of the package conversion test kit (scripts/package-kit/lib/pure.mjs,
 * docs/package-testing.md): argument parsing, the test-database guard, snapshot diffs, route
 * introspection, parameter filling, the permission verdicts, page lists, migration numbering.
 * No database, no processes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(pathToFileURL(resolve(here, '../../../scripts/package-kit/lib/pure.mjs')).href);

test('arguments: id, mode, source ref, flags; bad values refused', () => {
  const args = kit.parseArgs(['--id', 'masterplan', '--mode=upgrade', '--source-ref', 'v1.19.0', '--keep', '--no-browser']);
  assert.equal(args.id, 'masterplan');
  assert.equal(args.mode, 'upgrade');
  assert.equal(args.sourceRef, 'v1.19.0');
  assert.equal(args.keep, true);
  assert.equal(args.browser, false);
  assert.equal(kit.parseArgs(['qr']).mode, 'all');
  assert.equal(kit.parseArgs(['qr']).sourceRef, 'main');
  assert.throws(() => kit.parseArgs([]), /module id/);
  assert.throws(() => kit.parseArgs(['--id', 'Bad-Id']), /module id/);
  assert.throws(() => kit.parseArgs(['--id', 'qr', '--mode', 'prod']), /--mode/);
  assert.throws(() => kit.parseArgs(['--id', 'qr', '--source-ref', 'main; rm -rf /']), /git ref/);
  assert.throws(() => kit.parseArgs(['--id', 'qr', '--frobnicate']), /Unknown option/);
  assert.throws(() => kit.parseArgs(['--id']), /needs a value/);
});

test('only wh-test-pg (127.0.0.1:55432) is accepted', () => {
  const env = kit.parseEnvText('# test\nPOSTGRES_HOST=127.0.0.1\nPOSTGRES_PORT="55432"\nPOSTGRES_DB=audit\nPOSTGRES_USER=audit\nPOSTGRES_PASSWORD=x\n');
  assert.deepEqual(kit.assertTestDatabase(env), { host: '127.0.0.1', port: 55432, user: 'audit', password: 'x', database: 'audit' });
  assert.throws(() => kit.assertTestDatabase({ ...env, POSTGRES_PORT: '5432' }), /wh-test-pg/);
  assert.throws(() => kit.assertTestDatabase({ ...env, POSTGRES_HOST: 'postgres-18' }), /wh-test-pg/);
  assert.throws(() => kit.assertTestDatabase({ ...env, POSTGRES_HOST: 'localhost' }), /wh-test-pg/);
  assert.throws(() => kit.assertTestDatabase({ ...env, DATABASE_URL: 'postgres://x@127.0.0.1:55432/a' }), /DATABASE_URL/);
  assert.throws(() => kit.assertTestDatabase({ ...env, POSTGRES_PASSWORD: '' }), /POSTGRES_PASSWORD/);
});

test('kit database names: own prefix, safe characters; nothing else counts as the kit\'s', () => {
  const name = kit.kitDatabaseName('masterplan', 'upgrade-old', 'abc123');
  assert.equal(name, 'pkgkit_masterplan_upgrade_old_abc123');
  assert.ok(kit.isKitDatabaseName(name));
  assert.equal(kit.isKitDatabaseName('audit'), false);
  assert.equal(kit.isKitDatabaseName('portal'), false);
  assert.equal(kit.isKitDatabaseName('pkgkit_x"; DROP DATABASE portal; --'), false);
  assert.ok(kit.kitDatabaseName('a'.repeat(32), 'x'.repeat(40)).length <= 63);
});

test('versions and migration numbers (inline migrations of the database count too)', () => {
  assert.equal(kit.bumpPatch('1.1.0'), '1.1.1');
  assert.equal(kit.bumpPatch('1.1.9', 2), '1.1.11');
  assert.throws(() => kit.bumpPatch('1.1'), /Not a version/);
  assert.equal(kit.nextMigrationName([], 'kit_probe'), '001_kit_probe.sql');
  assert.equal(kit.nextMigrationName(['migrations/001_init.sql', 'migrations/004_x.js'], 'kit_probe'), '005_kit_probe.sql');
  assert.equal(kit.nextMigrationName(['001_init', '002_kit_probe'], 'kit_broken'), '003_kit_broken.sql');
});

test('table patterns: own prefix, legacy prefixes, manifest entries', () => {
  const patterns = kit.tablePatterns('masterplan', ['mp_%', 'masterplan_extra'], ['mp_']);
  assert.deepEqual(patterns, { prefixes: ['masterplan_', 'mp_'], exact: ['masterplan_extra'] });
  assert.ok(kit.matchesPatterns('mp_nodes', patterns));
  assert.ok(kit.matchesPatterns('masterplan_kit_probe', patterns));
  assert.equal(kit.matchesPatterns('crm_deals', patterns), false);
  assert.equal(kit.quoteIdent('mp_nodes'), '"mp_nodes"');
  assert.throws(() => kit.quoteIdent('mp_nodes; drop table users'), /Unsafe/);
  assert.match(kit.checksumSql('mp_nodes'), /FROM "mp_nodes" x/);
});

test('snapshot diff: rows, checksums, missing tables, settings, ignored tables', () => {
  const a = { meta: { at: 1 }, tables: { mp_a: { rows: 2, sum: 'aaaaaaaaaa' }, mp_b: { rows: 1, sum: 'bbbbbbbbbb' } }, settings: { enabled: true, settings: { x: 1 } }, roles: { r: ['masterplan.admin'] } };
  assert.deepEqual(kit.diffSnapshots(a, structuredClone({ ...a, meta: { at: 2 } })), []);
  assert.deepEqual(kit.diffSnapshots(a, { ...a, settings: { settings: { x: 1 }, enabled: true } }), [], 'key order does not matter');
  const changed = kit.diffSnapshots(a, { ...a, tables: { mp_a: { rows: 2, sum: 'cccccccccc' } }, settings: { enabled: false } });
  assert.deepEqual(changed.map((d) => d.path), ['tables.mp_a', 'tables.mp_b', 'settings']);
  assert.equal(changed[1].after, 'missing');
  assert.deepEqual(kit.diffSnapshots(a, { ...a, tables: { ...a.tables, mp_probe: { rows: 1, sum: 'x' } } }, { ignoreTables: ['mp_probe'] }), []);
  // app_settings flags of the module: a new key is fine (a catch-up job records its run), a changed or lost one is not.
  const flags = { ...a, appSettings: { masterplan_seeded: 'true' } };
  assert.deepEqual(kit.diffSnapshots(flags, { ...flags, appSettings: { masterplan_seeded: 'true', masterplan_contract_resync: '{}' } }), []);
  assert.deepEqual(kit.diffSnapshots(flags, { ...flags, appSettings: { masterplan_seeded: 'false' } }).map((d) => d.path), ['appSettings.masterplan_seeded']);
  assert.deepEqual(kit.diffSnapshots(flags, { ...flags, appSettings: {} }).map((d) => d.after), ['missing']);
  assert.deepEqual(kit.diffSnapshots({ ...a, files: { count: 2, digest: 'x' } }, { ...a, files: { count: 1, digest: 'y' } }).map((d) => d.path), ['files']);
});

test('routes of a router stack: nested routers, parameters, duplicates; mount paths', () => {
  const inner = Router();
  inner.get('/', () => {});
  inner.get('/:sid/file', () => {});
  const router = Router();
  router.get('/meta', () => {});
  router.route('/projects/:id').get(() => {}).put(() => {});
  router.get('/meta', () => {});
  router.use('/access/:id', inner);
  router.get(/^\/regex$/, () => {});
  const skipped = [];
  const routes = kit.routesOf(router, '/api/app/x', skipped);
  assert.deepEqual(routes, [
    { method: 'GET', path: '/api/app/x/meta' },
    { method: 'GET', path: '/api/app/x/projects/:id' },
    { method: 'PUT', path: '/api/app/x/projects/:id' },
    { method: 'GET', path: '/api/app/x/access/:id' },
    { method: 'GET', path: '/api/app/x/access/:id/:sid/file' },
  ]);
  assert.equal(skipped.length, 1, 'the regular-expression path is reported');
});

test('path parameters: values, choices, optional ones, missing ones', () => {
  assert.deepEqual(kit.fillPath('/api/app/x/projects/:id/map', { id: 7 }), { url: '/api/app/x/projects/7/map', missing: [] });
  assert.equal(kit.fillPath('/a/:kind(seed|purge)/:id?').url, '/a/seed');
  assert.equal(kit.fillPath('/a/:id').url, '/a/1');
  assert.deepEqual(kit.fillPath('/app/x/p/:projectId/plan', {}, null), { url: '/app/x/p/:projectId/plan', missing: ['projectId'] });
  assert.equal(kit.fillPath('/a/:q', { q: 'a b/c' }).url, '/a/a%20b%2Fc');
  const match = kit.routeMatcher(['GET /api/app/x/meta', '/api/app/x/export/*', 'GET /api/app/x/files/**']);
  assert.ok(match('GET', '/api/app/x/meta'));
  assert.equal(match('PUT', '/api/app/x/meta'), false);
  assert.ok(match('DELETE', '/api/app/x/export/csv'));
  assert.equal(match('GET', '/api/app/x/export/csv/more'), false);
  assert.ok(match('GET', '/api/app/x/files/a/b/c'));
  assert.equal(match('GET', '/api/app/x/metadata'), false);
});

test('verdicts: superadmin, tokens, users without permissions (filtered answers), anonymous', () => {
  const j = kit.judgeStatus;
  assert.equal(j('superadmin', 200).ok, true);
  assert.equal(j('superadmin', 404).ok, true, 'a placeholder id may be unknown');
  assert.equal(j('superadmin', 500).ok, false);
  assert.equal(j('superadmin', 403).ok, false);
  assert.equal(j('superadmin', 200, { timeout: true }).ok, false);
  assert.equal(j('superadmin', 0).ok, false);
  assert.equal(j('token', 403).ok, true);
  assert.equal(j('token', 200).ok, false);
  assert.equal(j('scoped-token', 200).ok, true);
  assert.equal(j('scoped-token', 403).ok, false);
  assert.deepEqual(j('scoped-token', 403, { code: 'SCOPE_DENIED' }).warn, true);
  assert.equal(j('scoped-token', 403, { code: 'SCOPE_DENIED', otherScopes: true }).warn, undefined);
  assert.equal(j('holder', 403).ok, true);
  assert.equal(j('holder', 401).ok, false);
  assert.equal(j('user', 403).ok, true);
  assert.equal(j('user', 404).ok, true);
  assert.equal(j('user', 401).ok, false);
  assert.equal(j('user', 500).ok, false);
  assert.equal(j('user', 200, { open: true }).ok, true);
  assert.equal(j('user', 200).ok, false, 'nothing to compare');
  assert.equal(j('user', 200, { size: 0, adminSize: 5 }).ok, true, 'filtered');
  assert.equal(j('user', 200, { size: 5, adminSize: 5 }).ok, false, 'the same data');
  assert.equal(j('user', 200, { size: 0, adminSize: 0 }).warn, true, 'inconclusive');
  assert.equal(j('anonymous', 401).ok, true);
  assert.equal(j('anonymous', 200).ok, false);
  assert.equal(j('anonymous', 200, { open: true }).ok, true);
  assert.equal(j('anonymous', 302, { open: true }).ok, true, 'a public redirect');
  assert.equal(j('anonymous', 302).ok, false);
  assert.throws(() => j('nobody', 200), /unknown caller/);
});

test('data size of an answer: longest array, CSV data lines', () => {
  assert.equal(kit.dataSize({ body: { success: true, projects: [1, 2, 3] } }), 3);
  assert.equal(kit.dataSize({ body: { success: true, page: { items: [1], total: 9 }, units: [] } }), 1);
  assert.equal(kit.dataSize({ body: { success: true, settings: { a: 1 } } }), null);
  assert.equal(kit.dataSize({ body: null, type: 'text/csv', text: 'code;name\nA-1;x\nA-2;y\n' }), 2);
  assert.equal(kit.dataSize({ body: null, type: 'text/csv', text: 'code;name\n' }), 0);
});

test('pages: App routes from the source, settings, parameters; catch-all left out', () => {
  const source = `
    <Routes>
      <Route index element={<A />} />
      <Route path="projects" element={<P />} />
      <Route path='bookings' element={<B />} />
      <Route path="p/:projectId/plan" element={<Plan />} />
      <Route path={'p/:projectId/chess'} element={<Chess />} />
      <Route path="*" element={<Navigate to="/app/x" />} />
    </Routes>`;
  const routes = kit.routePathsFromSource(source);
  assert.deepEqual(routes, ['projects', 'bookings', 'p/:projectId/plan', 'p/:projectId/chess']);
  const without = kit.pageList('x', { routes, hasSettings: true });
  assert.deepEqual(without.pages.map((p) => p.url), ['/app/x', '/app/x/projects', '/app/x/bookings', '/admin/settings/x']);
  assert.equal(without.skipped.length, 2);
  const withParams = kit.pageList('x', { routes, params: { projectId: 3 }, extra: ['/app/crm', { path: '/app/x/p/:projectId', expectPrefix: '/app/x/p/3/plan' }] });
  assert.deepEqual(withParams.pages.map((p) => p.url), ['/app/x', '/app/x/projects', '/app/x/bookings', '/app/x/p/3/plan', '/app/x/p/3/chess', '/app/crm', '/app/x/p/3']);
  assert.equal(withParams.pages.at(-1).expectPrefix, '/app/x/p/3/plan');
  assert.deepEqual(kit.pageList('x', { hasPage: false }).pages, []);
});

test('browser noise and the report text', () => {
  assert.ok(kit.isIgnoredProblem('404 /uploads/logos/logo.png'));
  assert.equal(kit.isIgnoredProblem('500 /api/app/x/meta'), false);
  assert.ok(kit.isIgnoredProblem('console: ResizeObserver loop', ['ResizeObserver']));
  const report = { id: 'x', mode: 'fresh', steps: [{ phase: 'package', name: 'build', status: 'pass', ms: 1500 }, { phase: 'fresh', name: 'install', status: 'fail', note: 'boom' }, { phase: 'fresh', name: 'pages', status: 'skip', note: '--no-browser' }] };
  const text = kit.formatReport(report);
  assert.match(text, /^Package check x \(fresh\) — FAIL: 1 passed, 1 failed, 0 warnings, 1 skipped/);
  assert.match(text, /\[package\]\n {4}PASS build \(1\.5 s\)/);
  assert.match(text, /FAIL install — boom/);
  assert.equal(kit.overallStatus(report.steps), 'fail');
  assert.equal(kit.overallStatus([{ status: 'pass' }, { status: 'warn' }]), 'pass');
  assert.equal(kit.stableJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
});
