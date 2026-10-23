#!/usr/bin/env node
/**
 * Module packages: build, sign, verify (docs/module-packages.md, spec docs/specs/module-packages.ru.md §4, §6 stage 2).
 *
 *   node scripts/build-module.mjs <id> [options]        build dist/modules/<id>-<version>.zip     (make module ID=<id>)
 *   node scripts/build-module.mjs keygen [--key FILE]   new signing key + trusted public key      (make module-keygen)
 *   node scripts/build-module.mjs verify FILE           check a package's signature and manifest  (make modules-verify FILE=…)
 *
 * Build options:
 *   --version x.y.z   exact version              --bump major|minor|patch   force the bump
 *   --keep            keep the current version   (default: Conventional Commits since the tag <id>/v<version>, see below)
 *   --source DIR      a module outside the core tree: DIR/module.json (manifest fields), DIR/server/index.js,
 *                     DIR/web/index.js(x), DIR/migrations, DIR/locales/<lang>/<ns>.js, DIR/docs
 *   --key FILE        Ed25519 private key (default $MODULE_SIGNING_KEY_FILE or /root/.portal-keys/modules-ed25519.pem);
 *                     an encrypted one is opened with $MODULE_SIGNING_KEY_PASSPHRASE (keygen encrypts with it too)
 *   --unsigned        no SIGNATURE (installs only with MODULES_DEV=1)
 *   --out DIR         output folder (default dist/modules)
 *   --no-web          skip the browser part      --dry-run   show the plan, write nothing
 *
 * A module of the core tree (src/backend/modules/<id>, src/frontend/src/modules/<id>):
 *   - manifest.json from modules/manifest.js + modules/catalog.js, overridden by the optional
 *     src/backend/modules/<id>/module.json (version, core, requires, tables, locales, docFiles,
 *     nameForms, settings, icon, web: false…);
 *   - server/index.js: esbuild bundle of src/backend/modules/<id>/index.js; relative imports of core
 *     files become @portal/sdk/core/<path> (the portal's own copy at run time); other modules'
 *     internals are refused (use ctx.modules.get(id)?.api or that module's api.js);
 *   - web/: vite library build; React, antd, … and core files listed in
 *     src/frontend/src/platform/sdk/exposed.js become /sdk/<name>.js imports; the entry is
 *     src/frontend/src/modules/<id>/index.js(x) or is made from the module's entry in modules/registry.js;
 *   - migrations/: src/backend/modules/<id>/migrations/NNN_name.sql|js (JS ones bundled like server/);
 *   - locales/<lang>/<ns>.js: the module's namespaces (default: files named <id>*.js) and apps.<id>.
 *
 * Version: the module's own version (module.json, else modules/manifest.js). Without --version /
 * --bump / --keep it grows like the core's (scripts/release.mjs): commits touching the module's
 * folders since the tag <id>/v<version> — feat → minor, BREAKING/! → major, else patch; no tag yet →
 * the current version is packaged. The new version is written to module.json; tag it yourself:
 * git tag <id>/v<version>.
 */
import { execFileSync } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'src/backend');
const FRONTEND = join(ROOT, 'src/frontend');
const FRONT_SRC = join(FRONTEND, 'src');
const frontRequire = createRequire(join(FRONTEND, 'package.json'));
const DEFAULT_KEY = process.env.MODULE_SIGNING_KEY_FILE || '/root/.portal-keys/modules-ed25519.pem';
const TRUSTED_KEYS = join(BACKEND, 'platform/trusted-keys.json');

const lib = (path) => import(pathToFileURL(join(BACKEND, path)).href);
const toPosix = (path) => path.split(sep).join('/');
const inside = (dir, path) => path === dir || path.startsWith(dir + sep);
const say = (...args) => console.log(...args);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) out._.push(arg);
    else if (['--version', '--bump', '--source', '--key', '--out'].includes(arg)) out[arg.slice(2)] = argv[(i += 1)];
    else out[arg.slice(2)] = true;
  }
  return out;
}

// ── Keys ────────────────────────────────────────────────────────────────────

