#!/usr/bin/env node
/*
 * Module boundaries (docs/specs/module-packages.ru.md §6, stage 1).
 *
 * Plain node, no dependencies. Reads every import / export-from / dynamic
 * import / require / new URL / import.meta.glob specifier in src/backend and
 * src/frontend/src (and CSS @import / url()) and fails when:
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
 *   4. (fail closed) a file inside modules/ loads code the checker cannot
 *      follow: import(expr) or a template with ${…}, require(expr),
 *      new URL(expr, import.meta.url), import.meta.glob(expr), createRequire;
 *   5. an import.meta.glob whose base is the modules folder (or above it):
 *      it reaches every module.
 *
 * Followed as edges too: literal require('…'), new URL('…', import.meta.url),
 * import.meta.glob('…' | ['…']) (by the directory before the first wildcard),
 * and in stylesheets (src/frontend/src/**.css) @import and url(). Comments,
 * strings and regex literals are tokenized away first, so their text is
 * never taken for an import.
 *
 * The module loaders (backend modules/index.js, frontend modules/registry.js)
 * are the composition root and may import module entries (and glob them).
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
const STYLE = /\.css$/;
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

function walk(dir, out = [], pattern = SOURCE) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out, pattern);
    } else if (pattern.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)\s*$/;

/** End (exclusive) of the string or template literal starting at i, and whether it has ${…}. */
function skipString(code, i) {
  const quote = code[i];
  const n = code.length;
  let j = i + 1;
  let hasExpr = false;
  while (j < n && code[j] !== quote) {
    if (code[j] === '\\') {
      j += 2;
      continue;
    }
    if (quote !== '`' && code[j] === '\n') return { end: j, hasExpr };
    if (quote === '`' && code[j] === '$' && code[j + 1] === '{') {
      hasExpr = true;
      // Skip the expression: braces, nested strings and templates.
      let depth = 1;
      j += 2;
      while (j < n && depth > 0) {
        const c = code[j];
        if (c === '"' || c === "'" || c === '`') {
          j = skipString(code, j).end;
          continue;
        }
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  return { end: Math.min(n, j + 1), hasExpr };
}

/** End (exclusive) of the regex literal starting at i (a `/`), or -1 when it is not one. */
function skipRegex(code, i) {
  let j = i + 1;
  let inClass = false;
  while (j < code.length) {
    const c = code[j];
    if (c === '\n') return -1;
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      j += 1;
      while (/[a-z]/i.test(code[j] || '')) j += 1;
      return j;
    }
    j += 1;
  }
  return -1;
}

/**
 * Source with comments and regex literals blanked and every string or
 * template literal replaced by `#`s of the same length (positions and
 * newlines kept), plus the literals by position: Map(start → { value, hasExpr }).
 */
export function tokenize(code) {
  let out = '';
  const literals = new Map();
  let i = 0;
  const n = code.length;
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && code[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && d === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(code.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '/') {
      const before = out.replace(/\s+$/, '');
      const prev = before[before.length - 1];
      if (prev === undefined || REGEX_BEFORE.has(prev) || REGEX_KEYWORDS.test(before)) {
        const end = skipRegex(code, i);
        if (end > 0) {
          out += blank(code.slice(i, end));
          i = end;
          continue;
        }
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const { end, hasExpr } = skipString(code, i);
      const raw = code.slice(i, end);
      literals.set(i, { value: raw.slice(1, raw.endsWith(c) && raw.length > 1 ? -1 : undefined), hasExpr });
      out += raw.replace(/[^\n]/g, '#');
      i = end;
      continue;
    }
    out += c;
    i += 1;
  }
  return { clean: out, literals };
}

/** Source without comments, and without strings that cannot be import specifiers (positions and newlines kept). */
export function stripComments(code) {
  const { clean, literals } = tokenize(code);
  const out = clean.split('');
  for (const [at] of literals) {
    let end = at;
    while (out[end] === '#') end += 1;
    const keep = /(?:\bfrom|\bimport)\s*$|\bimport\s*\(\s*$/.test(clean.slice(0, at));
    for (let k = at; k < end; k += 1) out[k] = keep ? code[k] : ' ';
  }
  return out.join('');
}

/** The text between the parenthesis at `open` and its match (strings are #s in `clean`, so their parentheses do not count). */
function callArgs(clean, open) {
  let depth = 0;
  for (let k = open; k < clean.length; k += 1) {
    if (clean[k] === '(') depth += 1;
    else if (clean[k] === ')') {
      depth -= 1;
      if (depth === 0) return clean.slice(open + 1, k);
    }
  }
  return clean.slice(open + 1);
}

const lineAt = (text, at) => text.slice(0, at).split('\n').length;
const snippet = (code, at) => code.slice(at, at + 80).split('\n')[0];

/**
 * What a source file loads.
 *   specifiers: [{ specifier, line, kind }] — literal: import / export-from,
 *     import('…'), require('…'), new URL('…', import.meta.url), import.meta.glob('…' | ['…']);
 *   dynamic:    [{ line, kind, code }] — loads the checker cannot follow: import(expr),
 *     a template with ${…}, require(expr), new URL(expr, import.meta.url),
 *     import.meta.glob(expr), createRequire. Inside a module these are violations
 *     (fail closed): a module loads other code only by literal specifiers.
 */
export function scanSource(code) {
  const { clean, literals } = tokenize(code);
  const specifiers = new Map();
  const dynamic = [];
  const add = (at, specifier, kind) => {
    if (!specifiers.has(at)) specifiers.set(at, { specifier, line: lineAt(clean, at), kind });
  };
  const literalAt = (at) => {
    const lit = literals.get(at);
    return lit ? { ...lit, end: at + (clean.slice(at).match(/^#+/)?.[0].length || 0) } : null;
  };
  // A string right after `pos` (spaces skipped) followed by one of `follow`.
  const argAt = (pos) => {
    const at = pos + (clean.slice(pos).match(/^\s*/)[0].length);
    const lit = literalAt(at);
    return lit ? { at, ...lit, rest: clean.slice(lit.end) } : { at, rest: clean.slice(at) };
  };
  let match;

  // import x from '…', import { a } from '…', export { a } from '…', export * from '…'
  const fromRe = /\b(?:import|export)\s[^;#]*?\bfrom\s*(?=#)/g;
  while ((match = fromRe.exec(clean))) {
    const at = match.index + match[0].length;
    const lit = literalAt(at);
    if (lit) add(at, lit.value, 'import');
  }
  // import '…' (side effect)
  const sideRe = /(?<![\w$.])import\s*(?=#)/g;
  while ((match = sideRe.exec(clean))) {
    const at = match.index + match[0].length;
    const lit = literalAt(at);
    if (lit) add(at, lit.value, 'import');
  }
  // import(…), require(…)
  const callRe = /(?<![\w$.])(import|require)\s*\(/g;
  while ((match = callRe.exec(clean))) {
    const open = match.index + match[0].length - 1;
    // A method named import/require (`async import(rows) { … }`) is not a load.
    if (/^\s*\{/.test(clean.slice(open + callArgs(clean, open).length + 2))) continue;
    const arg = argAt(open + 1);
    if (arg.value !== undefined && !arg.hasExpr && /^\s*[,)]/.test(arg.rest)) add(arg.at, arg.value, match[1]);
    else dynamic.push({ line: lineAt(clean, match.index), kind: match[1], code: snippet(code, match.index) });
  }
  // new URL(…, import.meta.url)
  const urlRe = /\bnew\s+URL\s*\(/g;
  while ((match = urlRe.exec(clean))) {
    const open = match.index + match[0].length - 1;
    if (!/\bimport\.meta\.url\b/.test(callArgs(clean, open))) continue;
    const arg = argAt(open + 1);
    if (arg.value !== undefined && !arg.hasExpr && /^\s*,\s*import\.meta\.url\b/.test(arg.rest)) {
      add(arg.at, /^\.{1,2}\//.test(arg.value) ? arg.value : `./${arg.value}`, 'url');
    } else {
      dynamic.push({ line: lineAt(clean, match.index), kind: 'url', code: snippet(code, match.index) });
    }
  }
  // import.meta.glob('…' | ['…', …], options)
  const globRe = /\bimport\.meta\.glob(?:Eager)?\s*\(/g;
  while ((match = globRe.exec(clean))) {
    const arg = argAt(match.index + match[0].length);
    const patterns = [];
    let ok = false;
    if (arg.value !== undefined && !arg.hasExpr) {
      patterns.push({ at: arg.at, value: arg.value });
      ok = /^\s*[,)]/.test(arg.rest);
    } else if (arg.rest.startsWith('[')) {
      let pos = arg.at + 1;
      ok = true;
      for (;;) {
        const item = argAt(pos);
        if (item.value === undefined && item.rest.startsWith(']')) break;
        if (item.value === undefined || item.hasExpr) {
          ok = false;
          break;
        }
        patterns.push({ at: item.at, value: item.value });
        pos = item.end + item.rest.match(/^\s*,?\s*/)[0].length;
      }
    }
    if (ok) for (const pattern of patterns) add(pattern.at, pattern.value.replace(/^!/, ''), 'glob');
    else dynamic.push({ line: lineAt(clean, match.index), kind: 'glob', code: snippet(code, match.index) });
  }
  // createRequire(…): what the returned require loads cannot be followed.
  const createRe = /\bcreateRequire\b/g;
  while ((match = createRe.exec(clean))) dynamic.push({ line: lineAt(clean, match.index), kind: 'createRequire', code: snippet(code, match.index) });

  return { specifiers: [...specifiers.values()], dynamic };
}

/** [{ specifier, line }] of a source file (literal specifiers only). */
export function specifiersOf(code) {
  return scanSource(code).specifiers.map(({ specifier, line }) => ({ specifier, line }));
}

/** [{ specifier, line }] of a stylesheet: @import and url() that point at files. */
export function cssSpecifiersOf(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const found = new Map();
  const patterns = [/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1/g, /\burl\(\s*(['"]?)([^'")\s]+)\1\s*\)/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(clean))) {
      const value = match[2];
      if (/^(?:data:|https?:|\/\/|#|\/|~|@)/i.test(value)) continue;
      const at = match.index + match[0].indexOf(value);
      if (!found.has(at)) found.set(at, { specifier: /^\.{1,2}\//.test(value) ? value : `./${value}`, line: lineAt(clean, at) });
    }
  }
  return [...found.values()];
}

const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
function resolveSpecifier(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier.split(/[?#]/)[0]);
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

const GLOB_CHARS = /[*?{}[\]]/;
const isWithin = (dir, root) => dir === root || dir.startsWith(root + sep);

/** Where a glob pattern may reach: its directory part before the first wildcard. */
function globBase(from, pattern) {
  const head = pattern.split('/');
  const fixed = [];
  for (const part of head) {
    if (GLOB_CHARS.test(part)) break;
    fixed.push(part);
  }
  // A pattern without wildcards names one file; with them, the base directory.
  return { dir: resolve(dirname(from), fixed.join('/') || '.'), wild: fixed.length < head.length };
}

export async function check({ facts } = {}) {
  const { ids, core, requires } = facts || (await loadFacts());
  const files = [...walk(BACKEND), ...walk(FRONTEND)];
  const styles = walk(FRONTEND, [], STYLE);
  const violations = [];
  const judge = (file, from, { specifier, line }, target) => {
    const to = classify(target, ids);
    if (!to.module || to.module === from.module) return;
    const publicTarget = isPublic(to.side, to.inner);
    let rule = null;
    const importerIsCore = !from.module || core.has(from.module);
    if (importerIsCore) {
      if (!core.has(to.module)) rule = 'core-imports-module';
      else if (!publicTarget) rule = 'non-public';
    } else if (!publicTarget) rule = 'non-public';
    else if (!core.has(to.module) && !requires[from.module]?.has(to.module)) rule = 'not-required';
    if (rule) violations.push({ rule, from: rel(file), line, specifier, to: rel(target), fromModule: from.module, toModule: to.module });
  };
  // Inside modules/ (a module, or the modules folder itself) every load must be followable.
  const inModulesDir = (file) => isWithin(file, BACKEND_MODULES) || isWithin(file, FRONTEND_MODULES);

  for (const file of files) {
    if (LOADERS.has(file)) continue;
    const from = classify(file, ids);
    const { specifiers, dynamic } = scanSource(readFileSync(file, 'utf8'));
    for (const item of specifiers) {
      if (!item.specifier.startsWith('.')) continue;
      if (item.kind === 'glob') {
        const { dir, wild } = globBase(file, item.specifier);
        if (!wild) {
          judge(file, from, item, resolveSpecifier(file, item.specifier));
          continue;
        }
        // A glob over the modules folder (or above it) reaches every module: only the loaders may.
        if ([BACKEND_MODULES, FRONTEND_MODULES].some((root) => isWithin(root, dir))) {
          violations.push({ rule: 'glob-spans-modules', from: rel(file), line: item.line, specifier: item.specifier, to: rel(dir), fromModule: from.module, toModule: null });
          continue;
        }
        judge(file, from, item, join(dir, '*'));
        continue;
      }
      judge(file, from, item, resolveSpecifier(file, item.specifier));
    }
    if (inModulesDir(file)) {
      for (const item of dynamic) violations.push({ rule: 'dynamic-load', from: rel(file), line: item.line, specifier: item.code, to: `(${item.kind})`, fromModule: from.module, toModule: null });
    }
  }
  for (const file of styles) {
    const from = classify(file, ids);
    for (const item of cssSpecifiersOf(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(file, item.specifier);
      if (target) judge(file, from, item, target);
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
  return { violations: remaining, allowed: violations.length - remaining.length, stale, files: files.length + styles.length };
}

const RULES = {
  'non-public': 'imports a non-public file of another module (use its api.js / public.js)',
  'not-required': 'imports a module that is not in its manifest `requires` (use the runtime registry)',
  'core-imports-module': 'core imports a module (use an extension point)',
  'dynamic-load': 'loads code the checker cannot follow (non-literal import()/require/new URL/import.meta.glob, createRequire) — use literal specifiers',
  'glob-spans-modules': 'an import.meta.glob over the modules folder reaches every module (only the loaders may)',
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await check();
  if (flag('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const v of result.violations) console.log(`${v.from}:${v.line}  ${v.specifier}\n    ${v.fromModule || 'core'} → ${v.toModule || v.to}: ${RULES[v.rule]}`);
    for (const entry of result.stale) console.log(`stale allow-list entry: ${entry.from} → ${entry.to}`);
    console.log(`\n${result.files} files, ${result.violations.length} violation(s), ${result.allowed} allowed exception(s)${result.stale.length ? `, ${result.stale.length} stale allow-list entr(ies)` : ''}`);
  }
  process.exitCode = result.violations.length || result.stale.length ? 1 : 0;
}
