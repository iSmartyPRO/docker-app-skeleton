import { randomBytes } from 'crypto';

/*
 * Live updates over Server-Sent Events: one stream per open tab.
 *
 *   GET /api/app/chat/stream  → "hello" {connection}, then events
 *
 * The hub lives in this process (the portal runs one backend process). Each
 * connection may say which room it is looking at (focus), so a person reading
 * a conversation gets no push notification for it.
 */

const connections = new Map(); // id → { userId, res, focus, visible }
const HEARTBEAT_MS = 20000;

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function openStream(req, res) {
  const id = randomBytes(9).toString('base64url');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx (both the container's and a host proxy) must not buffer the stream.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const entry = { userId: req.user.id, res, focus: null, visible: true };
  connections.set(id, entry);
  write(res, 'hello', { connection: id });
  const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  const close = () => {
    clearInterval(beat);
    connections.delete(id);
  };
  req.on('close', close);
  res.on('error', close);
}

/** Sends an event to every open tab of these people. */
export function publish(userIds, event, data) {
  const wanted = new Set(userIds.map(Number));
  for (const entry of connections.values()) {
    if (wanted.has(entry.userId)) {
      try {
        write(entry.res, event, data);
      } catch {
        /* the close handler cleans up */
      }
    }
  }
}

export function setFocus(userId, connectionId, { roomId, visible }) {
  const entry = connections.get(String(connectionId || ''));
  if (!entry || entry.userId !== userId) return false;
  entry.focus = Number(roomId) || null;
  entry.visible = visible !== false;
  return true;
}

/** Someone has this room open in a visible tab right now. */
export function isWatching(userId, roomId) {
  for (const entry of connections.values()) {
    if (entry.userId === userId && entry.focus === roomId && entry.visible) return true;
  }
  return false;
}

export function onlineUserIds() {
  return new Set([...connections.values()].map((entry) => entry.userId));
}

export function isOnline(userId) {
  for (const entry of connections.values()) if (entry.userId === userId) return true;
  return false;
}