async function keygen(args) {
  const { generateSigningKey } = await lib('platform/packages/signature.js');
  const file = resolve(args.key || DEFAULT_KEY);
  if (inside(ROOT, file)) throw new Error(`The private key must live outside the repository (${file})`);
  if (existsSync(file) && !args.force) throw new Error(`${file} exists — the key is kept (pass --force to replace it; packages signed with the old key will need the old public key)`);
  // A passphrase (MODULE_SIGNING_KEY_PASSPHRASE) encrypts the key file: a stolen copy alone cannot sign.
  const passphrase = process.env.MODULE_SIGNING_KEY_PASSPHRASE || null;
  const key = generateSigningKey({ passphrase });
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, key.privateKey, { mode: 0o600 });
  chmodSync(file, 0o600);
  const trusted = existsSync(TRUSTED_KEYS) ? JSON.parse(readFileSync(TRUSTED_KEYS, 'utf8')) : { keys: [] };
  trusted.keys = (trusted.keys || []).filter((item) => item.id !== key.keyId);
  trusted.keys.push({ id: key.keyId, publicKey: key.publicKey, comment: args.comment || `module signing key, ${new Date().toISOString().slice(0, 10)}` });
  writeFileSync(TRUSTED_KEYS, `${JSON.stringify(trusted, null, 2)}\n`);
  say(`Private key: ${file} (mode 600${key.encrypted ? ', encrypted with MODULE_SIGNING_KEY_PASSPHRASE' : ''} — back it up somewhere safe, never commit it)`);
  if (!key.encrypted) say('Warning: the key is NOT protected by a passphrase. Prefer creating it on an offline build host (not the production server) with MODULE_SIGNING_KEY_PASSPHRASE set: whoever has this file can sign packages every portal trusts.');
  say(`Public key ${key.keyId} added to ${relative(ROOT, TRUSTED_KEYS)} — commit it and release the core so portals trust it.`);
}

async function verify(args) {
  const file = args._[1];
  if (!file) throw new Error('Usage: verify <package.zip>');
  const { openPackage } = await lib('platform/packages/archive.js');
  const { CATEGORIES, INTEGRATIONS } = await lib('modules/manifest.js');
  try {
    const opened = openPackage(readFileSync(file), { allowUnsigned: Boolean(args['allow-unsigned']), categories: CATEGORIES, integrations: INTEGRATIONS });
    const m = opened.manifest;
    say(`OK ${basename(file)}: ${m.id} ${m.version} (core ${m.core}+), ${opened.files.length} files, ${opened.signed ? `signed by ${opened.keyId}` : 'UNSIGNED'}, sha256 ${opened.checksum}`);
    say(`  requires: ${m.requires.map((r) => r.id ? `${r.id}${r.version ? `>=${r.version}` : ''}` : r.integration).join(', ') || '—'} · enhances: ${m.enhances.map((e) => e.id || e.integration).join(', ') || '—'} · permissions: ${m.permissions.join(', ') || '—'}`);
  } catch (err) {
    console.error(`REJECTED ${basename(file)}: ${err.problem?.message?.ru || err.message}${err.problem?.params?.reason ? ` (${err.problem.params.reason})` : ''}`);
    process.exitCode = 1;
  }
}

// ── Versions ────────────────────────────────────────────────────────────────

const git = (...params) => execFileSync('git', params, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function nextVersion(id, current, args, paths) {
  const { bump } = await lib('platform/packages/version.js');
  if (args.version) {
    if (!/^\d+\.\d+\.\d+$/.test(args.version)) throw new Error(`--version ${args.version} must be x.y.z`);
    return { version: args.version, level: 'explicit', commits: [] };
  }
  if (args.bump) {
    if (!['major', 'minor', 'patch'].includes(args.bump)) throw new Error('--bump must be major, minor or patch');
    return { version: bump(current, args.bump), level: args.bump, commits: [] };
  }
  if (args.keep || !paths.length) return { version: current, level: 'keep', commits: [] };
  const { classifyCommit } = await import(pathToFileURL(join(ROOT, 'scripts/release.mjs')).href);
  let tag = null;
  try {
    tag = git('rev-parse', '--verify', '--quiet', `refs/tags/${id}/v${current}`) ? `${id}/v${current}` : null;
  } catch {
    tag = null;
  }
  if (!tag) return { version: current, level: 'first package (no tag yet)', commits: [] };
  const raw = git('log', `${tag}..HEAD`, '--format=%H%x1f%s%x1f%b%x1e', '--', ...paths.map((path) => relative(ROOT, path)));
  const commits = raw.split('\x1e').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [hash, subject, body] = row.split('\x1f');
    return { hash, subject: subject.trim(), body: (body || '').trim() };
  }).filter((c) => !/^chore\(release\):/i.test(c.subject));
  if (!commits.length) return { version: current, level: `no changes since ${tag}`, commits };
  const rank = { patch: 1, minor: 2, major: 3 };
  const level = commits.map((c) => classifyCommit(c.subject, c.body)).reduce((a, b) => (rank[b] > rank[a] ? b : a), 'patch');
  return { version: bump(current, level), level, commits };
}

