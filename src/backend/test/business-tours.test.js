import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

/*
 * The guided tours of the business modules (frontend files, pure JS): valid
 * definitions of 5–8 steps, texts in both languages, every anchor a step
 * names is really marked in the frontend source (data-tour="…", a
 * ModuleHeader action's `tour`, or a NavLink built with a data-tour template),
 * and the registrar lists every tour.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../frontend/src');
const MODULES = ['crm', 'masterplan', 'procurement', 'contracts', 'warehouse', 'approvals'];
const lookup = (dict, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n' && name !== 'node_modules') sources(path, out);
    } else if (/\.jsx?$/.test(name) && name !== 'tour.js') {
      out.push({ path, text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

/** Is `target` marked somewhere: literally, or through a data-tour={`prefix.${key}`} template with the key in the same file? */
function anchored(files, target) {
  for (const { text } of files) {
    if (text.includes(`data-tour="${target}"`) || text.includes(`tour: '${target}'`) || text.includes(`tour="${target}"`)) return true;
    // A helper that renders data-tour={tour} and gets the anchor as a string argument.
    if (/data-tour=\{tour\}/.test(text) && text.includes(`'${target}'`)) return true;
    for (const match of text.matchAll(/data-tour=\{`([a-z0-9.]+)\$\{/g)) {
      const prefix = match[1];
      if (target.startsWith(prefix) && text.includes(`'${target.slice(prefix.length)}'`)) return true;
    }
  }
  return false;
}

test('business tours: valid, 5–8 steps, texts in both languages', async () => {
  const engine = await import('../../frontend/src/tour/engine.js');
  const { dictionaries } = await import('../../frontend/scripts/i18n-node.mjs');
  for (const id of MODULES) {
    const { default: def } = await import(`../../frontend/src/modules/${id}/tour.js`);
    const tour = engine.normalizeTour(def);
    assert.equal(tour.id, id);
    assert.equal(tour.module, id);
    assert.ok(tour.route && tour.route.startsWith(`/app/${id}`), `${id}: route`);
    assert.ok(tour.steps.length >= 5 && tour.steps.length <= 8, `${id}: ${tour.steps.length} steps`);
    for (const key of [tour.title, ...tour.steps.flatMap((step) => [step.title, step.text])].filter(Boolean)) {
      for (const locale of ['ru', 'en']) assert.equal(typeof lookup(dictionaries[locale], key), 'string', `${locale} ${key}`);
    }
  }
});

test('business tours: every anchor is marked in the frontend source', async () => {
  const files = sources(SRC);
  for (const id of MODULES) {
    const { default: def } = await import(`../../frontend/src/modules/${id}/tour.js`);
    for (const step of def.steps.filter((item) => item.target)) assert.ok(anchored(files, step.target), `${id}: no data-tour="${step.target}" in the frontend`);
  }
});

test('business tours: each module registers its tour in its register.js, which the module registry loads', () => {
  for (const id of MODULES) {
    const entry = readFileSync(join(SRC, `modules/${id}/register.js`), 'utf8');
    assert.ok(entry.includes("from './tour'") && entry.includes('registerTour('), id);
  }
  const registry = readFileSync(join(SRC, 'modules/registry.js'), 'utf8');
  assert.match(registry, /import\.meta\.glob\(\[?'\.\/\*\/register\.js'/);
  // A module distributed as a package is left out of the core glob: its web/index.js imports register.js.
  for (const id of MODULES.filter((item) => registry.includes(`'!./${item}/register.js'`))) {
    assert.match(readFileSync(join(SRC, `modules/${id}/index.js`), 'utf8'), /import '\.\/register'/, id);
  }
});
