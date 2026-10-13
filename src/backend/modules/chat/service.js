import { unlink } from 'fs/promises';
import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { getAccessMap } from '../../services/rbac.js';
import { avatarOf, clean, httpError } from '../shared/acl.js';
import { entityAdapter } from './entities.js';
import { fileShape, filePath, removeStored } from './files.js';
import { originalName } from '../kb/files.js';
import { isOnline, publish } from './realtime.js';
import { deliverMessage } from './notify.js';
import { emitEvent } from '../../api/events.js';
import { publicBase } from '../../services/google.js';

/*
 * Rooms, members, messages. Every entry point takes the request (for the
 * person and their permissions) and checks access first:
 *   direct / group  — membership
 *   entity          — the owning module decides (entities.js)
 */

const PAGE = 40;
const EMOJI = /^[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]{1,8}$/u;
const MENTION_RE = /(^|[^\w@])@([a-z0-9._-]{3,32})/gi;
const HEX = /^#[0-9a-f]{6}$/i;

export async function chatSettings() {
  const parsed = parseSettings(await getSettings());
  return { enabled: Boolean(parsed.modules.chat?.enabled), ...parsed.modules.chat?.settings };
}

export function chatContext(req) {
  return { userId: req.user.id, isAdmin: hasPermission(req.access?.permissions || [], 'chat.admin'), req };
}

const person = (id, name, username, avatar) => (id ? { id, name: name || username, username, avatarUrl: avatarOf(avatar) } : null);

// ── Rooms ───────────────────────────────────────────────────────────────────

async function loadRoom(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Chat not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM chat_rooms WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Chat not found', 'NOT_FOUND');
  return rows[0];
}

async function membership(roomId, userId) {
  const { rows } = await query(`SELECT * FROM chat_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
  return rows[0] || null;
}

/** What this person may do in the room; entity rooms ask their module. */
async function accessTo(ctx, room) {
  if (room.entity_type) {
    const adapter = entityAdapter(room.entity_type);
    let access = null;
    let failed = !adapter;
    try {
      access = adapter ? await adapter.access(ctx.req, room.entity_id) : null;
    } catch {
      failed = true;
    }
    if (!access?.view) {
      // The record is gone or closed to this person: they leave its conversation too.
      if (!failed && !ctx.req?.apiLimits && ctx.userId) await dropMembers(room.id, [ctx.userId]);
      return { view: false };
    }
    remember(room.id, ctx.userId, true, ctx);
    if ((access.title && access.title !== room.title) || (access.link && access.link !== room.link)) {
      await query(`UPDATE chat_rooms SET title = COALESCE($2, title), link = COALESCE($3, link) WHERE id = $1`, [room.id, access.title?.slice(0, 200) || null, access.link || null]);
      room.title = access.title || room.title;
      room.link = access.link || room.link;
    }
    return { view: true, write: Boolean(access.write), manage: false, entity: access };
  }
  const member = await membership(room.id, ctx.userId);
  if (!member) return { view: false };
  return { view: true, write: true, manage: room.kind === 'group' && (member.role === 'owner' || ctx.isAdmin), member };
}

// ── Entity rooms: membership follows the record's access ────────────────────
//
// People join an entity room by opening it, and lose the record later (taken
// off a task, project access removed). Every place that reads chat_members of
// an entity room asks the module again; the answers are cached briefly, and
// rows of people who can no longer see the record are dropped.

const ACCESS_TTL = 60_000;
const accessCache = new Map(); // "room:user" → { at, view }

function remember(roomId, userId, view, ctx = null) {
  if (ctx?.req?.apiLimits) return; // a narrowed API token's answer is not the person's
  if (accessCache.size > 5000) [...accessCache.keys()].slice(0, 1000).forEach((key) => accessCache.delete(key));
  accessCache.set(`${roomId}:${userId}`, { at: Date.now(), view });
}

function recalled(roomId, userId) {
  const hit = accessCache.get(`${roomId}:${userId}`);
  return hit && Date.now() - hit.at < ACCESS_TTL ? hit.view : undefined;
}

async function dropMembers(roomId, userIds) {
  if (!userIds.length) return;
  await query(`DELETE FROM chat_members WHERE room_id = $1 AND user_id = ANY($2)`, [roomId, userIds]);
  userIds.forEach((id) => remember(roomId, id, false));
  publish(userIds, 'room', { roomId, removed: true });
}

async function eachLimited(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/** Request-like objects of active people, for the modules' access checks. */
async function requestsFor(userIds) {
  if (!userIds.length) return new Map();
  const { rows } = await query(`SELECT id, username FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [userIds]);
  const access = await getAccessMap(rows.map((row) => row.id));
  return new Map(rows.map((row) => [row.id, { user: { id: row.id, username: row.username }, access: access.get(row.id), apiLimits: null, headers: {}, cookies: {} }]));
}

/**
 * Which of these people may still see the record behind an entity room:
 * userId → true (yes), false (no: the membership is dropped) or null (unknown
 * or inactive: left out this time, membership kept). `trusted` ids (the
 * record's followers) pass without a check.
 */
