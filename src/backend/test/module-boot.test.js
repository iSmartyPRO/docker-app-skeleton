import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODULE_CATALOG } from '../modules/catalog.js';

/*
 * Boot sets (docs/specs/module-packages.ru.md §6 stage 1): the core alone,
 * the core with each module on its own, and everything. Each set loads in a
 * fresh Node process — only the core and that module's own files (and what
 * its manifest `requires`) — registers with the core registry, runs every
 * register(ctx) and builds every router. No database: nothing here may
 * query at import or registration time.
 */

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..');
const CORE = MODULE_CATALOG.filter((module) => module.core).map((module) => module.id);
const OPTIONAL = MODULE_CATALOG.filter((module) => !module.core).map((module) => module.id);

const SCRIPT = `
const { register } = await import('node:module');
register(${JSON.stringify(pathToFileURL(join(backend, 'test-fixtures/record-imports.mjs')).href)});
const ids = JSON.parse(process.argv[1]);
const registry = await import('./platform/registry.js');
const { widgetDefinitions } = await import('./platform/widgets.js');
const list = [];
for (const id of ids) list.push((await import('./modules/' + id + '/index.js')).default);
for (const module of list) if (module.id !== ids[list.indexOf(module)]) throw new Error('module id mismatch: ' + module.id);
await registry.activateModules(list);
const routers = [];
for (const module of list) {
  if (typeof module.routes === 'function') routers.push(module.routes());
  if (module.publicRoutes) routers.push(module.publicRoutes());
}
const loaded = registry.modules.ids();
const absent = ${JSON.stringify(MODULE_CATALOG.map((module) => module.id))}.filter((id) => !loaded.includes(id));
const report = {
  loaded,
  routers: routers.length,
  widgets: Object.values(widgetDefinitions()).map((def) => def.module),
  absentGet: absent.map((id) => registry.modules.get(id)),
  absentEnabled: await Promise.all(absent.map((id) => registry.modules.enabled(id))),
  // Only for absent owners: a present one would read its on/off state from the settings (database).
  crmDeals: loaded.includes('crm') ? 'present' : await registry.linkProvider('crm.deal'),
  objects: loaded.includes('masterplan') ? 'present' : await registry.objectSource(),
};
process.stdout.write(JSON.stringify(report));
`;

const work = mkdtempSync(join(tmpdir(), 'module-boot-'));
let runs = 0;

/** Boots `ids` in a fresh process: its report plus `folders`, the module folders whose files were imported. */
function boot(ids) {
  const log = join(work, `imports-${(runs += 1)}.log`);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify(ids)], {
    cwd: backend,
    encoding: 'utf8',
    timeout: 60_000,
    // No database for these: a query would fail fast instead of hanging.
    env: { ...process.env, POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '1', DATABASE_URL: '', NODE_ENV: 'test', IMPORT_LOG: log },
  });
  const prefix = pathToFileURL(join(backend, 'modules')).href + '/';
  const folders = new Set(
    readFileSync(log, 'utf8')
      .split('\n')
      .filter((url) => url.startsWith(prefix))
      .map((url) => url.slice(prefix.length).split('/'))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0])
  );
  return { ...JSON.parse(out), folders: [...folders] };
}

// What a module may bring along: the core modules, its manifest `requires`, and shared/ (core library).
const { MODULE_MANIFEST } = await import('../modules/manifest.js');
const requiredOf = (id) => (MODULE_MANIFEST[id]?.requires || []).map((link) => link.id).filter(Boolean);

function check(ids) {
  const report = boot(ids);
  // Static imports may bring a required module along, never an optional one.
  for (const id of ids) assert.ok(report.loaded.includes(id), `${id} is loaded`);
  assert.equal(report.routers >= ids.length - 1, true, 'routers built');
  // Modules that are not installed are null everywhere and hidden from the extension points.
  assert.ok(report.absentGet.every((entry) => entry === null));
  assert.ok(report.absentEnabled.every((on) => on === false));
  for (const module of report.widgets) assert.ok(!module || report.loaded.includes(module), `a widget of ${module} without the module`);
  if (!report.loaded.includes('crm')) assert.equal(report.crmDeals, null);
  if (!report.loaded.includes('masterplan')) assert.equal(report.objects, null);
  return report;
}

test.after(() => rmSync(work, { recursive: true, force: true }));

test('boot: the core alone', () => {
  const report = check(CORE);
  assert.deepEqual([...report.loaded].sort(), [...CORE].sort());
});

for (const id of OPTIONAL) {
  test(`boot: the core and ${id} alone`, () => {
    const report = check([...CORE, id]);
    // No file of another optional module is imported (optional links go through the registry).
    const allowed = new Set([...CORE, id, 'shared', ...requiredOf(id)]);
    const extra = report.folders.filter((folder) => !allowed.has(folder));
    assert.deepEqual(extra, [], `${id} imported files of ${extra.join(', ')}`);
  });
}

test('boot: everything', () => {
  const report = check([...CORE, ...OPTIONAL]);
  assert.equal(report.loaded.length, MODULE_CATALOG.length);
  // Widgets of every module that has some are registered.
  for (const id of ['tasks', 'calendar', 'files', 'drive', 'kb', 'resources', 'companies', 'procurement', 'contracts', 'warehouse', 'employees']) {
    assert.ok(report.widgets.includes(id), `${id} widgets`);
  }
});

test('activation: a register() that throws, rejects or leaves a failing ctx helper never escapes; activateModules waits', async () => {
  const { activateModules, modules } = await import('../platform/registry.js');
  const seen = [];
  const warn = console.warn;
  const error = console.error;
  const logged = [];
  console.warn = (...args) => logged.push(args.join(' '));
  console.error = (...args) => logged.push(args.join(' '));
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await activateModules([
      { id: 'zz-throws', register() { throw new Error('sync boom'); } },
      { id: 'zz-rejects', async register() { await null; throw new Error('async boom'); } },
      {
        id: 'zz-helper',
        register(ctx) {
          // Not awaited, not caught: must not become an unhandled rejection.
          ctx.registerInboxProvider('zz-bad-provider', 'not a function');
        },
      },
      { id: 'zz-slow', async register() { await new Promise((resolve) => setTimeout(resolve, 20)); seen.push('slow done'); } },
    ]);
    assert.deepEqual(seen, ['slow done'], 'activateModules resolved only after the async register finished');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
    assert.ok(logged.some((line) => /zz-throws: register\(\) failed/.test(line) && /sync boom/.test(line)), logged.join('\n'));
    assert.ok(logged.some((line) => /zz-rejects: register\(\) failed/.test(line) && /async boom/.test(line)), logged.join('\n'));
    // The modules stay loaded without their extensions.
    assert.ok(logged.some((line) => /zz-helper: registerInboxProvider\(zz-bad-provider\) failed/.test(line)), logged.join('\n'));
    assert.ok(modules.loaded('zz-throws') && modules.loaded('zz-rejects'));
  } finally {
    console.warn = warn;
    console.error = error;
    process.off('unhandledRejection', onUnhandled);
  }
});
