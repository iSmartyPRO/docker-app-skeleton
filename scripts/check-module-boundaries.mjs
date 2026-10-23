#!/usr/bin/env node
/*
 * Module boundaries (docs/specs/module-packages.ru.md §6, stage 1).
 *
 * Plain node, no dependencies. Reads every import / export-from / dynamic
 * import specifier in src/backend and src/frontend/src and fails when:
 *
 *   1. a module imports a file of another module that is not its public
 *      surface (backend: modules/<id>/api.js; frontend: modules/<id>/public.js,
 *      public.jsx, public.css or a file under modules/<id>/public/);
 *   2. a module imports another module's public surface while that module is
 *      neither core nor listed in its manifest `requires` — optional links
 *      (`enhances`) go through the runtime registry instead
 *      (backend platform/registry.js `modules.get(id)?.api`, frontend
 *      platform/ lookups);
 *   3. core (anything outside modules/<id>/, and the core modules themselves —
 *      catalog `core: true`) imports a file of a non-core module, or a
 *      non-public file of a core module.
 *
 * The module loaders (backend modules/index.js, frontend modules/registry.js)
 * are the composition root and may import module entries.
 *
 * Justified temporary exceptions live in scripts/module-boundaries.allow.json:
 *   [{ "from": "src/…/file.js", "to": "src/…/target.js", "reason": "…" }]
 * An entry that no longer matches anything is reported (and fails) so the list
 * only shrinks.
 *
 * Usage: node scripts/check-module-boundaries.mjs [--json] [--root <dir>]
 * Exit code 0 when clean, 1 on violations.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const ROOT = resolve(option('--root') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const BACKEND = join(ROOT, 'src/backend');
const FRONTEND = join(ROOT, 'src/frontend/src');
const BACKEND_MODULES = join(BACKEND, 'modules');
const FRONTEND_MODULES = join(FRONTEND, 'modules');
const ALLOW_FILE = join(ROOT, 'scripts/module-boundaries.allow.json');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'test', 'tests', 'test-fixtures', '__tests__', 'coverage']);
const SOURCE = /\.(m?js|jsx)$/;
const TEST_FILE = /\.(test|spec)\.(m?js|jsx)$/;

/** Composition roots: may import any module's files. */
const LOADERS = new Set([join(BACKEND_MODULES, 'index.js'), join(FRONTEND_MODULES, 'registry.js')]);

const rel = (file) => relative(ROOT, file).split(sep).join('/');

