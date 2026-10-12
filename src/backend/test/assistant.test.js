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
