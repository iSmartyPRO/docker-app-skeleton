import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';
import { slugProblem, slugify } from '../modules/kb/shares.js';

test('modules resolve to defaults and keep stored state', () => {
  const fresh = resolveModules();
  assert.equal(fresh.kb.enabled, true);
  assert.equal(fresh.kb.settings.maxUploadMb, 50);

  const stored = resolveModules({ kb: { enabled: false, settings: { defaultColor: '#10B981' } } });
  assert.equal(stored.kb.enabled, false);
  assert.equal(stored.kb.settings.defaultColor, '#10B981');
  assert.equal(stored.kb.settings.publicLinks, true, 'missing keys fall back to defaults');
});

test('module settings are sanitised field by field', () => {
  const next = sanitizeModules(resolveModules(), {
    kb: {
      enabled: false,
      settings: {
        defaultColor: 'red; background:url(x)',
        defaultIcon: '../../etc',
        maxUploadMb: 999999,
        fileGroups: ['pdf', 'exe', 'images'],
        publicLinks: 'yes',
        maxShareDays: -5,
      },
    },
    unknown: { enabled: true },
  });
  assert.equal(next.kb.enabled, false);
  assert.equal(next.kb.settings.defaultColor, '#3B82F6', 'invalid colour ignored');
  assert.equal(next.kb.settings.defaultIcon, 'folder', 'invalid icon ignored');
  assert.equal(next.kb.settings.maxUploadMb, 1024, 'upload limit clamped');
  assert.ok(!next.kb.settings.fileGroups.includes('exe'), 'unknown file groups dropped');
  assert.equal(next.kb.settings.publicLinks, true, 'non-boolean flags ignored');
  assert.equal(next.kb.settings.maxShareDays, 0);
  assert.equal(next.unknown, undefined, 'unknown modules are not created');
});

test('slugify transliterates Cyrillic and Kazakh titles', () => {
  assert.equal(slugify('Отдел кадров'), 'otdel-kadrov');
  assert.equal(slugify('Онбординг 2026!'), 'onbording-2026');
  assert.equal(slugify('Қазақстан — Үкімет'), 'kazakstan-ukimet');
  assert.equal(slugify('  Café   Menu  '), 'cafe-menu');
  assert.ok(slugify('x'.repeat(200)).length <= 48);
});

test('slugProblem rejects malformed and reserved names', () => {
  assert.equal(slugProblem('onboarding'), null);
  assert.equal(slugProblem('hr-2026'), null);
  assert.equal(slugProblem('admin'), 'RESERVED');
  assert.equal(slugProblem('api'), 'RESERVED');
  assert.equal(slugProblem('a'), 'FORMAT', 'too short');
  assert.equal(slugProblem('-lead'), 'FORMAT');
  assert.equal(slugProblem('trail-'), 'FORMAT');
  assert.equal(slugProblem('double--dash'), 'FORMAT');
  assert.equal(slugProblem('Upper'), 'FORMAT');
  assert.equal(slugProblem('../etc'), 'FORMAT');
});