async function loadFacts() {
  const { MODULE_MANIFEST } = await import(pathToFileURL(join(BACKEND_MODULES, 'manifest.js')).href);
  const { MODULE_CATALOG } = await import(pathToFileURL(join(BACKEND_MODULES, 'catalog.js')).href);
  const ids = new Set(MODULE_CATALOG.map((module) => module.id));
  const core = new Set(MODULE_CATALOG.filter((module) => module.core).map((module) => module.id));
  const requires = {};
  for (const id of ids) requires[id] = new Set((MODULE_MANIFEST[id]?.requires || []).map((link) => link.id).filter(Boolean));
  return { ids, core, requires };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (SOURCE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Source without comments, and without strings that cannot be import specifiers (positions and newlines kept). */
export function stripComments(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && code[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      // keep newlines so line numbers stay right
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n && code[j] !== quote) {
        if (code[j] === '\\') j += 1;
        else if (quote !== '`' && code[j] === '\n') break;
        j += 1;
      }
      // A string is kept only where it can be a specifier (after from / import / import( ); other strings are blanked.
      const literal = code.slice(i, j + 1);
      out += /(?:\bfrom|\bimport)\s*$|\bimport\s*\(\s*$/.test(out) ? literal : literal.replace(/[^\n]/g, ' ');
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const PATTERNS = [
  // import x from '…', import { a } from '…', export { a } from '…', export * from '…'
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  // import '…' (side effect)
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  // import('…') — only literal specifiers
  /\bimport\s*\(\s*(['"`])([^'"`\n$]+)\1\s*\)/g,
];

/** [{ specifier, line }] of a source file. */
export function specifiersOf(code) {
  const clean = stripComments(code);
  const found = new Map();
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(clean))) {
      const at = match.index + match[0].lastIndexOf(match[2]);
      if (!found.has(at)) found.set(at, { specifier: match[2], line: clean.slice(0, at).split('\n').length });
    }
  }
  return [...found.values()];
}

const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
function resolveSpecifier(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier.split('?')[0]);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return base; // unresolved (glob, generated) — classified by path anyway
}

/** { side: 'backend'|'frontend', module: id|null, file } */
function classify(file, ids) {
  for (const [side, root] of [
    ['backend', BACKEND_MODULES],
    ['frontend', FRONTEND_MODULES],
  ]) {
    if (file.startsWith(root + sep)) {
      const [first, ...rest] = relative(root, file).split(sep);
      if (rest.length && ids.has(first)) return { side, module: first, inner: rest.join('/') };
      return { side, module: null };
    }
  }
  return { side: file.startsWith(BACKEND) ? 'backend' : 'frontend', module: null };
}

// Backend: api.js. Frontend: public.js / public.jsx / public.css and files under public/ (components that bring their own CSS).
const isPublic = (side, inner) => (side === 'backend' ? inner === 'api.js' : /^public\.(js|jsx|css)$/.test(inner) || inner.startsWith('public/'));

export async function check({ facts } = {}) {
  const { ids, core, requires } = facts || (await loadFacts());
  const files = [...walk(BACKEND), ...walk(FRONTEND)];
  const violations = [];
  for (const file of files) {
    const from = classify(file, ids);
    const code = readFileSync(file, 'utf8');
    for (const { specifier, line } of specifiersOf(code)) {
      const target = resolveSpecifier(file, specifier);
      if (!target) continue;
      const to = classify(target, ids);
      if (!to.module || to.module === from.module) continue;
      if (LOADERS.has(file)) continue;
      const publicTarget = isPublic(to.side, to.inner);
      let rule = null;
      const importerIsCore = !from.module || core.has(from.module);
      if (importerIsCore) {
        if (!core.has(to.module)) rule = 'core-imports-module';
        else if (!publicTarget) rule = 'non-public';
      } else if (!publicTarget) rule = 'non-public';
      else if (!core.has(to.module) && !requires[from.module]?.has(to.module)) rule = 'not-required';
      if (rule) violations.push({ rule, from: rel(file), line, specifier, to: rel(target), fromModule: from.module, toModule: to.module });
    }
  }

  const allow = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : [];
  const used = new Set();
  const remaining = violations.filter((violation) => {
    const index = allow.findIndex((entry) => entry.from === violation.from && entry.to === violation.to);
    if (index < 0) return true;
    used.add(index);
    return false;
  });
  const stale = allow.filter((_, index) => !used.has(index));
  return { violations: remaining, allowed: violations.length - remaining.length, stale, files: files.length };
}

const RULES = {
  'non-public': 'imports a non-public file of another module (use its api.js / public.js)',
  'not-required': 'imports a module that is not in its manifest `requires` (use the runtime registry)',
  'core-imports-module': 'core imports a module (use an extension point)',
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await check();
  if (flag('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const v of result.violations) console.log(`${v.from}:${v.line}  ${v.specifier}\n    ${v.fromModule || 'core'} → ${v.toModule}: ${RULES[v.rule]}`);
    for (const entry of result.stale) console.log(`stale allow-list entry: ${entry.from} → ${entry.to}`);
    console.log(`\n${result.files} files, ${result.violations.length} violation(s), ${result.allowed} allowed exception(s)${result.stale.length ? `, ${result.stale.length} stale allow-list entr(ies)` : ''}`);
  }
  process.exitCode = result.violations.length || result.stale.length ? 1 : 0;
}