async function entityViewers(room, userIds, trusted = new Set()) {
  const result = new Map();
  const pending = [];
  for (const id of userIds) {
    const known = trusted.has(id) ? true : recalled(room.id, id);
    if (known === undefined) pending.push(id);
    else result.set(id, known);
  }
  const adapter = entityAdapter(room.entity_type);
  if (!pending.length) return result;
  if (!adapter) {
    pending.forEach((id) => result.set(id, null));
    return result;
  }
  const people = await requestsFor(pending);
  await eachLimited(pending, 8, async (id) => {
    const req = people.get(id);
    if (!req) {
      result.set(id, null);
      return;
    }
    try {
      const view = Boolean((await adapter.access(req, room.entity_id))?.view);
      remember(room.id, id, view);
      result.set(id, view);
    } catch {
      result.set(id, null);
    }
  });
  const gone = [...result].filter(([, view]) => view === false).map(([id]) => id);
  await dropMembers(room.id, gone);
  return result;
}

/** The entity rooms among `rooms` this person may no longer see (their membership is dropped). */
async function hiddenEntityRooms(ctx, rooms) {
  const hidden = new Set();
  const gone = [];
  await eachLimited(rooms.filter((room) => room.entity_type), 8, async (room) => {
    let view = ctx.req?.apiLimits ? undefined : recalled(room.id, ctx.userId);
    if (view === undefined) {
      const adapter = entityAdapter(room.entity_type);
      try {
        view = adapter ? Boolean((await adapter.access(ctx.req, room.entity_id))?.view) : null;
        if (view !== null) remember(room.id, ctx.userId, view, ctx);
      } catch {
        view = null;
      }
    }
    if (view !== true) hidden.add(room.id);
    if (view === false && !ctx.req?.apiLimits) gone.push(room.id);
  });
  for (const roomId of gone) await dropMembers(roomId, [ctx.userId]);
  return hidden;
}

/** For the routes: the room check runs before an upload reaches the disk. */
export async function canUpload(ctx, roomId) {
  await requireRoom(ctx, roomId, 'write');
}

async function requireRoom(ctx, roomId, need = 'view') {
  const room = await loadRoom(roomId);
  const access = await accessTo(ctx, room);
  if (!access.view) throw httpError(404, 'Chat not found', 'NOT_FOUND');
  if (need === 'write' && !access.write) throw httpError(403, 'You cannot write in this chat', 'FORBIDDEN');
  if (need === 'manage' && !access.manage) throw httpError(403, 'Only the chat owner can do this', 'FORBIDDEN');
  return { room, access };
}

async function ensureMember(roomId, userId, role = 'member') {
  await query(
    `INSERT INTO chat_members (room_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (room_id, user_id) DO UPDATE SET hidden = FALSE`,
    [roomId, userId, role]
  );
}

/** People who should hear about new messages: members, plus an entity's followers. */
export async function recipientsOf(room) {
  const { rows } = await query(`SELECT user_id FROM chat_members WHERE room_id = $1`, [room.id]);
  const ids = new Set(rows.map((row) => row.user_id));
  if (!room.entity_type) return [...ids];
  const adapter = entityAdapter(room.entity_type);
  const followers = new Set(adapter ? await adapter.participants(room.entity_id).catch(() => []) : []);
  for (const id of followers) {
    if (!ids.has(id)) {
      await ensureMember(room.id, id);
      ids.add(id);
    }
  }
  // Members who are not followers joined by opening the record; they hear only while they can still see it.
  const viewers = await entityViewers(room, [...ids], followers);
  return [...ids].filter((id) => viewers.get(id) === true);
}

function linkOf(room) {
  return room.entity_type ? room.link || null : `/app/chat/${room.id}`;
}

