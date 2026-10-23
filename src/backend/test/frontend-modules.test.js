import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_CATALOG } from '../modules/catalog.js';

/*
 * The browser side of module boundaries: the shell builds while modules are
 * absent (src/frontend/scripts/check-module-absence.mjs — every optional
 * module at once, then each on its own), and the extension points answer
 * sensibly for a module that is not there.
 */

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '../../frontend/scripts/check-module-absence.mjs');
const absence = (ids = []) => execFileSync(process.execPath, [script, ...ids], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' } });

test('frontend: the shell builds with every optional module absent', () => {
  assert.match(absence(), /the shell builds/);
});

test('frontend: the shell builds with each optional module absent on its own', () => {
  for (const module of MODULE_CATALOG.filter((entry) => !entry.core)) assert.match(absence([module.id]), /the shell builds/, module.id);
});

test('frontend: extension points without a module — empty lists, null public UI', async () => {
  const ext = await import('../../frontend/src/platform/extensions.js');
  assert.deepEqual(ext.contributions('nobody.here'), []);
  assert.equal(ext.moduleUi('not-installed'), null);
  const seen = [];
  const off = ext.subscribe('test.point', () => seen.push(ext.contributions('test.point').map((item) => item.id)));
  const removeB = ext.contribute('test.point', { id: 'b', order: 20 });
  ext.contribute('test.point', { id: 'a', order: 10 });
  assert.deepEqual(ext.contributions('test.point').map((item) => item.id), ['a', 'b']);
  removeB();
  assert.deepEqual(ext.contributions('test.point').map((item) => item.id), ['a']);
  off();
  assert.deepEqual(seen, [['b'], ['a', 'b'], ['a']]);
  ext.provideModule('test-mod', { hello: () => 'hi' });
  assert.equal(ext.moduleUi('test-mod').hello(), 'hi');
});

test('frontend: dashboard widgets — only registered types, in their order', async () => {
  const widgets = await import('../../frontend/src/platform/widgets/registry.js');
  const Component = () => null;
  const offLate = widgets.registerWidget('zLate', { order: 900, Component });
  widgets.registerWidget('aEarly', { order: 5, Component });
  assert.deepEqual(Object.keys(widgets.WIDGET_REGISTRY), ['aEarly', 'zLate']);
  offLate();
  assert.deepEqual(Object.keys(widgets.WIDGET_REGISTRY), ['aEarly']);
  assert.equal(widgets.WIDGET_REGISTRY.missingModuleWidget, undefined);
  assert.throws(() => widgets.registerWidget('noComponent', {}));
});
