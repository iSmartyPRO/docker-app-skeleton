#!/usr/bin/env node
/*
 * make check-core-upgrade — before a core update: can the installed module
 * packages run on the new core? (spec §5 «before a core update all installed
 * modules are checked»; docs/module-packages.md «Core updates».)
 *
 * Reads the active packages from the modules folder on the host
 * ($MODULES_DIR/<id>/current → <version>/manifest.json; default ./data/modules)
 * and checks each manifest's `core` (same major, not newer) and `sdk` against
 * the core about to be deployed (VERSION and src/backend/platform/sdk/version.js
 * of this checkout). Prints a report; exits 1 when a module would not load —
 * update those modules first (or right after the deploy: until then they are
 * marked «needs an update» and not loaded; the portal itself runs).
 *
 * Also before a core ROLLBACK (`--core` older than this checkout, docs/module-packages.md «Rolling the
 * core back»): the SDK of that core is read from its tag (`git show v<core>:…/sdk/version.js`) unless
 * `--sdk` is given, and a package whose `core` / `sdk` requirement exceeds it is reported with its
 * previous version on disk (`<id>/previous`) when that one fits — the version to point `current` at.
 *
 *   node scripts/check-core-upgrade.mjs [--core 2.0.0] [--sdk 2.0.0] [--modules-dir ./data/modules] [--json]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'src/backend');

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/**
 * The SDK a released core provides, from its git tag: '<x.y.z>', 'none' (that core has no package platform),
 * or null (no such tag here — unknown).
 */
export function sdkOfCore(coreVersion, { root = ROOT } = {}) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/tags/v${coreVersion}`], { stdio: 'ignore' });
  } catch {
    return null;
  }
  try {
    const text = execFileSync('git', ['-C', root, 'show', `v${coreVersion}:src/backend/platform/sdk/version.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return text.match(/SDK_VERSION\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1] || null;
  } catch {
    return 'none';
  }
}

/**
 * Ids of the modules a released core has built in, from its tag (`modules/index.js` imports), or null (no such
 * tag here). A rollback to such a core ignores the package of a module it has built in and runs its own copy on
 * the same tables, so that package is no problem (docs/module-packages.md «Rolling the core back»).
 */
export function builtinOfCore(coreVersion, { root = ROOT } = {}) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/tags/v${coreVersion}`], { stdio: 'ignore' });
    const text = execFileSync('git', ['-C', root, 'show', `v${coreVersion}:src/backend/modules/index.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...text.matchAll(/^import\s+\w+\s+from\s+'\.\/([a-z][a-z0-9_]*)\/index\.js';?\s*$/gm)].map((match) => match[1]);
  } catch {
    return null;
  }
}

function readManifest(modulesDir, id, version) {
  return JSON.parse(readFileSync(join(modulesDir, id, version, 'manifest.json'), 'utf8'));
}

const NO_PLATFORM = (coreVersion) => ({
  code: 'NO_PLATFORM',
  message: { en: `core ${coreVersion} has no module packages (it had the module built in)`, ru: `в ядре ${coreVersion} нет модулей-пакетов (модуль был встроен)` },
});

export async function checkCoreUpgrade({ coreVersion, sdkVersion, modulesDir, builtin = [] }) {
  const { compatibilityProblem } = await import(pathToFileURL(join(BACKEND, 'platform/packages/checks.js')).href);
  const { ID_PATTERN, VERSION_PATTERN } = await import(pathToFileURL(join(BACKEND, 'platform/packages/paths.js')).href);
  const modules = [];
  if (!existsSync(modulesDir)) return modules;
  for (const id of readdirSync(modulesDir).sort()) {
    if (!ID_PATTERN.test(id) || !statSync(join(modulesDir, id)).isDirectory()) continue;
    const pointer = join(modulesDir, id, 'current');
    if (!existsSync(pointer)) continue;
    const version = readFileSync(pointer, 'utf8').trim();
    if (!VERSION_PATTERN.test(version)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(modulesDir, id, version, 'manifest.json'), 'utf8'));
    } catch (err) {
      modules.push({ id, version, ok: false, problem: { code: 'UNREADABLE', message: { en: `manifest.json cannot be read: ${err.message}`, ru: `manifest.json не читается: ${err.message}` } } });
      continue;
    }
    if (builtin.includes(id)) {
      // That core has the module built in: the package is ignored there, its built-in copy runs on the same data.
      modules.push({ id, version, core: manifest.core, sdk: manifest.sdk || null, ok: true, problem: null, builtin: true });
      continue;
    }
    const fits = (m) => (sdkVersion === 'none' ? NO_PLATFORM(coreVersion) : compatibilityProblem(m, { coreVersion, sdkVersion }));
    const problem = fits(manifest);
    const item = { id, version, core: manifest.core, sdk: manifest.sdk || null, ok: !problem, problem };
    // Its version before the last update: what `current` can be pointed back at when the core goes back.
    const previousPointer = join(modulesDir, id, 'previous');
    const previous = existsSync(previousPointer) ? readFileSync(previousPointer, 'utf8').trim() : '';
    if (problem && VERSION_PATTERN.test(previous) && previous !== version) {
      try {
        const old = readManifest(modulesDir, id, previous);
        const oldProblem = fits(old);
        item.previous = { version: previous, core: old.core, sdk: old.sdk || null, ok: !oldProblem, problem: oldProblem };
      } catch {
        item.previous = { version: previous, ok: false, problem: { code: 'UNREADABLE', message: { en: 'manifest.json cannot be read', ru: 'manifest.json не читается' } } };
      }
    }
    modules.push(item);
  }
  return modules;
}

