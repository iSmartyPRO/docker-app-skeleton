import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { EXPOSED_CORE, SDK_SPECIFIER, SHARED_LIBS, shimFile } from '../src/platform/sdk/exposed.js';

/*
 * The core side of module packages in the browser (docs/module-packages.md «Web SDK»).
 *
 *   virtual:portal-shared   { loaders: { <name>: () => import(…) } } for every shared
 *                           name; src/platform/packages/shared.js installs
 *                           window.__PORTAL_SHARED__.load(name) from it. Each loader
 *                           is a separate dynamic import, so nothing is downloaded
 *                           until a package needs it.
 *   dist/sdk/<name>.js      one shim per shared name, emitted with the build:
 *                             const m = await window.__PORTAL_SHARED__.load('antd');
 *                             export const Button = m.Button; …
 *                           The export names are read at build time (npm packages:
 *                           their CommonJS export keys; core files: esbuild's
 *                           export list of each file). The dev server answers the
 *                           same files at /sdk/….
 *   dist/sdk/manifest.json  every shared name with its exports (the package build checks against it).
 */

const VIRTUAL = 'virtual:portal-shared';
const RESOLVED = '\0virtual:portal-shared';
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval'.split(' '));

function fileOf(srcDir, path) {
  for (const ext of ['.js', '.jsx', '/index.js', '/index.jsx']) {
    const file = resolve(srcDir, `${path}${ext}`);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every shared name: [{ name, kind: 'lib' | 'sdk' | 'core', file? }]. */
export function sharedEntries(srcDir) {
  const out = SHARED_LIBS.map((name) => ({ name, kind: 'lib' }));
  out.push({ name: SDK_SPECIFIER, kind: 'sdk', file: resolve(srcDir, 'platform/sdk/index.js') });
  const core = new Set(EXPOSED_CORE);
  // Extension points of the core (src/platform/*, not the package machinery itself).
  for (const file of walk(resolve(srcDir, 'platform'))) {
    const rel = relative(srcDir, file).split(sep).join('/');
    if (!/\.(js|jsx)$/.test(rel) || rel.startsWith('platform/packages/') || rel.startsWith('platform/sdk/')) continue;
    core.add(rel.replace(/\.(js|jsx)$/, ''));
  }
  for (const path of [...core].sort()) {
    const file = fileOf(srcDir, path);
    if (!file) throw new Error(`platform/sdk/exposed.js lists ${path}, which does not exist`);
    out.push({ name: `core/${path}`, kind: 'core', file });
  }
  return out;
}

/** Export names of every shared name: Map(name → [names]). */
export async function exportNames(entries, frontendRoot) {
  const require = createRequire(join(frontendRoot, 'package.json'));
  const names = new Map();
  for (const entry of entries.filter((item) => item.kind === 'lib')) {
    names.set(entry.name, Object.keys(require(entry.name)).filter((key) => key !== '__esModule' && key !== 'default'));
  }
  const files = entries.filter((item) => item.file);
  const { build } = await import(require.resolve('esbuild'));
  const result = await build({
    absWorkingDir: frontendRoot,
    entryPoints: files.map((item) => item.file),
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    outdir: join(frontendRoot, '.portal-sdk-exports'),
    outbase: resolve(frontendRoot, 'src'),
    packages: 'external',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty', '.svg': 'empty', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty', '.woff2': 'empty', '.json': 'json' },
    plugins: [
      {
        name: 'portal-sdk-externals',
        setup(b) {
          // Vite-only imports (virtual modules, ?query imports, import.meta.glob targets) do not change export lists.
          b.onResolve({ filter: /^virtual:|\?/ }, (args) => ({ path: args.path, external: true }));
        },
      },
    ],
  });
  const byEntry = new Map(Object.values(result.metafile.outputs).filter((out) => out.entryPoint).map((out) => [resolve(frontendRoot, out.entryPoint), out.exports]));
  for (const entry of files) names.set(entry.name, (byEntry.get(entry.file) || []).filter((key) => key !== 'default'));
  return names;
}

export function shimSource(name, exports) {
  const lines = [`// Generated by the portal build: ${name} from the core bundle (docs/module-packages.md).`, `const m = await window.__PORTAL_SHARED__.load(${JSON.stringify(name)});`, 'export default m.default;'];
  for (const key of exports) {
    if (IDENT.test(key) && !RESERVED.has(key)) lines.push(`export const ${key} = m.${key};`);
  }
  return `${lines.join('\n')}\n`;
}

function loadersModule(entries, srcDir) {
  const rows = entries.map((entry) => {
    const target = entry.kind === 'lib' ? entry.name : `/src/${relative(srcDir, entry.file).split(sep).join('/')}`;
    return `  ${JSON.stringify(entry.name)}: () => import(${JSON.stringify(target)}),`;
  });
  return `export const LIBS = ${JSON.stringify(SHARED_LIBS)};\nexport const loaders = {\n${rows.join('\n')}\n};\n`;
}

export default function portalSdk({ root }) {
  const srcDir = resolve(root, 'src');
  let entries = null;
  let shims = null;
  const getEntries = () => (entries ||= sharedEntries(srcDir));
  const getShims = async () => {
    if (!shims) {
      const names = await exportNames(getEntries(), root);
      shims = new Map(getEntries().map((entry) => [shimFile(entry.name), { name: entry.name, exports: names.get(entry.name) || [], source: shimSource(entry.name, names.get(entry.name) || []) }]));
    }
    return shims;
  };
  return {
    name: 'portal-sdk',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? loadersModule(getEntries(), srcDir) : null;
    },
    async generateBundle() {
      const all = await getShims();
      for (const [file, shim] of all) this.emitFile({ type: 'asset', fileName: `sdk/${file}`, source: shim.source });
      this.emitFile({ type: 'asset', fileName: 'sdk/manifest.json', source: JSON.stringify({ format: 1, shared: [...all.values()].map(({ name, exports }) => ({ name, file: shimFile(name), exports })) }) });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/sdk/')) return next();
        try {
          const file = decodeURIComponent(req.url.split('?')[0].slice('/sdk/'.length));
          const all = await getShims();
          if (file === 'manifest.json') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ format: 1, shared: [...all.values()].map(({ name, exports }) => ({ name, file: shimFile(name), exports })) }));
          }
          const shim = all.get(file);
          if (!shim) return next();
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.end(shim.source);
        } catch (err) {
          return next(err);
        }
      });
    },
  };
}
