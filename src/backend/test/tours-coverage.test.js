import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

/*
 * Every module of the manifest has a guided tour, or is listed below as
 * intentionally without one; every anchor any tour names is marked in the
 * frontend source (grep-based, like business-tours.test.js); every tour has
 * texts in both languages. Tours come from tour/content (built-in, core
 * modules) and modules/<id>/tour.js (registered by businessTours.js,
 * people/tours.js, directory/register.js).
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../frontend/src');

/** Modules without a tour, on purpose — and why. */
const WITHOUT_TOUR = {
  assistant: 'an overlay (the robot), not a page to walk through',
};

/** Tours held to 5–8 steps (the older built-in ones predate the rule). */
const SIZED = ['calendar', 'kb', 'companies', 'resources', 'notifications'];

const lookup = (dict, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n' && name !== 'node_modules') sources(path, out);
    } else if (/\.jsx?$/.test(name) && name !== 'tour.js' && !path.includes(`${join('tour', 'content')}`)) {
      out.push({ path, text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

/** Is `target` marked somewhere: literally, or through a data-tour={`prefix.${key}`} template with the key in the same file? */
function anchored(files, target) {
  for (const { text } of files) {
    if (text.includes(`data-tour="${target}"`) || text.includes(`tour: '${target}'`) || text.includes(`tour="${target}"`)) return true;
    if (/data-tour=\{tour\}/.test(text) && text.includes(`'${target}'`)) return true;
    for (const match of text.matchAll(/data-tour=\{`([a-z0-9.]+)\$\{/g)) {
      const prefix = match[1];
      if (target.startsWith(prefix) && text.includes(`'${target.slice(prefix.length)}'`)) return true;
    }
  }
  return false;
}

async function allTours() {
  const { BUILTIN_TOURS } = await import('../../frontend/src/tour/content/index.js');
  const tours = [...BUILTIN_TOURS];
  for (const name of readdirSync(join(SRC, 'modules'))) {
    const file = join(SRC, 'modules', name, 'tour.js');
    if (existsSync(file)) tours.push((await import(file)).default);
  }
  return tours;
}

test('tours: every manifest module has a tour or is whitelisted', async () => {
  const { MODULE_MANIFEST } = await import('../modules/manifest.js');
  const tours = await allTours();
  const covered = new Set(tours.map((tour) => tour.module || tour.id));
  const missing = Object.keys(MODULE_MANIFEST).filter((id) => !covered.has(id) && !WITHOUT_TOUR[id]);
  assert.deepEqual(missing, [], `modules without a tour (add one or whitelist with a reason): ${missing.join(', ')}`);
  for (const id of Object.keys(WITHOUT_TOUR)) assert.ok(!covered.has(id), `${id} has a tour now: drop it from WITHOUT_TOUR`);
});

test('tours: every module tour is registered with the engine', async () => {
  const registered = [
    readFileSync(join(SRC, 'tour/content/index.js'), 'utf8'),
    readFileSync(join(SRC, 'modules/shared/businessTours.js'), 'utf8'),
    readFileSync(join(SRC, 'modules/people/tours.js'), 'utf8'),
    existsSync(join(SRC, 'modules/directory/register.js')) ? readFileSync(join(SRC, 'modules/directory/register.js'), 'utf8') : '',
  ].join('\n');
  for (const name of readdirSync(join(SRC, 'modules'))) {
    if (!existsSync(join(SRC, 'modules', name, 'tour.js'))) continue;
    assert.ok(registered.includes(`../${name}/tour'`) || (name === 'directory' && registered.includes(`from './tour'`)), `${name}/tour.js is not registered`);
  }
});

test('tours: valid, texts in both languages, every anchor marked in the frontend', async () => {
  const engine = await import('../../frontend/src/tour/engine.js');
  const { dictionaries } = await import('../../frontend/src/i18n/translations.js');
  const files = sources(SRC);
  const broken = [];
  for (const def of await allTours()) {
    const tour = engine.normalizeTour(def);
    if (SIZED.includes(tour.id)) assert.ok(tour.steps.length >= 5 && tour.steps.length <= 8, `${tour.id}: ${tour.steps.length} steps`);
    for (const key of [tour.title, ...tour.steps.flatMap((step) => [step.title, step.text])].filter(Boolean)) {
      for (const locale of ['ru', 'en']) assert.equal(typeof lookup(dictionaries[locale], key), 'string', `${tour.id}: ${locale} ${key}`);
    }
    for (const step of tour.steps.filter((item) => item.target)) if (!anchored(files, step.target)) broken.push(`${tour.id}: ${step.target}`);
  }
  assert.deepEqual(broken, [], `anchors not marked in the frontend: ${broken.join(', ')}`);
});