async function main() {
  const ownCore = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  const coreVersion = option('core', ownCore);
  const { SDK_VERSION } = await import(pathToFileURL(join(BACKEND, 'platform/sdk/version.js')).href);
  const { compare } = await import(pathToFileURL(join(BACKEND, 'platform/packages/version.js')).href);
  // A released core (a rollback target, or this version's tag while the checkout has moved on) provides the
  // SDK of its own release, not this checkout's; a version not released yet (the deploy's next one) this one's.
  const coreGiven = Boolean(option('core', null));
  const released = coreGiven ? sdkOfCore(coreVersion) : null;
  let sdkNote = '';
  let sdkVersion = option('sdk', null);
  if (!sdkVersion) {
    sdkVersion = released || SDK_VERSION;
    if (!released && compare(coreVersion, ownCore) < 0) sdkNote = ` — no tag v${coreVersion} here, so its SDK is unknown: this checkout's SDK is assumed (pass SDK=x.y.z)`;
  }
  const modulesDir = resolve(option('modules-dir', process.env.MODULES_DIR_HOST || join(ROOT, 'data/modules')));
  const builtin = coreGiven ? builtinOfCore(coreVersion) || [] : [];
  const modules = await checkCoreUpgrade({ coreVersion, sdkVersion, modulesDir, builtin });
  const bad = modules.filter((item) => !item.ok);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ core: coreVersion, sdk: sdkVersion, modulesDir, modules }, null, 2)}\n`);
  } else {
    const rollback = compare(coreVersion, ownCore) < 0 || Boolean(released);
    console.log(`Installed module packages vs core ${coreVersion} (SDK ${sdkVersion === 'none' ? 'none' : sdkVersion}${sdkNote}) in ${modulesDir}:`);
    if (!modules.length) console.log('  none');
    for (const item of modules) {
      if (item.builtin) {
        console.log(`  built in ${item.id} ${item.version} — core ${coreVersion} has it built in: the package is ignored there and the built-in module runs on the same data (the package loads again with a newer core)`);
        continue;
      }
      const label = item.ok ? 'ok     ' : rollback ? 'TOO NEW' : 'UPDATE ';
      console.log(`  ${label} ${item.id} ${item.version}${item.core ? ` (core ${item.core}${item.sdk ? `, sdk ${item.sdk}` : ''})` : ''}${item.problem ? ` — ${item.problem.message.en}` : ''}`);
      if (item.previous) {
        console.log(
          item.previous.ok
            ? `          previous ${item.previous.version} (core ${item.previous.core}) fits: point ${item.id}/current to ${item.previous.version} (docs/module-packages.md «Rolling the core back»)`
            : `          previous ${item.previous.version} does not fit either — ${item.previous.problem.message.en}`
        );
      }
    }
    if (bad.length && rollback) {
      console.log(`\n${bad.length} module(s) need a newer core than ${coreVersion} and will not load after the rollback: point each back to a version that fits (above), or keep the newer core.`);
    } else if (bad.length) {
      console.log(`\n${bad.length} module(s) will not load on core ${coreVersion}: install versions made for it (Settings → Modules), or deploy with MODULES_CHECK=skip and update them right after.`);
    }
  }
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
