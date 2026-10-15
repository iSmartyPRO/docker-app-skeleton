/*
 * The offline queue of inventory counts (spec §11 «слабый интернет»): every
 * count is an operation with a client-generated id, kept in localStorage per
 * session until the server confirmed it. The server applies an id once, so
 * re-sending after a lost answer is safe. When storage is unavailable (private
 * mode) the queue lives in memory for the tab. Posting stays online.
 * No React here: unit-tested in backend/test/warehouse-offline-queue.test.js.
 */

const memory = new Map();
const key = (sessionId) => `wh.inv.queue.${sessionId}`;

/** A unique id for an operation (crypto.randomUUID where available). */
export function newClientId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function readQueue(sessionId) {
  try {
    const raw = window.localStorage.getItem(key(sessionId));
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked */
  }
  return memory.get(sessionId) || [];
}

function writeQueue(sessionId, list) {
  memory.set(sessionId, list);
  try {
    if (list.length) window.localStorage.setItem(key(sessionId), JSON.stringify(list));
    else window.localStorage.removeItem(key(sessionId));
  } catch {
    /* storage blocked or full: the memory copy keeps working */
  }
}

export function enqueue(sessionId, op) {
  const full = { clientId: newClientId(), at: new Date().toISOString(), ...op };
  writeQueue(sessionId, [...readQueue(sessionId), full]);
  return full;
}

/**
 * Codes that refuse the whole batch for good: the session is closed or gone.
 * Anything else that is not a per-op answer (signed out, no right right now,
 * rate limit, timeout, payload too large, server error, no network) keeps the
 * ops for the next try — a count is never lost because a token expired.
 */
export const FATAL_BATCH_CODES = ['SESSION_CLOSED', 'NOT_FOUND'];

/**
 * Sends the queue in order (batches of up to 100). Ops the server answered
 * per op are removed (applied, duplicate or rejected); a batch refused as a
 * whole is dropped only for FATAL_BATCH_CODES; otherwise everything stays.
 * → { applied, rejected: [{ op, code, message }], left, offline, blocked }
 *   blocked: the code / HTTP status that paused sending (e.g. 401 after the session expired), else null.
 */
export async function flushQueue(sessionId, send, { batchSize = 100 } = {}) {
  let applied = 0;
  let size = batchSize;
  const rejected = [];
  for (;;) {
    const list = readQueue(sessionId);
    if (!list.length) return { applied, rejected, left: 0, offline: false, blocked: null };
    const batch = list.slice(0, size);
    let results;
    try {
      results = await send(batch);
    } catch (err) {
      const status = err?.response?.status;
      // No answer (offline, timeout, server down): keep everything for the next try.
      if (!err?.response || status >= 500) return { applied, rejected, left: list.length, offline: true, blocked: null };
      // Too large for the server: smaller batches.
      if (status === 413 && size > 1) {
        size = Math.max(1, Math.floor(size / 2));
        continue;
      }
      const code = err.response.data?.code || null;
      if (FATAL_BATCH_CODES.includes(code)) {
        // The session is closed or gone: these counts cannot be applied any more — drop them, show why.
        writeQueue(sessionId, readQueue(sessionId).filter((op) => !batch.some((b) => b.clientId === op.clientId)));
        for (const op of batch) rejected.push({ op, code, message: err.response.data?.error || '' });
        continue;
      }
      // Signed out (401), no access right now (403), rate limit (429), timeout (408)…: keep and retry later.
      return { applied, rejected, left: list.length, offline: false, blocked: code || status || 'ERROR' };
    }
    const done = new Set();
    for (const r of results || []) {
      done.add(r.clientId);
      if (r.status === 'applied') applied += 1;
      if (r.status === 'rejected') rejected.push({ op: batch.find((b) => b.clientId === r.clientId), code: r.code, message: r.message });
    }
    // Ops without an answer stay (should not happen); avoid an endless loop.
    if (!done.size) return { applied, rejected, left: list.length, offline: false, blocked: null };
    writeQueue(sessionId, readQueue(sessionId).filter((op) => !done.has(op.clientId)));
  }
}

