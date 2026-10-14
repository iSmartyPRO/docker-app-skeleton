import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_SLUGS, SLUG_MAX, normalizeSlug, slugCandidates, transliterate, validateSlug } from '../modules/shared/linkSlug.js';

/* Custom link addresses: normalization, transliteration, rules, suggestions, and parity with the browser copy. */

test('slug: Cyrillic is transliterated, everything else becomes single hyphens', () => {
  assert.equal(normalizeSlug('Договор КейКомпани'), 'dogovor-keykompani');
  assert.equal(transliterate('Щука и ёж'), 'Shchuka i yozh');
  assert.equal(normalizeSlug('  Акт №12 / 2026 '), 'akt-no12-2026');
  assert.equal(normalizeSlug('Өрнөк Үй Ң'), 'ornok-uy-ng');
  assert.equal(normalizeSlug('Crème brûlée'), 'creme-brulee');
  assert.equal(normalizeSlug('--Hello__World--'), 'hello-world');
  assert.equal(normalizeSlug('Объём'), 'obyom');
});

test('slug: a trailing hyphen is kept while typing, dropped when final', () => {
  assert.equal(normalizeSlug('dogovor-', { final: false }), 'dogovor-');
  assert.equal(normalizeSlug('dogovor ', { final: false }), 'dogovor-');
  assert.equal(normalizeSlug('dogovor-'), 'dogovor');
  assert.equal(normalizeSlug('-lead', { final: false }), 'lead');
});

test('slug: validation reasons', () => {
  assert.equal(validateSlug('dogovor-2026'), null);
  assert.equal(validateSlug('abc'), null);
  assert.equal(validateSlug('ab'), 'SHORT');
  assert.equal(validateSlug('a'.repeat(SLUG_MAX)), null);
  assert.equal(validateSlug('a'.repeat(SLUG_MAX + 1)), 'LONG');
  assert.equal(validateSlug('Dogovor'), 'CHARS');
  assert.equal(validateSlug('dog_ovor'), 'CHARS');
  assert.equal(validateSlug('договор'), 'CHARS');
  assert.equal(validateSlug('-abc'), 'HYPHEN');
  assert.equal(validateSlug('abc-'), 'HYPHEN');
  assert.equal(validateSlug('ab--c'), 'HYPHEN');
  for (const word of ['api', 'admin', 'login', 'assets', 'static', 'uploads', 'new', 'edit']) assert.equal(validateSlug(word), word.length < 3 ? 'SHORT' : 'RESERVED', word);
  assert.ok(RESERVED_SLUGS.has('s') && RESERVED_SLUGS.has('l') && RESERVED_SLUGS.has('d'));
});

test('slug: suggestions are valid, distinct and differ from the base', () => {
  const list = slugCandidates('dogovor', { year: 2026, random: (n = 3) => 'x'.repeat(n) });
  assert.deepEqual(list, ['dogovor-2', 'dogovor-2026', 'dogovor-xxx', 'dogovor-3', 'dogovor-xxxx']);
  const long = slugCandidates('a'.repeat(SLUG_MAX), { year: 2026 });
  assert.ok(long.length >= 3);
  for (const slug of long) assert.equal(validateSlug(slug), null, slug);
  for (const slug of slugCandidates('admin')) assert.equal(validateSlug(slug), null, slug);
});

test('slug: browser and server rules agree', async () => {
  const web = await import('../../frontend/src/lib/linkSlug.js');
  const samples = ['Договор КейКомпани', 'Crème brûlée', 'ab', 'api', 'a--b', 'Өрнөк', 'x'.repeat(70), ' hello ', 'dog_ovor', 'Щука'];
  for (const sample of samples) {
    assert.equal(web.normalizeSlug(sample), normalizeSlug(sample), sample);
    assert.equal(web.normalizeSlug(sample, { final: false }), normalizeSlug(sample, { final: false }), sample);
    assert.equal(web.validateSlug(sample), validateSlug(sample), sample);
    assert.equal(web.validateSlug(normalizeSlug(sample)), validateSlug(normalizeSlug(sample)), sample);
  }
  assert.deepEqual([...web.RESERVED_SLUGS].sort(), [...RESERVED_SLUGS].sort());
  assert.equal(web.slugFromName('Договор КейКомпани.pdf'), 'dogovor-keykompani');
});
