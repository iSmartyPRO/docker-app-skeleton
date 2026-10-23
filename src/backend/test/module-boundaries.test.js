import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, specifiersOf, stripComments } from '../../../scripts/check-module-boundaries.mjs';

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
