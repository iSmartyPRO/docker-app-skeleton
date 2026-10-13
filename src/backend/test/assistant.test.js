import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedAvatars, cleanPrefs, resolvePrefs } from '../modules/assistant/service.js';
import { MODULE_CATALOG } from '../modules/catalog.js';

test('assistant prefs keep only known values', () => {
  const next = cleanPrefs({ enabled: false, avatar: 'evil', size: 'XL', greeted: ['tasks', 'tasks', '../x', 'calendar'] }, { avatar: 'orbi' });
  assert.deepEqual(next, { enabled: false, avatar: 'orbi', greeted: ['tasks', 'calendar'] });
  assert.equal(cleanPrefs({ avatar: null }).avatar, null);
  assert.deepEqual(cleanPrefs({ resetGreetings: true }, { greeted: ['tasks'] }).greeted, []);
});

test('assistant is on by default and falls back to the organisation robot', () => {
  const prefs = resolvePrefs({}, { avatar: 'kiko', proactive: false });
  assert.equal(prefs.enabled, true);
  assert.equal(prefs.avatar, null);
  assert.equal(prefs.defaultAvatar, 'kiko');
  assert.equal(prefs.size, 'M');
  assert.equal(prefs.proactive, false);
  assert.equal(resolvePrefs({ enabled: false }, {}).enabled, false);
});

test('assistant colours are kept per character and can be reset', () => {
  let next = cleanPrefs({ colors: { pro: '#E11D48', evil: '#000000', kiko: 'red' } }, {});
  assert.deepEqual(next.colors, { pro: '#e11d48' });
  next = cleanPrefs({ colors: { pro: null, ryzhik: '#22C55E' } }, next);
  assert.deepEqual(next.colors, { ryzhik: '#22c55e' });
  assert.deepEqual(resolvePrefs({ colors: { ryzhik: '#22c55e', bad: '#000000' } }, {}).colors, { ryzhik: '#22c55e' });
  assert.equal(cleanPrefs({ avatar: 'volt' }).avatar, 'volt');
});

test('administrators decide which characters people may choose', () => {
  assert.equal(allowedAvatars({}).length > 10, true);
  assert.deepEqual(allowedAvatars({ choice: 'some', allowed: ['pro', 'evil', 'boy'] }), ['pro', 'boy']);
  assert.deepEqual(allowedAvatars({ choice: 'one', avatar: 'builder' }), ['builder']);
  // A personal pick outside the allowed set falls back to the default.
  assert.equal(resolvePrefs({ avatar: 'kiko' }, { choice: 'some', allowed: ['pro', 'boy'], avatar: 'pro' }).avatar, null);
  assert.equal(resolvePrefs({ avatar: 'boy' }, { choice: 'some', allowed: ['pro', 'boy'], avatar: 'pro' }).avatar, 'boy');
  assert.equal(resolvePrefs({ avatar: 'boy' }, { choice: 'one', avatar: 'pro' }).avatar, null);
  assert.deepEqual(resolvePrefs({ colors: { pro: '#111111' } }, { allowColors: false }).colors, {});
  // The default always belongs to the allowed set; an empty set means everyone.
  const sanitize = MODULE_CATALOG.find((module) => module.id === 'assistant').sanitize;
  assert.equal(sanitize({ avatar: 'pixel', choice: 'all', allowed: [] }, { choice: 'some', allowed: ['boy', 'girl'] }).avatar, 'boy');
  assert.equal(sanitize({ avatar: 'pixel', choice: 'all', allowed: [] }, { choice: 'some', allowed: [] }).choice, 'all');
});

test('the second cast of characters can be picked, coloured and allowed', () => {
  const added = ['nexus', 'bubbles', 'doctor', 'toddler', 'zayka', 'berkut', 'jibek', 'shadow', 'aurora', 'bao', 'pingo'];
  const all = allowedAvatars({});
  assert.equal(all.length, 28);
  assert.equal(new Set(all).size, all.length);
  for (const id of added) {
    assert.ok(all.includes(id), id);
    assert.equal(cleanPrefs({ avatar: id }).avatar, id);
  }
  assert.deepEqual(cleanPrefs({ colors: { pingo: '#0EA5E9' } }, {}).colors, { pingo: '#0ea5e9' });
  const sanitize = MODULE_CATALOG.find((module) => module.id === 'assistant').sanitize;
  const next = sanitize({ avatar: 'pixel', choice: 'all', allowed: [] }, { avatar: 'aurora', choice: 'some', allowed: ['shadow', 'aurora', 'evil'] });
  assert.equal(next.avatar, 'aurora');
  assert.deepEqual(next.allowed, ['shadow', 'aurora']);
});
