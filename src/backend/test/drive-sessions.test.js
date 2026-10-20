import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loginOf, markAllStale, markLoginsStale, needsFreshSession, noteRefreshed, resetSessionState, shouldRetryDenied } from '../modules/drive/sessions.js';

beforeEach(() => resetSessionState());

test('loginOf folds DOMAIN\\login, UPN and case', () => {
  assert.equal(loginOf('CORP\\Meerim.Duisheeva'), 'meerim.duisheeva');
  assert.equal(loginOf('Meerim.Duisheeva@corp.local'), 'meerim.duisheeva');
  assert.equal(loginOf(' Meerim.Duisheeva '), 'meerim.duisheeva');
  assert.equal(loginOf(null), '');
});

test('a group change makes the person\'s older session stale until refreshed', () => {
  noteRefreshed('1:abc', 1000);
  assert.equal(needsFreshSession('1:abc', 'Meerim.Duisheeva'), false);
  markLoginsStale(['meerim.duisheeva'], 2000);
  assert.equal(needsFreshSession('1:abc', 'CORP\\Meerim.Duisheeva'), true);
  assert.equal(needsFreshSession('1:other', 'Meerim.Duisheeva'), true, 'every credential of that login');
  assert.equal(needsFreshSession('1:xyz', 'someone.else'), false);
  noteRefreshed('1:abc', 3000);
  assert.equal(needsFreshSession('1:abc', 'Meerim.Duisheeva'), false);
});

test('a nested group change marks every session', () => {
  noteRefreshed('1:abc', 1000);
  markAllStale(2000);
  assert.equal(needsFreshSession('1:abc', 'anyone'), true);
  noteRefreshed('1:abc', 2500);
  assert.equal(needsFreshSession('1:abc', 'anyone'), false);
});

test('ACCESS_DENIED is retried on a new session at most once a minute per credential', () => {
  assert.equal(shouldRetryDenied('1:abc', 100_000), true);
  noteRefreshed('1:abc', 100_000);
  assert.equal(shouldRetryDenied('1:abc', 130_000), false);
  assert.equal(shouldRetryDenied('1:abc', 161_000), true);
  assert.equal(shouldRetryDenied('1:other', 130_000), true);
});