async function roomShapes(userId, rooms) {
  if (!rooms.length) return [];
  const ids = rooms.map((room) => room.id);
  const [members, last, unread] = await Promise.all([
    query(
      `SELECT m.room_id, m.user_id, m.role, m.last_read_id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
       FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ANY($1)`,
      [ids]
    ),
    query(
      `SELECT m.id, m.room_id, m.kind, m.body, m.data, m.created_at, m.deleted_at, m.author_id,
              COALESCE(u.display_name, u.username) AS author_name,
              (SELECT COUNT(*)::int FROM chat_files f WHERE f.message_id = m.id) AS files
       FROM chat_messages m LEFT JOIN users u ON u.id = m.author_id
       WHERE m.id IN (SELECT last_message_id FROM chat_rooms WHERE id = ANY($1))`,
      [ids]
    ),
    query(
      `SELECT me.room_id, COUNT(msg.id)::int AS unread,
              COUNT(msg.id) FILTER (WHERE msg.body ~* ('(^|[^\\w@])@' || u.username || '\\M'))::int AS mentions
       FROM chat_members me
       JOIN users u ON u.id = me.user_id
       LEFT JOIN chat_messages msg ON msg.room_id = me.room_id AND msg.id > me.last_read_id
            AND msg.deleted_at IS NULL AND msg.kind <> 'system' AND (msg.author_id IS DISTINCT FROM me.user_id)
       WHERE me.user_id = $1 AND me.room_id = ANY($2)
       GROUP BY me.room_id`,
      [userId, ids]
    ),
  ]);
  const byRoom = new Map();
  members.rows.forEach((row) => {
    if (!byRoom.has(row.room_id)) byRoom.set(row.room_id, []);
    byRoom.get(row.room_id).push(row);
  });
  return rooms.map((room) => {
    const list = byRoom.get(room.id) || [];
    const mine = list.find((row) => row.user_id === userId);
    const other = room.kind === 'direct' ? list.find((row) => row.user_id !== userId) : null;
    const lastRow = last.rows.find((row) => row.room_id === room.id);
    const counts = unread.rows.find((row) => row.room_id === room.id);
    return {
      id: room.id,
      kind: room.kind,
      title: room.kind === 'direct' ? other?.name || '—' : room.title || '',
      color: room.color || null,
      entity: room.entity_type ? { type: room.entity_type, id: room.entity_id } : null,
      link: linkOf(room),
      other: other ? { ...person(other.user_id, other.name, other.username, other.avatar_path), online: isOnline(other.user_id) } : null,
      memberCount: list.length,
      members: list.slice(0, 4).map((row) => person(row.user_id, row.name, row.username, row.avatar_path)),
      lastMessage: lastRow
        ? {
            id: Number(lastRow.id),
            kind: lastRow.kind,
            text: lastRow.deleted_at ? '' : lastRow.body.slice(0, 160),
            data: lastRow.kind === 'system' ? lastRow.data : null,
            files: lastRow.files,
            deleted: Boolean(lastRow.deleted_at),
            author: lastRow.author_id ? { id: lastRow.author_id, name: lastRow.author_name } : null,
            at: lastRow.created_at,
          }
        : null,
      updatedAt: room.last_message_at || room.created_at,
      unread: counts?.unread || 0,
      mentions: counts?.mentions || 0,
      lastReadId: Number(mine?.last_read_id || 0),
      muted: Boolean(room.muted),
      pinned: Boolean(room.pinned),
      role: mine?.role || null,
    };
  });
}

export async function listRooms(ctx, { q, kind } = {}) {
  const params = [ctx.userId];
  let where = 'm.user_id = $1 AND NOT m.hidden';
  if (['direct', 'group', 'entity'].includes(kind)) {
    params.push(kind);
    where += ` AND r.kind = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT r.*, m.muted, m.pinned FROM chat_rooms r JOIN chat_members m ON m.room_id = r.id
     WHERE ${where} ORDER BY m.pinned DESC, COALESCE(r.last_message_at, r.created_at) DESC LIMIT 300`,
    params
  );
  // Direct and group chats show up once they have a message (or were made by me).
  const shown = rows.filter((room) => room.last_message_id || room.created_by === ctx.userId || room.kind === 'group');
  const hidden = await hiddenEntityRooms(ctx, shown);
  let shaped = await roomShapes(
    ctx.userId,
    shown.filter((room) => !hidden.has(room.id))
  );
  const text = String(q || '').trim().toLowerCase();
  if (text) shaped = shaped.filter((room) => `${room.title} ${room.other?.username || ''}`.toLowerCase().includes(text));
  return shaped;
}

export async function getRoom(ctx, roomId) {
  const { room, access } = await requireRoom(ctx, roomId);
  if (room.entity_type) await ensureMember(room.id, ctx.userId);
  const member = await membership(room.id, ctx.userId);
  const [shape] = await roomShapes(ctx.userId, [{ ...room, muted: member?.muted, pinned: member?.pinned }]);
  return {
    ...shape,
    can: { write: Boolean(access.write), manage: Boolean(access.manage) },
    entityInfo: access.entity ? { title: access.entity.title, subtitle: access.entity.subtitle || null, link: access.entity.link || shape.link, color: access.entity.color || null } : null,
  };
}

export async function roomMembers(ctx, roomId) {
  const { room } = await requireRoom(ctx, roomId);
  const ids = await recipientsOf(room);
  const { rows } = await query(
    `SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path, m.role, m.last_read_id
     FROM users u LEFT JOIN chat_members m ON m.user_id = u.id AND m.room_id = $2
     WHERE u.id = ANY($1) AND u.is_active IS NOT FALSE ORDER BY LOWER(COALESCE(u.display_name, u.username))`,
    [ids, room.id]
  );
  return rows.map((row) => ({ ...person(row.id, row.name, row.username, row.avatar_path), role: row.role || 'member', lastReadId: Number(row.last_read_id || 0), online: isOnline(row.id) }));
}

async function activeUserIds(ids) {
  const list = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [list]);
  return rows.map((row) => row.id);
}

export async function directRoom(ctx, otherId) {
  const [other] = await activeUserIds([otherId]);
  if (!other) throw httpError(404, 'User not found', 'NOT_FOUND');
  const key = [ctx.userId, other].sort((a, b) => a - b).join(':');
  const room = await withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM chat_rooms WHERE direct_key = $1`, [key]);
    if (found.rows[0]) return found.rows[0];
    const { rows } = await client.query(`INSERT INTO chat_rooms (kind, direct_key, created_by) VALUES ('direct', $1, $2) RETURNING *`, [key, ctx.userId]);
    for (const id of new Set([ctx.userId, other])) {
      await client.query(`INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [rows[0].id, id]);
    }
    return rows[0];
  });
  await query(`UPDATE chat_members SET hidden = FALSE WHERE room_id = $1 AND user_id = $2`, [room.id, ctx.userId]);
  return getRoom(ctx, room.id);
}

