import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstNameOf } from '../../frontend/src/lib/firstName.js';

test('greetings use the first name, not the first word of "Surname Name"', () => {
  assert.equal(firstNameOf({ displayName: 'Айдар Ильяс', firstName: 'Ильяс' }), 'Ильяс');
  assert.equal(firstNameOf({ displayName: 'Айдар Ильяс', firstName: '  ' }), 'Айдар', 'no first name stored: first word');
  assert.equal(firstNameOf({ displayName: '', username: 'ilias.aidar' }), 'ilias.aidar');
  assert.equal(firstNameOf(null), '');
});
