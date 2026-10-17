import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { attemptAccount, failedSignInLimiters, signInLimiter, addressAndAccount } from '../middleware/signinLimits.js';

/** A tiny app: POST /login succeeds for password "ok", else 401. */
async function withApp(limiters, run) {
  const app = express();
  app.use(express.json());
  app.post('/login', limiters, (req, res) => (req.body.password === 'ok' ? res.json({ success: true }) : res.status(401).json({ success: false })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const post = async (username, password) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })).status;
  try {
    await run(post);
  } finally {
    server.close();
  }
}

test('sign-in limiter: successful sign-ins from one address never use up the budget (office behind NAT)', async () => {
  await withApp(failedSignInLimiters({ perAccount: 3, perAddress: 5 }), async (post) => {
    for (let i = 0; i < 30; i += 1) assert.equal(await post(`user${i % 7}`, 'ok'), 200, `sign-in ${i}`);
  });
});

test('sign-in limiter: failures are limited per address+account, other accounts keep working', async () => {
  await withApp(failedSignInLimiters({ perAccount: 3, perAddress: 100 }), async (post) => {
    for (let i = 0; i < 3; i += 1) assert.equal(await post('Alice', 'bad'), 401);
    assert.equal(await post('alice', 'bad'), 429, 'case-insensitive account bucket');
    assert.equal(await post('alice', 'ok'), 429, 'a correct password does not bypass the limit');
    assert.equal(await post('bob', 'bad'), 401);
    assert.equal(await post('bob', 'ok'), 200);
  });
});

test('sign-in limiter: password spraying across many names hits the per-address limit', async () => {
  await withApp(failedSignInLimiters({ perAccount: 3, perAddress: 5 }), async (post) => {
    for (let i = 0; i < 5; i += 1) assert.equal(await post(`name${i}`, 'bad'), 401);
    assert.equal(await post('another', 'bad'), 429);
  });
});

test('sign-in limiter: counting every request (code requests) still limits successes', async () => {
  await withApp([signInLimiter({ max: 2, key: addressAndAccount })], async (post) => {
    assert.equal(await post('a', 'ok'), 200);
    assert.equal(await post('a', 'ok'), 200);
    assert.equal(await post('a', 'ok'), 429);
    assert.equal(await post('b', 'ok'), 200);
  });
});

test('attemptAccount: username, identifier or telegram id, trimmed and lower-cased', () => {
  assert.equal(attemptAccount({ body: { username: '  DOMAIN\\Ivan ' } }), 'domain\\ivan');
  assert.equal(attemptAccount({ body: { identifier: 'A@B.kg' } }), 'a@b.kg');
  assert.equal(attemptAccount({ body: { id: 42 } }), 'tg42');
  assert.equal(attemptAccount({ body: {} }), '');
  assert.equal(attemptAccount({}), '');
  assert.equal(attemptAccount({ body: { username: 'x'.repeat(500) } }).length, 128);
});

test('sign-in limiter: AD spellings and phone shapes of one account share a bucket', async () => {
  await withApp(failedSignInLimiters({ perAccount: 3, perAddress: 100 }), async (post) => {
    assert.equal(await post('ivan', 'bad'), 401);
    assert.equal(await post('CORP\\Ivan', 'bad'), 401);
    assert.equal(await post('ivan@corp.local', 'bad'), 401);
    assert.equal(await post('Ivan', 'bad'), 429, 'three spellings, one account');
    assert.equal(await post('petr', 'bad'), 401);
  });
  await withApp([signInLimiter({ max: 2, key: addressAndAccount })], async (post) => {
    assert.equal(await post('+996 555 123 456', 'ok'), 200);
    assert.equal(await post('996555123456', 'ok'), 200);
    assert.equal(await post('(996) 555-123-456', 'ok'), 429);
  });
});
