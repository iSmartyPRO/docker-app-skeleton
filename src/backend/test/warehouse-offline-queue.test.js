import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, flushQueue, readQueue } from '../../frontend/src/modules/warehouse/mobile/offlineStore.js';

/* The offline queue of inventory counts on the phone (docs/warehouse.md#offline): what is kept, what is dropped. */

const httpError = (status, code) => Object.assign(new Error(code || String(status)), { response: { status, data: { code, error: code } } });

test('offline queue: answered ops leave, per-op rejections are reported', async () => {
  const sid = `t1-${Date.now()}`;
  const a = enqueue(sid, { kind: 'add', itemId: 1, qty: 1 });
  const b = enqueue(sid, { kind: 'add', itemId: 2, qty: 1 });
  const out = await flushQueue(sid, async (batch) => batch.map((op) => (op.clientId === a.clientId ? { clientId: op.clientId, status: 'applied' } : { clientId: op.clientId, status: 'rejected', code: 'BAD_ITEM' })));
  assert.equal(out.applied, 1);
  assert.deepEqual(out.rejected.map((r) => [r.op.clientId, r.code]), [[b.clientId, 'BAD_ITEM']]);
  assert.equal(readQueue(sid).length, 0);
});

test('offline queue: signed out, no right, rate limit or timeout keep every op for later', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'ORIGIN_DENIED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [408, null], [400, 'BAD_REQUEST']]) {
    const sid = `t2-${status}-${code}-${Date.now()}`;
    enqueue(sid, { kind: 'add', itemId: 1, qty: 1 });
    enqueue(sid, { kind: 'done', binId: 3 });
    const out = await flushQueue(sid, async () => {
      throw httpError(status, code);
    });
    assert.equal(readQueue(sid).length, 2, `${status} ${code}`);
    assert.equal(out.rejected.length, 0);
    assert.ok(out.blocked);
    // After signing in again the same ops go through.
    const again = await flushQueue(sid, async (batch) => batch.map((op) => ({ clientId: op.clientId, status: 'applied' })));
    assert.equal(again.applied, 2);
    assert.equal(readQueue(sid).length, 0);
  }
});

test('offline queue: no network or a server error keeps the ops; a closed or deleted session drops them', async () => {
  const sid = `t3-${Date.now()}`;
  enqueue(sid, { kind: 'add', itemId: 1, qty: 1 });
  let out = await flushQueue(sid, async () => {
    throw new Error('Network Error');
  });
  assert.equal(out.offline, true);
  out = await flushQueue(sid, async () => {
    throw httpError(502, null);
  });
  assert.equal(out.offline, true);
  assert.equal(readQueue(sid).length, 1);
  out = await flushQueue(sid, async () => {
    throw httpError(409, 'SESSION_CLOSED');
  });
  assert.equal(out.rejected[0].code, 'SESSION_CLOSED');
  assert.equal(readQueue(sid).length, 0);
});

test('offline queue: a batch too large for the server is sent in smaller parts', async () => {
  const sid = `t4-${Date.now()}`;
  for (let i = 0; i < 8; i += 1) enqueue(sid, { kind: 'add', itemId: i + 1, qty: 1 });
  const sizes = [];
  const out = await flushQueue(
    sid,
    async (batch) => {
      sizes.push(batch.length);
      if (batch.length > 2) throw httpError(413, 'PAYLOAD_TOO_LARGE');
      return batch.map((op) => ({ clientId: op.clientId, status: 'applied' }));
    },
    { batchSize: 8 }
  );
  assert.equal(out.applied, 8);
  assert.deepEqual(sizes.slice(0, 3), [8, 4, 2]);
  assert.equal(readQueue(sid).length, 0);
});
