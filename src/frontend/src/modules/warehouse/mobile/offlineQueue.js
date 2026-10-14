import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * The offline queue of inventory counts (spec §11 «слабый интернет»): every
 * count is an operation with a client-generated id, kept in localStorage per
 * session until the server confirmed it. The server applies an id once, so
 * re-sending after a lost answer is safe. When storage is unavailable (private
 * mode) the queue lives in memory for the tab. Posting stays online.
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
 * Sends the queue in order (batches of 100). Ops the server answered are
 * removed (applied, duplicate or rejected); a network failure keeps the rest.
 * → { applied, rejected: [{ op, code, message }], left, offline }
 */
export async function flushQueue(sessionId, send) {
  let applied = 0;
  const rejected = [];
  for (;;) {
    const list = readQueue(sessionId);
    if (!list.length) return { applied, rejected, left: 0, offline: false };
    const batch = list.slice(0, 100);
    let results;
    try {
      results = await send(batch);
    } catch (err) {
      // No answer (offline, timeout, server down): keep everything for the next try.
      if (!err?.response || err.response.status >= 500) return { applied, rejected, left: list.length, offline: true };
      // The whole batch was refused (e.g. the session is closed): drop it, show why.
      writeQueue(sessionId, readQueue(sessionId).filter((op) => !batch.some((b) => b.clientId === op.clientId)));
      for (const op of batch) rejected.push({ op, code: err.response.data?.code || 'ERROR', message: err.response.data?.error || '' });
      continue;
    }
    const done = new Set();
    for (const r of results || []) {
      done.add(r.clientId);
      if (r.status === 'applied') applied += 1;
      if (r.status === 'rejected') rejected.push({ op: batch.find((b) => b.clientId === r.clientId), code: r.code, message: r.message });
    }
    // Ops without an answer stay (should not happen); avoid an endless loop.
    if (!done.size) return { applied, rejected, left: list.length, offline: false };
    writeQueue(sessionId, readQueue(sessionId).filter((op) => !done.has(op.clientId)));
  }
}

/** React hook: the queue of one session with online state and automatic retry. */
export function useCountQueue(sessionId, send, { onSynced, onRejected } = {}) {
  const [pending, setPending] = useState(() => readQueue(sessionId));
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [offline, setOffline] = useState(false);
  const running = useRef(false);
  const handlers = useRef({ onSynced, onRejected, send });
  handlers.current = { onSynced, onRejected, send };

  const refresh = useCallback(() => setPending(readQueue(sessionId)), [sessionId]);

  const flush = useCallback(async () => {
    if (running.current || !readQueue(sessionId).length) return;
    running.current = true;
    setSyncing(true);
    try {
      const out = await flushQueue(sessionId, handlers.current.send);
      setOffline(out.offline);
      if (out.rejected.length) handlers.current.onRejected?.(out.rejected);
      if (out.applied || out.rejected.length) handlers.current.onSynced?.(out);
    } finally {
      running.current = false;
      setSyncing(false);
      refresh();
    }
  }, [sessionId, refresh]);

  const add = useCallback(
    (op) => {
      const full = enqueue(sessionId, op);
      refresh();
      flush();
      return full;
    },
    [sessionId, refresh, flush]
  );

  useEffect(() => {
    refresh();
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const timer = setInterval(() => flush(), 15000);
    flush();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      clearInterval(timer);
    };
  }, [refresh, flush]);

  return { pending, syncing, online: online && !offline, add, flush };
}
