import { useCallback, useEffect, useRef, useState } from 'react';
import { flushQueue, readQueue, enqueue } from './offlineStore';

/* The offline queue of inventory counts as a React hook; the storage and sending rules are in offlineStore.js. */

export { FATAL_BATCH_CODES, enqueue, flushQueue, newClientId, readQueue } from './offlineStore';

/** React hook: the queue of one session with online state and automatic retry. */
export function useCountQueue(sessionId, send, { onSynced, onRejected } = {}) {
  const [pending, setPending] = useState(() => readQueue(sessionId));
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [offline, setOffline] = useState(false);
  const [blocked, setBlocked] = useState(null);
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
      setBlocked(out.blocked);
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
    // Back to the tab (e.g. after signing in again in another tab): send what waits.
    const back = () => {
      if (document.visibilityState !== 'hidden') flush();
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    const timer = setInterval(() => flush(), 15000);
    flush();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
      clearInterval(timer);
    };
  }, [refresh, flush]);

  return { pending, syncing, online: online && !offline, blocked, add, flush };
}
