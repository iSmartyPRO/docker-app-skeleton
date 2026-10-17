import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readyHandler } from '../services/readiness.js';

/** GET /ready of a tiny app with the given states → [status, body]. */
async function ready(deps) {
  const app = express();
  app.get('/ready', readyHandler(deps));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/ready`);
    return [res.status, await res.json()];
  } finally {
    server.close();
  }
}

const up = { draining: () => false, connect: async () => ({ ok: true }), bootstrapped: () => true, bootstrapLate: async () => {} };

test('/ready: ready with the database and the schema', async () => {
  assert.deepEqual(await ready(up), [200, { status: 'ready', database: true, schema: true }]);
});

test('/ready: draining after SIGTERM answers 503 without touching the database', async () => {
  let asked = 0;
  const [status, body] = await ready({ ...up, draining: () => true, connect: async () => (asked += 1, { ok: true }) });
  assert.deepEqual([status, body], [503, { status: 'shutting_down' }]);
  assert.equal(asked, 0);
});

test('/ready: a SIGTERM while waiting for the database still drains', async () => {
  let draining = false;
  const connect = async () => {
    draining = true; // the signal arrives during the check
    return { ok: true };
  };
  assert.deepEqual(await ready({ ...up, draining: () => draining, connect }), [503, { status: 'shutting_down' }]);
});

test('/ready: no database, or the schema not bootstrapped yet', async () => {
  assert.deepEqual(await ready({ ...up, connect: async () => ({ ok: false }), bootstrapped: () => false }), [503, { status: 'not_ready', database: false, schema: false }]);
  let done = false;
  const late = { ...up, bootstrapped: () => done, bootstrapLate: async () => { done = true; } };
  assert.deepEqual(await ready(late), [200, { status: 'ready', database: true, schema: true }], 'late bootstrap tried at once');
  const failing = { ...up, bootstrapped: () => false, bootstrapLate: async () => { throw new Error('still down'); } };
  assert.deepEqual(await ready(failing), [503, { status: 'not_ready', database: true, schema: false }]);
});
