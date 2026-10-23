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
 *   node scripts/check-core-upgrade.mjs [--core 2.0.0] [--sdk 2.0.0] [--modules-dir ./data/modules] [--json]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'src/backend');

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export async function checkCoreUpgrade({ coreVersion, sdkVersion, modulesDir }) {
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
    const problem = compatibilityProblem(manifest, { coreVersion, sdkVersion });
    modules.push({ id, version, core: manifest.core, sdk: manifest.sdk || null, ok: !problem, problem });
  }
  return modules;
}

async function main() {
  const coreVersion = option('core', readFileSync(join(ROOT, 'VERSION'), 'utf8').trim());
  const { SDK_VERSION } = await import(pathToFileURL(join(BACKEND, 'platform/sdk/version.js')).href);
  const sdkVersion = option('sdk', SDK_VERSION);
  const modulesDir = resolve(option('modules-dir', process.env.MODULES_DIR_HOST || join(ROOT, 'data/modules')));
  const modules = await checkCoreUpgrade({ coreVersion, sdkVersion, modulesDir });
  const bad = modules.filter((item) => !item.ok);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ core: coreVersion, sdk: sdkVersion, modulesDir, modules }, null, 2)}\n`);
  } else {
    console.log(`Installed module packages vs core ${coreVersion} (SDK ${sdkVersion}) in ${modulesDir}:`);
    if (!modules.length) console.log('  none');
    for (const item of modules) console.log(`  ${item.ok ? 'ok     ' : 'UPDATE '} ${item.id} ${item.version}${item.core ? ` (core ${item.core}${item.sdk ? `, sdk ${item.sdk}` : ''})` : ''}${item.problem ? ` — ${item.problem.message.en}` : ''}`);
    if (bad.length) console.log(`\n${bad.length} module(s) will not load on core ${coreVersion}: install versions made for it (Settings → Modules), or deploy with MODULES_CHECK=skip and update them right after.`);
  }
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
