#!/usr/bin/env node
/*
 * The shell without modules (docs/specs/module-packages.ru.md §6 stage 1,
 * frontend side): bundles the app with esbuild (already a dependency of vite)
 * while the given modules are absent — every file under
 * src/modules/<id>/ becomes an empty stub and the module drops out of the
 * registry — and fails when anything does not resolve or imports a name the
 * stub does not have. Nothing is written.
 *
 *   node scripts/check-module-absence.mjs              # every optional module absent at once
 *   node scripts/check-module-absence.mjs chat tasks   # just these
 *
 * Optional modules are the backend catalog's modules without `core: true`; modules
 * distributed as packages (backend modules/manifest.js PACKAGE_MODULE_IDS) are always absent.
 * Exit code 0 when the shell builds.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '../src');
const { build } = await import(pathToFileURL(join(here, '../node_modules/esbuild/lib/main.js')).href);
const { MODULE_CATALOG } = await import(pathToFileURL(join(here, '../../backend/modules/catalog.js')).href);

const { PACKAGE_MODULE_IDS } = await import(pathToFileURL(join(here, '../../backend/modules/manifest.js')).href);

const optional = MODULE_CATALOG.filter((module) => !module.core).map((module) => module.id);
const absent = new Set(process.argv.slice(2).length ? process.argv.slice(2) : optional);
for (const id of absent) if (!optional.includes(id)) throw new Error(`${id} is not an optional module`);
// Modules distributed as packages are never part of the shell, whatever is checked.
for (const id of PACKAGE_MODULE_IDS) absent.add(id);

const moduleOf = (file) => {
  const rel = relative(join(SRC, 'modules'), file);
  if (rel.startsWith('..')) return null;
  const [first, ...rest] = rel.split(sep);
  return rest.length ? first : null;
};

// The registry without the absent modules' entries (the shell lists what is installed).
const registrySource = readFileSync(join(SRC, 'modules/registry.js'), 'utf8');
const filteredRegistry = registrySource.replace(/^  \{\n(?:(?!^  \},?\n)[\s\S])*?^    id: '([a-z]+)',[\s\S]*?^  \},\n/gm, (block, id) => (absent.has(id) ? '' : block));

const result = await build({
  entryPoints: [join(SRC, 'main.jsx')],
  bundle: true,
  write: false,
  splitting: true,
  format: 'esm',
  outdir: join(here, '.absence-out'),
  jsx: 'automatic',
  logLevel: 'silent',
  metafile: true,
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty', '.svg': 'empty', '.png': 'empty', '.jpg': 'empty', '.woff2': 'empty', '.json': 'json' },
  plugins: [
    {
      name: 'absent-modules',
      setup(b) {
        // npm packages and vite queries (?url, ?l10n) are not part of the check.
        b.onResolve({ filter: /^[^./]/ }, (args) => ({ path: args.path, external: true }));
        b.onResolve({ filter: /\?/ }, (args) => ({ path: args.path, external: true }));
        b.onLoad({ filter: /modules[\\/]registry\.js$/ }, () => ({
          // import.meta.glob('./*/register.js') is vite's: list the register files of the modules present.
          contents: filteredRegistry.replace(
            /import\.meta\.glob\((?:'\.\/\*\/register\.js'|\[[^\]]*\]), \{ eager: true \}\);/,
            MODULE_CATALOG.map((module) => module.id)
              .filter((id) => !absent.has(id) && existsSync(join(SRC, 'modules', id, 'register.js')))
              .map((id) => `import './${id}/register.js';`)
              .join('\n')
          ),
          loader: 'jsx',
          resolveDir: join(SRC, 'modules'),
        }));
        b.onLoad({ filter: /\.(m?js|jsx)$/ }, (args) => {
          const id = moduleOf(args.path);
          if (id && absent.has(id)) throw new Error(`the shell imports ${relative(SRC, args.path)} of the absent module «${id}»`);
          return undefined;
        });
      },
    },
  ],
}).catch((error) => error);

const errors = result.errors || [];
for (const error of errors) console.log(`${error.location ? `${relative(SRC, error.location.file)}:${error.location.line} ` : ''}${error.text}`);
console.log(`${Object.keys(result.metafile?.inputs || {}).length} files, ${absent.size} module(s) absent: ${errors.length ? `${errors.length} problem(s)` : 'the shell builds'}`);
process.exitCode = errors.length ? 1 : 0;
