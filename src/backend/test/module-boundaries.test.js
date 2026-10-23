import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, cssSpecifiersOf, scanSource, specifiersOf, stripComments } from '../../../scripts/check-module-boundaries.mjs';

/*
 * Module boundaries (scripts/check-module-boundaries.mjs, `npm run
 * check:modules`): no module imports another module's internal files or a
 * module outside its manifest `requires`, and the core imports no module.
 * Justified exceptions are listed (with a reason) in
 * scripts/module-boundaries.allow.json — the list may only shrink.
 */

const here = dirname(fileURLToPath(import.meta.url));

test('module boundaries: the source tree has no violations and no stale exceptions', async () => {
  const result = await check();
  const lines = result.violations.map((v) => `${v.from}:${v.line} ${v.specifier} (${v.rule})`);
  assert.deepEqual(lines, []);
  assert.deepEqual(result.stale, []);
  assert.ok(result.files > 500, 'the scan found the sources');
});

test('module boundaries: every exception says why', () => {
  const allow = JSON.parse(readFileSync(join(here, '../../../scripts/module-boundaries.allow.json'), 'utf8'));
  for (const entry of allow) assert.ok(entry.from && entry.to && String(entry.reason || '').length > 20, JSON.stringify(entry));
});

test('module boundaries: import, export-from and dynamic import specifiers; comments and strings are not imports', () => {
  const code = [
    "import a from './a.js';",
    "import { b, c as d } from '../b/api.js';",
    "export { e } from './e.js';",
    "export * from './star.js';",
    "import './side.css';",
    "const lazyOne = () => import('../x/y.js');",
    '// import z from "./commented.js";',
    "/* import w from './block.js'; */",
    "const text = 'import q from \"./in-string.js\"';",
    'const tpl = () => import(`./${name}.js`);',
  ].join('\n');
  const found = specifiersOf(code).map((item) => item.specifier).sort();
  assert.deepEqual(found, ['../b/api.js', '../x/y.js', './a.js', './e.js', './side.css', './star.js']);
  assert.equal(stripComments('a // b\nc /* d */ e').replace(/\s+/g, ' ').trim(), 'a c e');
});

test('module boundaries: fail closed — loads the checker cannot follow are reported, literal ones followed', () => {
  const code = [
    'const a = () => import(`../tasks/${name}.js`);',
    'const b = () => import(path);',
    "const c = require('../crm/x.js'); const d = require(p);",
    "const e = new URL('./worker.js', import.meta.url); const f = new URL(name, import.meta.url); const g = new URL(href);",
    "const h = import.meta.glob(['./a/*.js', './b/*.js'], { eager: true }); const i = import.meta.glob(pattern);",
    "import { createRequire } from 'node:module';",
    'const obj = { async import(rows) { return rows; } };',
    "const re = /['\"`]/g; import j from './after-regex.js';",
  ].join('\n');
  const { specifiers, dynamic } = scanSource(code);
  assert.deepEqual(specifiers.map((item) => `${item.kind}:${item.specifier}`).sort(), [
    'glob:./a/*.js',
    'glob:./b/*.js',
    'import:./after-regex.js',
    'import:node:module',
    'require:../crm/x.js',
    'url:./worker.js',
  ]);
  assert.deepEqual(dynamic.map((item) => `${item.line}:${item.kind}`).sort(), ['1:import', '2:import', '3:require', '4:url', '5:glob', '6:createRequire']);
});

test('module boundaries: stylesheets — @import and url() are followed, data:, absolute and comments are not', () => {
  const css = "@import './a.css';\n/* @import '../no.css'; */\n.x { background: url(../crm/i.png) }\n.y { background: url('data:image/png;base64,xx') } .z { mask: url(/icons/a.svg) }\n@import url(\"../b.css\");";
  assert.deepEqual(cssSpecifiersOf(css).map((item) => item.specifier).sort(), ['../b.css', '../crm/i.png', './a.css']);
});
