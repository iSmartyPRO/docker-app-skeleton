import { randomBytes } from 'crypto';
import { query } from '../../config/database.js';
import { limitsByTable } from '../../api/scopes.js';

/*
 * Live updates over Server-Sent Events: one stream per open tab.
 *
 *   GET /api/app/chat/stream  → "hello" {connection}, then events
 *
 * The hub lives in this process (the portal runs one backend process). Each
 * connection may say which room it is looking at (focus), so a person reading
 * a conversation gets no push notification for it.
 *
 * A stream outlives the request that opened it, so about once a minute every
 * open stream is checked again: a signed-out, revoked or expired session, a
 * blocked or deactivated account, a password change (token version) or a
 * revoked API token closes it. API tokens narrowed to some resources get no
 * stream at all: events are not filtered by those limits.
 */

const connections = new Map(); // id → { userId, res, focus, visible, sid, tokenId, tv }
const HEARTBEAT_MS = 20000;
const RECHECK_MS = 60000;
let recheckTimer = null;

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function openStream(req, res) {
  if (req.apiLimits) {
    res.status(403).json({ success: false, code: 'TOKEN_LIMITED', error: 'Live chat events are not available to API tokens limited to selected resources' });
    return;
  }
  const id = randomBytes(9).toString('base64url');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx (both the container's and a host proxy) must not buffer the stream.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const entry = {
    userId: req.user.id,
    res,
    focus: null,
    visible: true,
    sid: req.apiToken ? null : req.sessionId || null,
    tokenId: req.apiToken?.id || null,
    tv: Number(req.auth?.tv || 0),
  };
  connections.set(id, entry);
  write(res, 'hello', { connection: id });
  const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  const close = () => {
    clearInterval(beat);
    connections.delete(id);
  };
  entry.close = close;
  req.on('close', close);
  res.on('error', close);
  startRecheck();
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

// ── Re-checking open streams ────────────────────────────────────────────────

/**
 * True while a stream may stay open. `row` is what the database says now about
 * its session (cookie streams) or its API token (token streams), joined with
 * the account; a missing row means it is gone.
 */
export function streamAllowed(entry, row, now = new Date()) {
  if (!row) return false;
  if (Number(row.user_id) !== Number(entry.userId)) return false;
  if (row.is_active === false || row.is_blocked === true) return false;
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false;
  if (entry.tokenId) {
    // A token narrowed after the stream was opened loses it too.
    return !limitsByTable(row.limits);
  }
  return Number(row.token_version || 0) === Number(entry.tv || 0);
}

function closeEntry(id, entry) {
  try {
    entry.res.end();
  } catch {
    /* already gone */
  }
  entry.close?.();
  connections.delete(id);
}

export async function recheckStreams() {
  if (!connections.size) return;
  const list = [...connections.entries()];
  const sids = [...new Set(list.map(([, entry]) => entry.sid).filter(Boolean))];
  const tokenIds = [...new Set(list.map(([, entry]) => entry.tokenId).filter(Boolean))];
  const [sessions, tokens] = await Promise.all([
    sids.length
      ? query(
          `SELECT s.id, s.user_id, s.revoked_at, s.expires_at, u.is_active, u.is_blocked, u.token_version
           FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ANY($1)`,
          [sids]
        )
      : { rows: [] },
    tokenIds.length
      ? query(
          `SELECT t.id, t.user_id, t.revoked_at, t.expires_at, t.limits, u.is_active, u.is_blocked
           FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.id = ANY($1)`,
          [tokenIds]
        )
      : { rows: [] },
  ]);
  const bySid = new Map(sessions.rows.map((row) => [row.id, row]));
  const byToken = new Map(tokens.rows.map((row) => [row.id, row]));
  for (const [id, entry] of list) {
    // A stream that carries neither (should not happen) is left alone.
    if (!entry.sid && !entry.tokenId) continue;
    const row = entry.tokenId ? byToken.get(entry.tokenId) : bySid.get(entry.sid);
    if (!streamAllowed(entry, row)) closeEntry(id, entry);
  }
}

function startRecheck() {
  if (recheckTimer) return;
  recheckTimer = setInterval(() => {
    recheckStreams().catch((err) => console.warn('[chat] stream re-check failed:', err.message));
  }, RECHECK_MS);
  recheckTimer.unref?.();
}

/** Ends every open stream (server shutdown). */
export function closeAllStreams() {
  for (const [id, entry] of connections.entries()) closeEntry(id, entry);
  clearInterval(recheckTimer);
  recheckTimer = null;
}
