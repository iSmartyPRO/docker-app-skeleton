import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Guided tours: the pure engine (registry, permission planning, skipping
 * missing anchors, progress, placement, auto-start rules), the server-side
 * mark validation and the texts of every built-in tour in both languages.
 */

const engine = await import('../../frontend/src/tour/engine.js');
const { sanitizeTourMark } = await import('../services/tours.js');

const tour = (steps, extra = {}) => engine.normalizeTour({ id: 'demo', steps, ...extra });

test('normalizeTour validates ids, steps and defaults', () => {
  assert.throws(() => engine.normalizeTour({ id: 'Bad Id', steps: [{ title: 'x' }] }), /must match/);
  assert.throws(() => engine.normalizeTour({ id: 'x', steps: [] }), /no steps/);
  assert.throws(() => engine.normalizeTour({ id: 'x', steps: [{ id: 'a', title: 't' }, { id: 'a', title: 't' }] }), /duplicate/);
  assert.throws(() => engine.normalizeTour({ id: 'x', steps: [{ id: 'a' }] }), /neither title nor text/);
  const t = tour([{ title: 'a' }, { text: 'b' }]);
  assert.equal(t.module, 'demo');
  assert.equal(t.version, 1);
  assert.deepEqual(t.steps.map((s) => s.id), ['step1', 'step2']);
  assert.equal(t.steps[0].placement, 'auto');
});

test('registry: register, look up by module, unregister', () => {
  const off = engine.registerTour({ id: 'unit-x', module: 'unitmod', steps: [{ title: 'a' }] });
  assert.ok(engine.hasTour('unitmod'));
  assert.equal(engine.tourForModule('unitmod').id, 'unit-x');
  assert.equal(engine.getTour('unit-x').module, 'unitmod');
  off();
  assert.equal(engine.hasTour('unitmod'), false);
});

test('planSteps keeps only steps allowed for the person («в рамках доступа»)', () => {
  const t = tour([
    { id: 'a', title: 'a' },
    { id: 'b', title: 'b', when: ({ can }) => can('tasks.admin') },
    { id: 'c', title: 'c', when: () => {
      throw new Error('boom');
    } },
    { id: 'd', title: 'd', when: ({ can }) => can('tasks.view') },
  ]);
  const ctx = { can: (perm) => perm === 'tasks.view' };
  assert.deepEqual(engine.planSteps(t, ctx).map((s) => s.id), ['a', 'd']);
});

test('nextIndex and progressOf skip steps whose anchors are missing', () => {
  const steps = ['a', 'b', 'c', 'd', 'e'];
  const missing = new Set([1, 3]);
  assert.equal(engine.nextIndex(steps, -1, 1, missing), 0);
  assert.equal(engine.nextIndex(steps, 0, 1, missing), 2);
  assert.equal(engine.nextIndex(steps, 2, 1, missing), 4);
  assert.equal(engine.nextIndex(steps, 4, 1, missing), -1);
  assert.equal(engine.nextIndex(steps, 2, -1, missing), 0);
  assert.equal(engine.nextIndex(steps, 0, -1, missing), -1);
  assert.deepEqual(engine.progressOf(steps, 2, missing), { current: 2, total: 3 });
  assert.deepEqual(engine.progressOf(steps, 0), { current: 1, total: 5 });
});

test('onRoute and anchorSelector', () => {
  assert.ok(engine.onRoute('/app/tasks', '/app/tasks'));
  assert.ok(engine.onRoute('/app/tasks/WEB-1', '/app/tasks/'));
  assert.equal(engine.onRoute('/app/tasksx', '/app/tasks'), false);
  assert.ok(engine.onRoute('/anything', null));
  assert.equal(engine.anchorSelector('a"b\\c'), '[data-tour="abc"]');
});

test('placePopover prefers the requested side, flips and clamps into the screen', () => {
  const viewport = { width: 1200, height: 800 };
  const popover = { width: 360, height: 200 };
  const below = engine.placePopover({ target: { top: 20, left: 1100, width: 40, height: 40 }, popover, viewport });
  assert.equal(below.placement, 'bottom');
  assert.ok(below.left + popover.width <= viewport.width - 12, 'clamped to the right edge');
  assert.equal(below.arrow, 1120 - below.left, 'arrow points at the anchor centre');
  const flipped = engine.placePopover({ target: { top: 700, left: 500, width: 100, height: 60 }, popover, viewport, placement: 'bottom' });
  assert.equal(flipped.placement, 'top');
  const right = engine.placePopover({ target: { top: 300, left: 10, width: 200, height: 40 }, popover, viewport, placement: 'right' });
  assert.equal(right.placement, 'right');
  assert.equal(right.left, 10 + 200 + 14);
  const centred = engine.placePopover({ target: null, popover, viewport });
  assert.equal(centred.placement, 'center');
  assert.equal(centred.left, (1200 - 360) / 2);
});