export async function createGroup(ctx, input = {}) {
  const settings = await chatSettings();
  if (settings.allowGroups === false && !ctx.isAdmin) throw httpError(403, 'Group chats are turned off', 'FORBIDDEN');
  const title = clean(input.title, 200);
  if (!title) throw httpError(400, 'Name the chat', 'TITLE_REQUIRED');
  const members = await activeUserIds(input.memberIds);
  const room = await withTransaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO chat_rooms (kind, title, color, created_by) VALUES ('group', $1, $2, $3) RETURNING *`, [
      title,
      HEX.test(input.color || '') ? input.color.toUpperCase() : null,
      ctx.userId,
    ]);
    await client.query(`INSERT INTO chat_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`, [rows[0].id, ctx.userId]);
    for (const id of members.filter((id) => id !== ctx.userId)) {
      await client.query(`INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [rows[0].id, id]);
    }
    return rows[0];
  });
  await postSystemTo(room, ctx.userId, { event: 'chat.created', title });
  return getRoom(ctx, room.id);
}

export async function updateRoom(ctx, roomId, input = {}) {
  const { room } = await requireRoom(ctx, roomId, 'manage');
  if (input.title !== undefined) {
    const title = clean(input.title, 200);
    if (!title) throw httpError(400, 'Name the chat', 'TITLE_REQUIRED');
    if (title !== room.title) {
      await query(`UPDATE chat_rooms SET title = $2 WHERE id = $1`, [room.id, title]);
      await postSystemTo(room, ctx.userId, { event: 'chat.renamed', title });
    }
  }
  if (input.color !== undefined) await query(`UPDATE chat_rooms SET color = $2 WHERE id = $1`, [room.id, HEX.test(input.color || '') ? input.color.toUpperCase() : null]);
  publish(await recipientsOf(room), 'room', { roomId: room.id });
  return getRoom(ctx, room.id);
}

export async function addMembers(ctx, roomId, userIds) {
  const { room } = await requireRoom(ctx, roomId, 'manage');
  const ids = await activeUserIds(userIds);
  const { rows } = await query(`SELECT user_id FROM chat_members WHERE room_id = $1`, [room.id]);
  const fresh = ids.filter((id) => !rows.some((row) => row.user_id === id));
  for (const id of fresh) await ensureMember(room.id, id);
  if (fresh.length) await postSystemTo(room, ctx.userId, { event: 'chat.joined', users: await namesOf(fresh) });
  return roomMembers(ctx, room.id);
}

export async function removeMember(ctx, roomId, userId) {
  const leaving = Number(userId) === ctx.userId;
  const { room } = await requireRoom(ctx, roomId, leaving ? 'view' : 'manage');
  if (room.kind !== 'group') throw httpError(400, 'Only group chats have members to remove', 'NOT_GROUP');
  await query(`DELETE FROM chat_members WHERE room_id = $1 AND user_id = $2`, [room.id, Number(userId)]);
  await postSystemTo(room, ctx.userId, { event: leaving ? 'chat.left' : 'chat.removed', users: await namesOf([Number(userId)]) });
  // A group without an owner hands the role to its oldest member.
  await query(
    `UPDATE chat_members SET role = 'owner' WHERE room_id = $1 AND user_id = (
       SELECT user_id FROM chat_members WHERE room_id = $1 ORDER BY joined_at LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM chat_members WHERE room_id = $1 AND role = 'owner')`,
    [room.id]
  );
  publish([Number(userId)], 'room', { roomId: room.id, removed: true });
}

