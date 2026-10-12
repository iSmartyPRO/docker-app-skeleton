import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPrefs, resolvePrefs } from '../modules/assistant/service.js';

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
  next = cleanPrefs({ colors: { pro: null, uku: '#22C55E' } }, next);
  assert.deepEqual(next.colors, { uku: '#22c55e' });
  assert.deepEqual(resolvePrefs({ colors: { uku: '#22c55e', bad: '#000000' } }, {}).colors, { uku: '#22c55e' });
  assert.equal(cleanPrefs({ avatar: 'volt' }).avatar, 'volt');
});
