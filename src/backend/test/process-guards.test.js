import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listIncidents } from '../services/incidents.js';
import { installProcessGuards, onUnhandledRejection } from '../services/processGuards.js';

test('unhandled rejection: recorded as an incident instead of ending the process', () => {
  const entry = onUnhandledRejection(new Error('forgotten catch in a job'));
  assert.equal(entry.code, 'UNHANDLED_REJECTION');
  assert.equal(entry.kind, 'process');
  assert.match(entry.stack, /forgotten catch/);
  assert.ok(listIncidents({ q: 'forgotten catch' }).length >= 1);
  assert.equal(onUnhandledRejection('plain reason').message, 'plain reason');
});

test('unhandled rejection: the guard is installed once', () => {
  const before = process.listeners('unhandledRejection').length;
  installProcessGuards();
  installProcessGuards();
  assert.equal(process.listeners('unhandledRejection').length, before + 1, 'installed once');
  assert.ok(process.listeners('unhandledRejection').includes(onUnhandledRejection));
});