// ── Sources ─────────────────────────────────────────────────────────────────

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

function firstFile(dir, names) {
  for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
  return null;
}

/** The module's entry in src/frontend/src/modules/registry.js: { icon, permission, app, settings, page }. */
function registryEntry(id) {
  const text = readFileSync(join(FRONT_SRC, 'modules/registry.js'), 'utf8');
  const at = text.search(new RegExp(`\\bid:\\s*'${id}'`));
  if (at < 0) return null;
  const start = text.lastIndexOf('{', at);
  const end = text.indexOf('\n  },', at);
  const block = text.slice(start, end < 0 ? undefined : end);
  const pick = (re) => block.match(re)?.[1] || null;
  const permission = block.match(/permission:\s*(\[[^\]]*\]|'[^']*')/)?.[1];
  return {
    icon: pick(/icon:\s*'([^']+)'/),
    permission: permission ? JSON.parse(permission.replace(/'/g, '"')) : null,
    app: pick(/App:\s*lazy(?:Page)?\(\(\)\s*=>\s*import\('\.\/([^']+)'\)\)/),
    settings: pick(/Settings:\s*lazy\(\(\)\s*=>\s*import\('\.\/([^']+)'\)\)/),
    page: /path:\s*'/.test(block),
  };
}

const resolveFront = (path) => firstFile(dirname(join(FRONT_SRC, 'modules', path)), [`${basename(path)}.jsx`, `${basename(path)}.js`, basename(path)]);

async function inRepoSource(id) {
  const backendDir = join(BACKEND, 'modules', id);
  if (!existsSync(join(backendDir, 'index.js'))) throw new Error(`src/backend/modules/${id}/index.js not found (or use --source DIR)`);
  const config = readJson(join(backendDir, 'module.json')) || {};
  const { MODULE_MANIFEST, BUILTIN_MANIFEST_IDS } = await lib('modules/manifest.js');
  const { MODULE_CATALOG } = await lib('modules/catalog.js');
  const base = MODULE_MANIFEST[id] && BUILTIN_MANIFEST_IDS.includes(id) ? MODULE_MANIFEST[id] : {};
  const catalog = MODULE_CATALOG.find((entry) => entry.id === id) || {};
  const webDir = join(FRONT_SRC, 'modules', id);
  const registry = registryEntry(id);
  const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
  // The module's own settings.js (plain data, no imports): `defaults`, `publicSettings`, `defaultEnabled`.
  const own = existsSync(join(backendDir, 'settings.js')) ? await import(pathToFileURL(join(backendDir, 'settings.js')).href) : {};
  const requires = (config.requires || base.requires || []).map((link) => {
    if (link.integration || link.version) return link;
    const other = MODULE_MANIFEST[link.id];
    return { ...link, ...(other ? { version: (config.requiresVersions || {})[link.id] || other.version, name: other.name } : {}) };
  });
  const manifest = {
    id,
    name: config.name || base.name,
    ...(config.description ? { description: config.description } : {}),
    version: config.version || base.version,
    core: config.core || null,
    requires,
    enhances: config.enhances || base.enhances || [],
    category: config.category || base.category,
    permissions: config.permissions || catalog.permissions || [],
    changelog: config.changelog || base.changelog || [],
    docs: config.docsInfo || base.docs || undefined,
    ...(config.nameForms ? { nameForms: config.nameForms } : {}),
    settings: {
      defaultEnabled: Boolean(config.settings?.defaultEnabled ?? own.defaultEnabled ?? catalog.defaultEnabled ?? false),
      defaults: plain(config.settings?.defaults ?? own.defaults ?? catalog.defaults ?? {}),
      public: config.settings?.public || own.publicSettings || catalog.publicSettings || [],
    },
    tables: config.tables || [],
  };
  const webEntry = existsSync(webDir) ? firstFile(webDir, ['index.jsx', 'index.js']) : null;
  const generated = webEntry ? null : { app: registry?.app ? resolveFront(registry.app) : null, settings: registry?.settings ? resolveFront(registry.settings) : null, register: firstFile(webDir, ['register.jsx', 'register.js']) };
  const web = existsSync(webDir) && config.web !== false
    ? {
        dir: webDir,
        entry: webEntry,
        generated,
        icon: config.icon || registry?.icon || 'apps',
        permission: config.webPermission || registry?.permission || null,
        // module.json `web.page: false`: no page of its own (an overlay like the robot assistant).
        page: config.web?.page === false ? false : registry ? registry.page : true,
        // A Settings screen: an item in Settings → Modules (frontend platform/packages/loader.js).
        settings: generated ? Boolean(generated.settings) : /\bSettings\s*:/.test(readFileSync(webEntry, 'utf8')),
        // module.json `web.publicPaths`: browser paths of its public pages (anonymous visitors load it there).
        ...(Array.isArray(config.web?.publicPaths) ? { publicPaths: config.web.publicPaths } : {}),
      }
    : null;
  // Namespaces only this module uses: src/frontend/src/modules/<id>/locales/<lang>/<ns>.js (not in the
  // core dictionaries), or core files named <id>*.js (src/frontend/src/locales/<lang>/), or module.json `locales`.
  const ownLocales = join(webDir, 'locales');
  const nsDefault = existsSync(join(FRONT_SRC, 'locales/en')) ? readdirSync(join(FRONT_SRC, 'locales/en')).filter((name) => name.startsWith(id) && name.endsWith('.js')).map((name) => name.slice(0, -3)) : [];
  return {
    kind: 'repo',
    id,
    manifest,
    config,
    server: { dir: backendDir, entry: join(backendDir, 'index.js') },
    web,
    migrationsDir: join(backendDir, 'migrations'),
    locales: { kind: 'repo', dir: existsSync(ownLocales) ? ownLocales : null, namespaces: config.locales || (existsSync(ownLocales) ? [] : nsDefault), apps: config.appsTexts !== false, keys: config.localeKeys || {} },
    docs: (config.docFiles || (existsSync(join(ROOT, 'docs', `${id}.md`)) ? [`docs/${id}.md`] : [])).map((path) => join(ROOT, path)),
    versionFile: join(backendDir, 'module.json'),
    watched: [backendDir, webDir, ...(config.locales || nsDefault).flatMap((ns) => ['en', 'ru'].map((lang) => join(FRONT_SRC, 'locales', lang, `${ns}.js`)))].filter((path) => existsSync(path)),
  };
}

function externalWeb(webDir, config) {
  const entry = firstFile(webDir, ['index.jsx', 'index.js']);
  const settings = config.web?.settings ?? Boolean(entry && /\bSettings\s*:/.test(readFileSync(entry, 'utf8')));
  return { dir: webDir, entry, icon: config.web?.icon || config.icon || 'apps', permission: config.web?.permission || null, page: config.web?.page !== false, settings, ...(Array.isArray(config.web?.publicPaths) ? { publicPaths: config.web.publicPaths } : {}) };
}

function externalSource(dir) {
  const config = readJson(join(dir, 'module.json'));
  if (!config?.id) throw new Error(`${dir}/module.json with an "id" is required`);
  const webDir = join(dir, 'web');
  return {
    kind: 'external',
    id: config.id,
    manifest: { ...config, settings: config.settings || {}, tables: config.tables || [] },
    config,
    server: existsSync(join(dir, 'server/index.js')) ? { dir: join(dir, 'server'), entry: join(dir, 'server/index.js') } : null,
    web: existsSync(webDir) ? externalWeb(webDir, config) : null,
    migrationsDir: join(dir, 'migrations'),
    locales: { kind: 'external', dir: join(dir, 'locales') },
    docs: existsSync(join(dir, 'docs')) ? readdirSync(join(dir, 'docs')).map((name) => join(dir, 'docs', name)) : [],
    versionFile: join(dir, 'module.json'),
    watched: [dir],
  };
}

// ── Server part (esbuild) ───────────────────────────────────────────────────

async function serverExternals() {
  const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  return [...builtinModules, ...builtinModules.map((name) => `node:${name}`), '@portal/sdk', '@portal/sdk/*', ...deps, ...deps.map((name) => `${name}/*`)];
}

async function bundleServer(entry, outfile, moduleDir, report) {
  const { build } = await import(pathToFileURL(frontRequire.resolve('esbuild')).href);
  const { corePathAllowed } = await lib('platform/sdkLoader.mjs');
  const coreImports = report.coreImports;
  const plugin = {
    name: 'portal-core-imports',
    setup(b) {
      b.onResolve({ filter: /^\.\.?\// }, (args) => {
        const abs = resolve(args.resolveDir, args.path);
        if (moduleDir && inside(moduleDir, abs)) return undefined;
        if (!inside(BACKEND, abs)) return undefined;
        const rel = toPosix(relative(BACKEND, abs));
        if (!corePathAllowed(rel)) return { errors: [{ text: `${toPosix(relative(ROOT, args.importer))} imports ${rel}: not available to packages (another module's internals, a tool, or core secrets / key handling / the package platform) — use the SDK, ctx.modules.get(id)?.api or that module's api.js` }] };
        coreImports.add(rel);
        return { path: `@portal/sdk/core/${rel}`, external: true };
      });
    },
  };
  const external = await serverExternals();
  const common = { entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, external, plugins: [plugin], logLevel: 'warning', legalComments: 'none', charset: 'utf8', metafile: true };
  await build(common);
  // CommonJS code bundled into an ES module needs `require` (only when some was bundled).
  if (/typeof require !== "undefined"/.test(readFileSync(outfile, 'utf8'))) {
    await build({ ...common, banner: { js: "import { createRequire as __portalCreateRequire } from 'node:module';\nconst require = __portalCreateRequire(import.meta.url);" } });
  }
}

function copyServerAssets(srcDir, outDir) {
  const copied = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = toPosix(relative(srcDir, path));
      if (statSync(path).isDirectory()) {
        if (!['migrations', 'node_modules', 'test', '__tests__', '__pycache__'].includes(name)) walk(path);
        continue;
      }
      // Python helpers ship too (the File server's SMB gateway, gateway/*.py); their tests and bytecode do not.
      if (/\.(m?js|cjs)$/.test(name) || name === 'module.json' || name.startsWith('.') || /\.py[co]$/.test(name) || /^test_.*\.py$/.test(name)) continue;
      mkdirSync(dirname(join(outDir, rel)), { recursive: true });
      cpSync(path, join(outDir, rel));
      copied.push(rel);
    }
  };
  walk(srcDir);
  return copied;
}

// ── Browser part (vite) ─────────────────────────────────────────────────────

async function buildWeb(source, outDir, tempDir, coreVersion, report) {
  const vite = await import(pathToFileURL(join(dirname(frontRequire.resolve('vite/package.json')), 'dist/node/index.js')).href);
  const reactEsm = join(FRONTEND, 'node_modules/@vitejs/plugin-react/dist/index.js');
  const react = (await import(pathToFileURL(existsSync(reactEsm) ? reactEsm : frontRequire.resolve('@vitejs/plugin-react')).href)).default;
  const { sharedEntries, exportNames } = await import(pathToFileURL(join(FRONTEND, 'scripts/vite-plugin-portal-sdk.mjs')).href);
  const { SHARED_LIBS, SDK_SPECIFIER, shimUrl } = await import(pathToFileURL(join(FRONT_SRC, 'platform/sdk/exposed.js')).href);
  const shared = sharedEntries(FRONT_SRC);
  const exposedCore = new Set(shared.filter((entry) => entry.kind === 'core').map((entry) => entry.name.slice('core/'.length)));
  const moduleDir = source.web.dir;
  let entry = source.web.entry;
  if (!entry) {
    const g = source.web.generated || {};
    if (!g.app && !g.settings) throw new Error(`${toPosix(relative(ROOT, moduleDir))}: no index.js(x) and no App/Settings in modules/registry.js`);
    const lines = [g.register ? `import ${JSON.stringify(g.register)};` : '', 'export default {', `  id: ${JSON.stringify(source.id)},`];
    if (g.app) lines.push(`  App: () => import(${JSON.stringify(g.app)}),`);
    if (g.settings) lines.push(`  Settings: () => import(${JSON.stringify(g.settings)}),`);
    lines.push('};');
    entry = join(tempDir, 'web-entry.js');
    writeFileSync(entry, lines.filter(Boolean).join('\n'));
  }
  const shimOf = (name) => ({ id: shimUrl(name), external: true });
  const plugin = {
    name: 'portal-package-web',
    enforce: 'pre',
    resolveId(spec, importer) {
      if (SHARED_LIBS.includes(spec) || spec === SDK_SPECIFIER) return shimOf(spec);
      if (spec === 'react/jsx-dev-runtime') return shimOf('react/jsx-runtime');
      if (spec.startsWith(`${SDK_SPECIFIER}/core/`)) {
        const path = spec.slice(`${SDK_SPECIFIER}/core/`.length).replace(/\.(jsx?)$/, '');
        if (!exposedCore.has(path)) this.error(`${spec} is not shared with packages (src/frontend/src/platform/sdk/exposed.js)`);
        return shimOf(`core/${path}`);
      }
      if (spec.startsWith('virtual:') || spec.includes('?l10n')) this.error(`${spec} (imported by ${importer}) is a core build feature that packages cannot use`);
      if (!importer || !spec.startsWith('.')) return null;
      const abs = resolve(dirname(importer.split('?')[0]), spec);
      if (inside(moduleDir, abs) || !inside(FRONT_SRC, abs)) return null;
      if (/\.(css|less|scss|svg|png|jpe?g|webp|gif|woff2?)$/.test(abs)) return null; // styles and images are bundled into the package
      const rel = toPosix(relative(FRONT_SRC, abs)).replace(/\.(jsx?)$/, '').replace(/\/index$/, '');
      if (!exposedCore.has(rel)) this.error(`${toPosix(relative(ROOT, importer))} imports ${rel}, which is not shared with packages — list it in src/frontend/src/platform/sdk/exposed.js (needs a core release) or use @portal/sdk`);
      report.webCoreImports.add(rel);
      return shimOf(`core/${rel}`);
    },
  };
  const output = await vite.build({
    configFile: false,
    root: FRONTEND,
    logLevel: 'warn',
    mode: 'production',
    plugins: [plugin, react()],
    define: { __APP_VERSION__: JSON.stringify(coreVersion), __BUILD_ID__: JSON.stringify(`pkg-${source.id}`), 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir,
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: false,
      minify: true,
      cssCodeSplit: false,
      target: 'es2022',
      reportCompressedSize: false,
      lib: { entry, formats: ['es'], fileName: () => 'index.js' },
      // /sdk/… stay absolute URLs: rollup would otherwise rewrite the ones reached from a relative
      // import (../../tour/engine) into ../../../sdk/… paths (and the name check below would miss them).
      rollupOptions: { makeAbsoluteExternalsRelative: false, output: { chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' } },
    },
  });
  // Every name a package imports from /sdk/… must exist in this core, or the browser refuses the module.
  const names = await exportNames(shared, FRONTEND);
  const byUrl = new Map(shared.map((item) => [shimUrl(item.name), item.name]));
  const missing = [];
  for (const chunk of [output].flat().flatMap((result) => result.output)) {
    if (chunk.type !== 'chunk') continue;
    for (const [url, bindings] of Object.entries(chunk.importedBindings || {})) {
      const name = byUrl.get(url);
      if (!name) continue;
      for (const binding of bindings) if (binding !== 'default' && binding !== '*' && !(names.get(name) || []).includes(binding)) missing.push(`${binding} from ${name}`);
    }
  }
  if (missing.length) throw new Error(`The browser part imports names the core does not share: ${[...new Set(missing)].join(', ')}`);
  // Stylesheets: vite puts them under assets/ (assetFileNames), so look in sub-folders too.
  return listFiles(outDir).map((file) => file.name).filter((name) => name.endsWith('.css')).map((name) => `web/${name}`);
}

// ── Locales, docs ───────────────────────────────────────────────────────────

const dataModule = (value) => `export default ${JSON.stringify(value, null, 2)};\n`;

/** Keys of a core namespace a module owns (module.json `localeKeys`: "a.b", "prefix_*"), as a partial tree. */
function pickKeys(tree, patterns) {
  const out = {};
  const put = (path, value) => {
    let node = out;
    path.slice(0, -1).forEach((key) => (node = node[key] ||= {}));
    node[path[path.length - 1]] = value;
  };
  for (const pattern of patterns) {
    const path = pattern.split('.');
    let node = tree;
    for (const key of path.slice(0, -1)) node = node && typeof node === 'object' ? node[key] : undefined;
    if (!node || typeof node !== 'object') continue;
    const last = path[path.length - 1];
    const names = last.endsWith('*') ? Object.keys(node).filter((key) => key.startsWith(last.slice(0, -1))) : last in node ? [last] : [];
    for (const name of names) put([...path.slice(0, -1), name], node[name]);
  }
  return out;
}

async function readLocaleDir(dir, add) {
  for (const lang of readdirSync(dir)) {
    if (!/^[a-z]{2,3}$/.test(lang)) continue;
    for (const file of readdirSync(join(dir, lang)).filter((name) => name.endsWith('.js'))) {
      add(lang, file.slice(0, -3), (await import(pathToFileURL(join(dir, lang, file)).href)).default);
    }
  }
}

async function collectLocales(source, outDir) {
  const out = {};
  const texts = {};
  const merge = (target, tree) => {
    for (const [key, value] of Object.entries(tree || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) merge((target[key] = target[key] && typeof target[key] === 'object' ? target[key] : {}), value);
      else target[key] = value;
    }
    return target;
  };
  const add = (lang, ns, value) => {
    if (!value || typeof value !== 'object' || !Object.keys(value).length) return;
    merge(((texts[lang] ||= {})[ns] ||= {}), value);
  };
  if (source.locales.kind === 'external') {
    if (existsSync(source.locales.dir)) await readLocaleDir(source.locales.dir, add);
  } else {
    if (source.locales.dir) await readLocaleDir(source.locales.dir, add);
    const localesDir = join(FRONT_SRC, 'locales');
    const keys = { ...source.locales.keys };
    if (source.locales.apps) keys.apps = [...new Set([...(keys.apps || []), source.id])];
    for (const lang of readdirSync(localesDir).filter((name) => /^[a-z]{2,3}$/.test(name))) {
      for (const ns of source.locales.namespaces) {
        const file = join(localesDir, lang, `${ns}.js`);
        if (existsSync(file)) add(lang, ns, (await import(pathToFileURL(file).href)).default);
      }
      // The module's keys in shared core namespaces (apps.<id>, settings.<id>, permissions…).
      for (const [ns, patterns] of Object.entries(keys)) {
        const file = join(localesDir, lang, `${ns}.js`);
        if (existsSync(file)) add(lang, ns, pickKeys((await import(pathToFileURL(file).href)).default, patterns));
      }
    }
  }
  for (const [lang, namespaces] of Object.entries(texts)) {
    mkdirSync(join(outDir, lang), { recursive: true });
    for (const [ns, value] of Object.entries(namespaces).sort(([a], [b]) => a.localeCompare(b))) {
      writeFileSync(join(outDir, lang, `${ns}.js`), dataModule(value));
      (out[lang] ||= []).push(ns);
    }
  }
  return out;
}

// ── Build ───────────────────────────────────────────────────────────────────

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push({ name: toPosix(relative(dir, path)), data: readFileSync(path) });
    }
  };
  walk(dir);
  return out.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
}