test('auto-start: portal first, module on first visit, never while impersonating or switched off', () => {
  const portal = tour([{ title: 'p' }], { id: 'portal' });
  const tasks = tour([{ title: 't' }], { id: 'tasks', module: 'tasks', version: 2 });
  const base = { user: { id: 1 }, running: false, portalTour: portal, moduleTourOf: (id) => (id === 'tasks' ? tasks : null) };
  const fresh = { seen: {}, disabled: false };
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: fresh }).id, 'portal');
  const seenPortal = { seen: { portal: { version: 1 } }, disabled: false };
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: seenPortal }).id, 'tasks');
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: seenPortal, justRan: true }), null);
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/files', state: seenPortal }), null);
  // An older version of the module tour was seen: the new one shows once more.
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: { seen: { portal: { version: 1 }, tasks: { version: 1 } } } }).id, 'tasks');
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: { seen: { portal: { version: 1 }, tasks: { version: 2 } } } }), null);
  assert.equal(engine.autoStartCandidate({ ...base, pathname: '/app/tasks', state: { ...fresh, disabled: true } }), null);
  assert.equal(engine.autoStartCandidate({ ...base, user: { id: 1, impersonator: { id: 2 } }, pathname: '/app/tasks', state: fresh }), null);
  assert.equal(engine.autoStartCandidate({ ...base, running: true, pathname: '/', state: fresh }), null);
  for (const pathname of ['/login', '/s/abc', '/l/tok', '/d/tok', '/setup', '/install']) {
    assert.equal(engine.autoStartCandidate({ ...base, pathname, state: fresh }), null, pathname);
  }
  assert.equal(engine.autoStartCandidate({ ...base, user: null, pathname: '/', state: fresh }), null);
});

test('sanitizeTourMark accepts ids, statuses and versions within limits', () => {
  assert.deepEqual(sanitizeTourMark({ id: 'tasks', status: 'skipped', version: 3 }), { id: 'tasks', status: 'skipped', version: 3 });
  assert.deepEqual(sanitizeTourMark({ id: 'portal', status: 'weird', version: 'x' }), { id: 'portal', status: 'done', version: 1 });
  assert.equal(sanitizeTourMark({ id: 'a', version: 99999 }).version, 1000);
  assert.throws(() => sanitizeTourMark({ id: '../etc' }), (err) => err.statusCode === 400);
  assert.throws(() => sanitizeTourMark({}), (err) => err.code === 'TOUR_ID');
});

test('built-in tours: valid definitions, texts in both languages', async () => {
  const { BUILTIN_TOURS } = await import('../../frontend/src/tour/content/index.js');
  const { dictionaries } = await import('../../frontend/scripts/i18n-node.mjs');
  const lookup = (dict, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);
  const ids = BUILTIN_TOURS.map((t) => t.id);
  assert.deepEqual(ids.sort(), ['calendar', 'chat', 'companies', 'dashboard', 'drive', 'files', 'kb', 'notifications', 'portal', 'qr', 'remote', 'resources', 'tasks']);
  for (const def of BUILTIN_TOURS) {
    const t = engine.normalizeTour(def);
    for (const key of [t.title, ...t.steps.flatMap((s) => [s.title, s.text])].filter(Boolean)) {
      for (const locale of ['ru', 'en']) assert.equal(typeof lookup(dictionaries[locale], key), 'string', `${locale} ${key}`);
    }
  }
  for (const key of ['progress', 'next', 'back', 'skip', 'done', 'close', 'button', 'buttonHint']) {
    assert.ok(lookup(dictionaries.ru, `tour.ui.${key}`) && lookup(dictionaries.en, `tour.ui.${key}`), key);
  }
  assert.equal(lookup(dictionaries.ru, 'tour.ui.progress').replace('{current}', 2).replace('{total}', 7), '2 из 7');
});
