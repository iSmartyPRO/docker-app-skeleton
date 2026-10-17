import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import config from '../config/app.js';
import { signToken, verifyToken } from '../services/auth.js';
import { isValidTimeZone, isoDay, startOfDay, zonedParts } from '../services/datetime.js';

test('verifyToken: cached HMAC key, follows a changed secret, refuses other algorithms', () => {
  const saved = config.auth.jwtSecret;
  try {
    config.auth.jwtSecret = 'first-secret-for-tests';
    const token = signToken({ id: 7, token_version: 2 });
    assert.equal(verifyToken(token).sub, '7');
    assert.equal(verifyToken(token).tv, 2, 'second call uses the cached key');
    assert.throws(() => verifyToken(jwt.sign({ sub: '1' }, 'another-secret')), /invalid signature/);
    assert.throws(() => verifyToken(jwt.sign({ sub: '1' }, null, { algorithm: 'none' })));
    config.auth.jwtSecret = 'second-secret-for-tests';
    assert.throws(() => verifyToken(token), /invalid signature/, 'the old secret no longer verifies');
    assert.equal(verifyToken(signToken({ id: 8 })).sub, '8');
  } finally {
    config.auth.jwtSecret = saved;
  }
});

test('time zone helpers: cached answers stay correct (valid, invalid, DST)', () => {
  for (let i = 0; i < 3; i += 1) {
    assert.equal(isValidTimeZone('Europe/Berlin'), true);
    assert.equal(isValidTimeZone('Mars/Olympus'), false);
  }
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(null), false);
  // Berlin switches to summer time at 01:00 UTC on 2026-03-29.
  assert.equal(zonedParts(new Date('2026-03-29T00:30:00Z'), 'Europe/Berlin').hour, 1);
  assert.equal(zonedParts(new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin').hour, 3);
  assert.equal(isoDay(new Date('2026-10-17T20:00:00Z'), 'Asia/Bishkek'), '2026-10-18');
  assert.equal(isoDay(new Date('2026-10-17T20:00:00Z'), 'America/New_York'), '2026-10-17');
  assert.equal(startOfDay(new Date('2026-10-17T20:00:00Z'), 'Asia/Bishkek').toISOString(), '2026-10-17T18:00:00.000Z');
  // An unknown zone falls back to the portal default instead of throwing.
  assert.doesNotThrow(() => zonedParts(new Date(), 'Mars/Olympus'));
});