export async function buildModule(id, args = {}) {
  const source = args.source ? externalSource(resolve(args.source)) : await inRepoSource(id);
  if (id && source.id !== id) throw new Error(`module.json says id "${source.id}", asked for "${id}"`);
  const coreVersion = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  const current = source.manifest.version || '1.0.0';
  const plan = await nextVersion(source.id, current, args, source.kind === 'repo' ? source.watched : []);
  const version = plan.version;
  say(`Module ${source.id}: ${current} → ${version} (${plan.level})`);
  for (const c of plan.commits.slice(0, 30)) say(`  ${c.subject}`);
  if (args['dry-run']) return { id: source.id, version, dryRun: true };

  const temp = mkdtempSync(join(tmpdir(), `portal-module-${source.id}-`));
  const stage = join(temp, 'package');
  mkdirSync(stage, { recursive: true });
  const report = { coreImports: new Set(), webCoreImports: new Set(), assets: [] };
  try {
    const { normalizeManifest } = await lib('platform/packages/manifestFile.js');
    const { CATEGORIES, INTEGRATIONS } = await lib('modules/manifest.js');
    const { signFiles } = await lib('platform/packages/signature.js');
    const { writeZip } = await lib('platform/packages/zip.js');
    const { openPackage } = await lib('platform/packages/archive.js');
    const { SDK_VERSION } = await import(pathToFileURL(join(FRONT_SRC, 'platform/sdk/version.js')).href);

    if (source.server) {
      await bundleServer(source.server.entry, join(stage, 'server/index.js'), source.server.dir, report);
      report.assets = copyServerAssets(source.server.dir, join(stage, 'server'));
      const suspicious = readFileSync(join(stage, 'server/index.js'), 'utf8').match(/new URL\(['"][^'"]+['"],\s*import\.meta\.url\)/g);
      if (suspicious) say(`  note: server code resolves files with import.meta.url (${[...new Set(suspicious)].slice(0, 3).join(', ')}); they are looked up next to server/index.js`);
    }
    if (existsSync(source.migrationsDir)) {
      for (const name of readdirSync(source.migrationsDir).sort()) {
        if (!/^\d{3}_[a-z0-9_]{1,60}\.(sql|js)$/.test(name)) continue;
        const from = join(source.migrationsDir, name);
        const to = join(stage, 'migrations', name);
        mkdirSync(dirname(to), { recursive: true });
        if (name.endsWith('.sql')) cpSync(from, to);
        else await bundleServer(from, to, source.server?.dir || source.migrationsDir, report);
      }
    }
    let css = [];
    if (source.web && !args['no-web']) css = await buildWeb(source, join(stage, 'web'), temp, coreVersion, report);
    const locales = await collectLocales(source, join(stage, 'locales'));
    for (const file of source.docs.filter((path) => existsSync(path))) {
      mkdirSync(join(stage, 'docs'), { recursive: true });
      cpSync(file, join(stage, 'docs', basename(file)));
    }

    const changelog = [...(source.manifest.changelog || [])];
    if (!changelog.length || changelog[0].version !== version) {
      const lines = plan.commits.map((c) => c.subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '')).slice(0, 10);
      changelog.unshift({ version, date: new Date().toISOString().slice(0, 10), changes: { en: lines, ru: lines } });
    }
    const raw = {
      ...source.manifest,
      version,
      core: source.manifest.core || coreVersion,
      changelog: changelog.slice(0, 5),
      server: source.server ? { entry: 'server/index.js' } : undefined,
      web: existsSync(join(stage, 'web/index.js')) ? { entry: 'web/index.js', css, icon: source.web.icon, ...(source.web.permission ? { permission: source.web.permission } : {}), ...(source.web.page === false ? { page: false } : {}), ...(source.web.settings ? { settings: true } : {}), ...(source.web.publicPaths ? { publicPaths: source.web.publicPaths } : {}) } : undefined,
      locales,
      builtAt: new Date().toISOString(),
      sdk: SDK_VERSION,
    };
    const { manifest, problems } = normalizeManifest(raw, { categories: CATEGORIES, integrations: INTEGRATIONS });
    if (problems.length) throw new Error(`manifest.json: ${problems.join('; ')}`);
    writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    let files = listFiles(stage);
    let keyId = null;
    if (!args.unsigned) {
      const keyFile = resolve(args.key || DEFAULT_KEY);
      if (!existsSync(keyFile)) throw new Error(`Signing key ${keyFile} not found: run make module-keygen (once), pass --key FILE, or build --unsigned for development (MODULES_DEV=1)`);
      const signature = signFiles(files, readFileSync(keyFile, 'utf8'), { passphrase: process.env.MODULE_SIGNING_KEY_PASSPHRASE || null });
      keyId = JSON.parse(signature.toString()).keyId;
      files = [...files, { name: 'SIGNATURE', data: signature }].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    }
    const zip = writeZip(files);
    // The result must pass the portal's own checks.
    const trusted = args.trustedKeys;
    openPackage(zip, { allowUnsigned: Boolean(args.unsigned), categories: CATEGORIES, integrations: INTEGRATIONS, ...(trusted ? { trustedKeys: trusted } : {}) });
    const outDir = resolve(args.out || join(ROOT, 'dist/modules'));
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${manifest.id}-${version}.zip`);
    writeFileSync(file, zip);
    if (version !== current && source.versionFile && !args['no-write']) {
      const saved = readJson(source.versionFile) || {};
      writeFileSync(source.versionFile, `${JSON.stringify({ ...saved, version, changelog: manifest.changelog }, null, 2)}\n`);
      say(`  ${relative(ROOT, source.versionFile)}: version ${version} (commit it, then: git tag ${manifest.id}/v${version})`);
    }
    say(`Built ${relative(process.cwd(), file)}: ${files.length} files, ${(zip.length / 1024).toFixed(1)} KB, ${keyId ? `signed by ${keyId}` : 'UNSIGNED (MODULES_DEV=1 only)'}`);
    if (report.coreImports.size) say(`  server uses core files through @portal/sdk/core: ${[...report.coreImports].sort().join(', ')}`);
    if (report.webCoreImports.size) say(`  web uses core files through /sdk/core: ${[...report.webCoreImports].sort().join(', ')}`);
    return { id: manifest.id, version, file, files: files.map((item) => item.name), keyId, manifest };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command && !args.source) throw new Error('Usage: build-module.mjs <id> | keygen | verify <file>  (see the header of this file)');
  if (command === 'keygen') return keygen(args);
  if (command === 'verify') return verify(args);
  return buildModule(command, args);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