async function namesOf(ids) {
  const { rows } = await query(`SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id = ANY($1)`, [ids]);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function setPrefs(ctx, roomId, input = {}) {
  const { room } = await requireRoom(ctx, roomId);
  await ensureMember(room.id, ctx.userId);
  if (typeof input.muted === 'boolean') await query(`UPDATE chat_members SET muted = $3 WHERE room_id = $1 AND user_id = $2`, [room.id, ctx.userId, input.muted]);
  if (typeof input.pinned === 'boolean') await query(`UPDATE chat_members SET pinned = $3 WHERE room_id = $1 AND user_id = $2`, [room.id, ctx.userId, input.pinned]);
  if (typeof input.hidden === 'boolean') await query(`UPDATE chat_members SET hidden = $3 WHERE room_id = $1 AND user_id = $2`, [room.id, ctx.userId, input.hidden]);
  return getRoom(ctx, room.id);
}

/** The conversation of a record of another module, made on first use. */
export async function entityRoom(ctx, type, entityId) {
  const adapter = entityAdapter(type);
  if (!adapter) throw httpError(404, 'Unknown chat type', 'NOT_FOUND');
  const id = Number(entityId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  const access = await adapter.access(ctx.req, id);
  if (!access?.view) throw httpError(404, 'Not found', 'NOT_FOUND');
  const room = await ensureEntityRoom(type, id, { title: access.title, link: access.link });
  await ensureMember(room.id, ctx.userId);
  return getRoom(ctx, room.id);
}

export async function ensureEntityRoom(type, id, known = {}) {
  const found = await query(`SELECT * FROM chat_rooms WHERE entity_type = $1 AND entity_id = $2`, [type, id]);
  if (found.rows[0]) return found.rows[0];
  const adapter = entityAdapter(type);
  const info = known.title ? known : (await adapter?.describe?.(id).catch(() => null)) || {};
  const { rows } = await query(
    `INSERT INTO chat_rooms (kind, title, link, entity_type, entity_id) VALUES ('entity', $1, $2, $3, $4)
     ON CONFLICT (entity_type, entity_id) WHERE entity_type IS NOT NULL DO NOTHING RETURNING *`,
    [String(info.title || '').slice(0, 200) || null, info.link || null, type, id]
  );
  if (!rows[0]) return (await query(`SELECT * FROM chat_rooms WHERE entity_type = $1 AND entity_id = $2`, [type, id])).rows[0];
  if (adapter?.seed) {
    await adapter.seed(rows[0].id, id).catch((err) => console.warn(`[chat] history import for ${type} ${id} failed:`, err.message));
    await refreshLast(rows[0].id);
  }
  for (const userId of adapter ? await adapter.participants(id).catch(() => []) : []) await ensureMember(rows[0].id, userId);
  // History brought in from the module counts as read.
  await query(`UPDATE chat_members SET last_read_id = COALESCE((SELECT last_message_id FROM chat_rooms WHERE id = $1), 0) WHERE room_id = $1`, [rows[0].id]);
  return rows[0];
}

async function refreshLast(roomId) {
  await query(
    `UPDATE chat_rooms r SET last_message_id = m.id, last_message_at = m.created_at
     FROM (SELECT id, created_at FROM chat_messages WHERE room_id = $1 ORDER BY id DESC LIMIT 1) m WHERE r.id = $1`,
    [roomId]
  );
}

// ── Messages ────────────────────────────────────────────────────────────────

async function messageShapes(userId, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const replyIds = rows.map((row) => row.reply_to_id).filter(Boolean);
  const [files, reactions, replies] = await Promise.all([
    query(`SELECT * FROM chat_files WHERE message_id = ANY($1) ORDER BY id`, [ids]),
    query(
      `SELECT r.message_id, r.emoji, r.user_id, COALESCE(u.display_name, u.username) AS name
       FROM chat_reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id = ANY($1) ORDER BY r.created_at`,
      [ids]
    ),
    replyIds.length
      ? query(
          `SELECT m.id, m.body, m.deleted_at, m.kind, m.author_id, COALESCE(u.display_name, u.username) AS name,
                  (SELECT COUNT(*)::int FROM chat_files f WHERE f.message_id = m.id) AS files
           FROM chat_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = ANY($1)`,
          [replyIds]
        )
      : { rows: [] },
  ]);
  return rows.map((row) => {
    const own = reactions.rows.filter((reaction) => Number(reaction.message_id) === Number(row.id));
    const grouped = new Map();
    own.forEach((reaction) => {
      if (!grouped.has(reaction.emoji)) grouped.set(reaction.emoji, { emoji: reaction.emoji, count: 0, mine: false, users: [], userIds: [] });
      const entry = grouped.get(reaction.emoji);
      entry.count += 1;
      entry.users.push(reaction.name);
      entry.userIds.push(reaction.user_id);
      if (reaction.user_id === userId) entry.mine = true;
    });
    const reply = row.reply_to_id ? replies.rows.find((item) => Number(item.id) === Number(row.reply_to_id)) : null;
    const deleted = Boolean(row.deleted_at);
    return {
      id: Number(row.id),
      roomId: row.room_id,
      kind: row.kind,
      author: person(row.author_id, row.author_name, row.author_username, row.author_avatar),
      body: deleted ? '' : row.body,
      data: deleted ? null : row.data || null,
      replyTo: reply ? { id: Number(reply.id), author: reply.name, text: reply.deleted_at ? '' : reply.body.slice(0, 200), files: reply.files, deleted: Boolean(reply.deleted_at) } : null,
      files: deleted ? [] : files.rows.filter((file) => Number(file.message_id) === Number(row.id)).map(fileShape),
      reactions: deleted ? [] : [...grouped.values()],
      mine: row.author_id === userId,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deleted,
    };
  });
}

const MESSAGE_SELECT = `
  SELECT m.*, u.username AS author_username, COALESCE(u.display_name, u.username) AS author_name, u.avatar_path AS author_avatar
  FROM chat_messages m LEFT JOIN users u ON u.id = m.author_id`;

/** A page of messages: newest first by default, `before` / `after` an id, or `around` one (jump to a reply). */
export async function listMessages(ctx, roomId, { before, after, around, q, limit } = {}) {
  const { room } = await requireRoom(ctx, roomId);
  const size = Math.min(100, Math.max(10, Number(limit) || PAGE));
  let rows;
  if (q && String(q).trim().length >= 2) {
    const like = `%${String(q).trim().slice(0, 100).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    rows = (await query(`${MESSAGE_SELECT} WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.body ILIKE $2 ORDER BY m.id DESC LIMIT 50`, [room.id, like])).rows;
    return { messages: await messageShapes(ctx.userId, rows), search: true };
  }
  if (around) {
    const older = await query(`${MESSAGE_SELECT} WHERE m.room_id = $1 AND m.id <= $2 ORDER BY m.id DESC LIMIT $3`, [room.id, Number(around), Math.round(size / 2)]);
    const newer = await query(`${MESSAGE_SELECT} WHERE m.room_id = $1 AND m.id > $2 ORDER BY m.id ASC LIMIT $3`, [room.id, Number(around), Math.round(size / 2)]);
    rows = [...older.rows.reverse(), ...newer.rows];
    return { messages: await messageShapes(ctx.userId, rows), hasOlder: older.rows.length === Math.round(size / 2), hasNewer: newer.rows.length === Math.round(size / 2) };
  }
  if (after) {
    rows = (await query(`${MESSAGE_SELECT} WHERE m.room_id = $1 AND m.id > $2 ORDER BY m.id ASC LIMIT $3`, [room.id, Number(after), size])).rows;
    return { messages: await messageShapes(ctx.userId, rows), hasNewer: rows.length === size };
  }
  const params = [room.id, size];
  let where = 'm.room_id = $1';
  if (before) {
    params.push(Number(before));
    where += ` AND m.id < $3`;
  }
  rows = (await query(`${MESSAGE_SELECT} WHERE ${where} ORDER BY m.id DESC LIMIT $2`, params)).rows.reverse();
  return { messages: await messageShapes(ctx.userId, rows), hasOlder: rows.length === size };
}

async function loadMessage(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Message not found', 'NOT_FOUND');
  const { rows } = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Message not found', 'NOT_FOUND');
  return rows[0];
}

export function mentionedUsernames(text) {
  const names = new Set();
  for (const match of String(text || '').matchAll(MENTION_RE)) names.add(match[2].toLowerCase());
  return [...names];
}

async function broadcast(room, event, payload) {
  publish(await recipientsOf(room), event, payload);
}

export const ROOM_LAST_MESSAGE_SQL = `UPDATE chat_rooms
   SET last_message_id = GREATEST(COALESCE(last_message_id, 0), $2),
       last_message_at = CASE WHEN COALESCE(last_message_id, 0) < $2 THEN $3 ELSE last_message_at END
   WHERE id = $1`;

async function insertMessage(room, { authorId, kind = 'text', body = '', data = null, replyTo = null }) {
  const { rows } = await query(
    `INSERT INTO chat_messages (room_id, author_id, kind, body, data, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [room.id, authorId, kind, body, data ? JSON.stringify(data) : null, replyTo]
  );
  // Two messages committing in either order must leave the newest one as the room's last.
  await query(ROOM_LAST_MESSAGE_SQL, [room.id, rows[0].id, rows[0].created_at]);
  return rows[0].id;
}

/** A call card's link: http(s) only, so a card can never carry a script URL. */
export function callData(call) {
  try {
    const url = new URL(String(call?.url || ''));
    return ['http:', 'https:'].includes(url.protocol) ? { call: { url: url.href } } : null;
  } catch {
    return null;
  }
}

/**
 * A person's message. `input.data` from the client is ignored: cards (calls)
 * are made by the server only, passed as `system.call` by the /call route.
 */
export async function postMessage(ctx, roomId, input = {}, system = {}) {
  const { room } = await requireRoom(ctx, roomId, 'write');
  const body = String(input.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, 10000);
  const fileIds = (Array.isArray(input.fileIds) ? input.fileIds : []).map(Number).filter(Number.isInteger).slice(0, 10);
  if (!body && !fileIds.length) throw httpError(400, 'The message is empty', 'TEXT_REQUIRED');
  let replyTo = null;
  if (input.replyTo) {
    const target = await loadMessage(input.replyTo);
    if (target.room_id === room.id) replyTo = Number(target.id);
  }
  const data = system.call ? callData(system.call) : null;
  if (system.call && !data) throw httpError(400, 'The call link must start with http:// or https://', 'CALL_URL');
  const id = await insertMessage(room, { authorId: ctx.userId, body, replyTo, data });
  if (fileIds.length) {
    await query(`UPDATE chat_files SET message_id = $1 WHERE id = ANY($2) AND room_id = $3 AND uploaded_by = $4 AND message_id IS NULL`, [id, fileIds, room.id, ctx.userId]);
  }
  await ensureMember(room.id, ctx.userId);
  await query(`UPDATE chat_members SET last_read_id = $3, hidden = FALSE WHERE room_id = $1 AND user_id = $2`, [room.id, ctx.userId, id]);
  // A direct chat reappears for the other person when it gets a new message.
  if (room.kind === 'direct') await query(`UPDATE chat_members SET hidden = FALSE WHERE room_id = $1`, [room.id]);
  const [message] = await messageShapes(ctx.userId, [await loadMessage(id)]);
  const recipients = await recipientsOf(room);
  publish(recipients, 'message', { roomId: room.id, message: { ...message, mine: false } });
  deliverMessage(room, message, recipients, { authorId: ctx.userId, mentions: mentionedUsernames(body), link: linkOf(room) }).catch((err) =>
    console.warn('[chat] delivery failed:', err.message)
  );
  messageWebhooks(room, message, ctx.userId).catch((err) => console.warn('[chat] webhook failed:', err.message));
  return message;
}

/** `chat.message` for webhooks whose person is in the room; entity rooms also tell their module. */
async function messageWebhooks(room, message, authorId) {
  const adapter = room.entity_type ? entityAdapter(room.entity_type) : null;
  if (adapter?.onMessage) await adapter.onMessage(room.entity_id, message, authorId).catch(() => {});
  await emitEvent('chat.message', {
    data: {
      room: { id: room.id, kind: room.kind, title: room.kind === 'direct' ? null : room.title, entityType: room.entity_type || null, entityId: room.entity_id || null, url: linkOf(room) ? `${publicBase()}${linkOf(room)}` : null },
      message: { id: message.id, body: message.body, author: message.author, replyTo: message.replyTo || null, files: message.files || [], createdAt: message.createdAt },
    },
    visible: async (req) => (await accessTo(chatContext(req), room)).view,
  });
}

async function postSystemTo(room, actorId, data, { notifyText } = {}) {
  const id = await insertMessage(room, { authorId: actorId || null, kind: 'system', data });
  const [message] = await messageShapes(0, [await loadMessage(id)]);
  const recipients = await recipientsOf(room);
  publish(recipients, 'message', { roomId: room.id, message });
  if (notifyText) {
    deliverMessage(room, { ...message, body: notifyText }, recipients, { authorId: actorId, system: true, link: linkOf(room) }).catch(() => {});
  }
  return message;
}

/**
 * For modules: a system event in a record's conversation ("Anna moved the
 * deadline"). `data.event` names it for the UI; the room is made if needed.
 * `notifyText` also sends it as a push to the room's people (reminders).
 */
export async function postSystem(type, entityId, { actorId = null, data, notifyText } = {}) {
  const room = await ensureEntityRoom(type, Number(entityId));
  return postSystemTo(room, actorId, data, { notifyText });
}

/** Writes several history entries at once, in order, without notifications (imports). */
export async function importHistory(roomId, entries) {
  for (const entry of entries) {
    await query(
      `INSERT INTO chat_messages (room_id, author_id, kind, body, data, created_at, edited_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [roomId, entry.authorId || null, entry.kind || 'text', entry.body || '', entry.data ? JSON.stringify(entry.data) : null, entry.createdAt || new Date(), entry.editedAt || null]
    );
  }
}

export async function editMessage(ctx, messageId, body) {
  const row = await loadMessage(messageId);
  const { room } = await requireRoom(ctx, row.room_id, 'write');
  if (row.author_id !== ctx.userId || row.kind !== 'text') throw httpError(403, 'You can edit only your own messages', 'FORBIDDEN');
  if (row.deleted_at) throw httpError(400, 'The message was deleted', 'DELETED');
  const text = String(body ?? '').trim().slice(0, 10000);
  if (!text) throw httpError(400, 'The message is empty', 'TEXT_REQUIRED');
  await query(`UPDATE chat_messages SET body = $2, edited_at = NOW() WHERE id = $1`, [row.id, text]);
  const [message] = await messageShapes(ctx.userId, [await loadMessage(row.id)]);
  await broadcast(room, 'message.update', { roomId: room.id, message: { ...message, mine: false } });
  return message;
}

export async function deleteMessage(ctx, messageId) {
  const row = await loadMessage(messageId);
  const { room, access } = await requireRoom(ctx, row.room_id);
  if (row.author_id !== ctx.userId && !access.manage && !ctx.isAdmin) throw httpError(403, 'You can delete only your own messages', 'FORBIDDEN');
  if (row.kind === 'system' && !ctx.isAdmin) throw httpError(403, 'Events cannot be deleted', 'FORBIDDEN');
  await query(`UPDATE chat_messages SET deleted_at = NOW(), body = '' WHERE id = $1`, [row.id]);
  const files = await query(`DELETE FROM chat_files WHERE message_id = $1 RETURNING storage_key`, [row.id]);
  for (const file of files.rows) await removeStored(file.storage_key);
  await query(`DELETE FROM chat_reactions WHERE message_id = $1`, [row.id]);
  await broadcast(room, 'message.delete', { roomId: room.id, id: Number(row.id) });
}

export async function react(ctx, messageId, emoji) {
  const row = await loadMessage(messageId);
  const { room } = await requireRoom(ctx, row.room_id);
  const value = String(emoji || '').trim();
  if (!EMOJI.test(value)) throw httpError(400, 'Unknown reaction', 'EMOJI');
  if (row.deleted_at) throw httpError(400, 'The message was deleted', 'DELETED');
  const existing = await query(`DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 RETURNING 1`, [row.id, ctx.userId, value]);
  if (!existing.rows.length) await query(`INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`, [row.id, ctx.userId, value]);
  const [message] = await messageShapes(ctx.userId, [row]);
  await broadcast(room, 'message.update', { roomId: room.id, message: { ...message, mine: row.author_id === ctx.userId ? undefined : false }, reactionsOnly: true });
  return message;
}

export async function markRead(ctx, roomId, messageId) {
  const { room } = await requireRoom(ctx, roomId);
  await ensureMember(room.id, ctx.userId);
  const upTo = Number(messageId) || Number(room.last_message_id) || 0;
  const { rows } = await query(
    `UPDATE chat_members SET last_read_id = GREATEST(last_read_id, $3) WHERE room_id = $1 AND user_id = $2 RETURNING last_read_id`,
    [room.id, ctx.userId, upTo]
  );
  const lastReadId = Number(rows[0]?.last_read_id || 0);
  await broadcast(room, 'read', { roomId: room.id, userId: ctx.userId, lastReadId });
  return { lastReadId, unread: await unreadTotal(ctx.userId) };
}

export async function typing(ctx, roomId) {
  const { room } = await requireRoom(ctx, roomId, 'write');
  const others = (await recipientsOf(room)).filter((id) => id !== ctx.userId);
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [ctx.userId]);
  publish(others, 'typing', { roomId: room.id, user: { id: ctx.userId, name: rows[0]?.name } });
}

/** Unread messages across all chats (muted ones excluded), for the header badge. */
export async function unreadTotal(userId) {
  const { rows } = await query(
    `SELECT COUNT(msg.id)::int AS n FROM chat_members me
     JOIN chat_messages msg ON msg.room_id = me.room_id AND msg.id > me.last_read_id AND msg.deleted_at IS NULL
          AND msg.kind <> 'system' AND msg.author_id IS DISTINCT FROM me.user_id
     WHERE me.user_id = $1 AND NOT me.muted AND NOT me.hidden`,
    [userId]
  );
  return rows[0].n;
}

/** Messages across my chats that contain the text. */
export async function searchMessages(ctx, q) {
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  const like = `%${text.slice(0, 100).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { rows } = await query(
    `${MESSAGE_SELECT} JOIN chat_members me ON me.room_id = m.room_id AND me.user_id = $1
     WHERE m.deleted_at IS NULL AND m.kind = 'text' AND m.body ILIKE $2 ORDER BY m.id DESC LIMIT 120`,
    [ctx.userId, like]
  );
  // Entity rooms count only while the person can still see the record.
  const entityRooms = [...new Set(rows.map((row) => row.room_id))];
  const { rows: rooms } = await query(`SELECT * FROM chat_rooms WHERE id = ANY($1) AND entity_type IS NOT NULL`, [entityRooms]);
  const hidden = await hiddenEntityRooms(ctx, rooms);
  return messageShapes(ctx.userId, rows.filter((row) => !hidden.has(row.room_id)).slice(0, 40));
}

// ── Files ───────────────────────────────────────────────────────────────────

export async function storeUploads(ctx, roomId, files) {
  const out = [];
  const stored = new Set();
  try {
    const { room } = await requireRoom(ctx, roomId, 'write');
    for (const file of files) {
      const { rows } = await query(
        `INSERT INTO chat_files (room_id, uploaded_by, name, mime, size, storage_key) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [room.id, ctx.userId, originalName(file).slice(0, 255), String(file.mimetype || '').slice(0, 120), file.size, file.storageKey]
      );
      stored.add(file.storageKey);
      out.push(fileShape(rows[0]));
    }
  } catch (err) {
    // Rows already written are swept with the other unsent uploads (purgeOrphanFiles).
    await Promise.all(files.filter((file) => !stored.has(file.storageKey)).map((file) => unlink(file.path || filePath(file.storageKey)).catch(() => {})));
    throw err;
  }
  return out;
}

export async function fileForDownload(ctx, fileId) {
  const n = Number(fileId);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'File not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM chat_files WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
  await requireRoom(ctx, rows[0].room_id);
  if (!rows[0].message_id && rows[0].uploaded_by !== ctx.userId) throw httpError(404, 'File not found', 'NOT_FOUND');
  return rows[0];
}

/** Files shared in a room, newest first (the "Files" tab of a conversation). */
export async function roomFiles(ctx, roomId) {
  const { room } = await requireRoom(ctx, roomId);
  const { rows } = await query(
    `SELECT f.*, COALESCE(u.display_name, u.username) AS author FROM chat_files f LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.room_id = $1 AND f.message_id IS NOT NULL ORDER BY f.id DESC LIMIT 200`,
    [room.id]
  );
  return rows.map((row) => ({ ...fileShape(row), author: row.author, createdAt: row.created_at, messageId: Number(row.message_id) }));
}

/** Everyone who can be added to a chat or messaged. */
export async function directory(ctx, q) {
  const like = `%${String(q || '').trim().slice(0, 60).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { rows } = await query(
    `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path, email FROM users
     WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE AND id <> $1
       AND (COALESCE(display_name, '') ILIKE $2 OR username ILIKE $2 OR COALESCE(email, '') ILIKE $2)
     ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 50`,
    [ctx.userId, like]
  );
  return rows.map((row) => ({ ...person(row.id, row.name, row.username, row.avatar_path), online: isOnline(row.id) }));
}
