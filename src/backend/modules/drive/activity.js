import { query } from '../../config/database.js';
import { avatarOf } from '../shared/acl.js';
import { driveSettings } from './credentials.js';

/*
 * Activity log of the file server: who opened, downloaded, changed, deleted or
 * shared what, from where, and whether it worked. Written for every request
 * through the portal (people and public-link visitors) and for administration
 * of servers and folders; read by holders of `drive.audit`.
 *
 * Writing never slows down or breaks the request: rows are inserted after the
 * response and errors are only reported to the console. Repeated reads (the
 * same file opened in ranges, the same folder listed again) are folded.
 */

export const ACTION_GROUPS = {
  browse: ['list', 'search', 'view', 'link_open'],
  download: ['download', 'download_zip'],
  change: ['upload', 'mkdir', 'rename', 'move', 'copy', 'edit'],
  delete: ['delete'],
  links: ['link_create', 'link_update', 'link_delete', 'link_password_failed'],
  connect: ['connect', 'disconnect'],
  admin: ['server_save', 'server_delete', 'share_save', 'share_delete'],
};
export const ACTIONS = Object.values(ACTION_GROUPS).flat();

// Reads within this window count once per person (or visitor IP) and path.
const FOLD_MS = { list: 5 * 60 * 1000, view: 10 * 60 * 1000, link_open: 10 * 60 * 1000, search: 60 * 1000 };
const folded = new Map();

function seenRecently(key, windowMs) {
  const now = Date.now();
  const last = folded.get(key);
  if (last && now - last < windowMs) return true;
  folded.set(key, now);
  if (folded.size > 20000) {
    for (const [entry, at] of folded) if (now - at > 15 * 60 * 1000) folded.delete(entry);
    if (folded.size > 20000) folded.clear();
  }
  return false;
}

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

/**
 * Records one event. `req` gives the person, IP and browser; `event` holds
 * action, shareId, path, toShareId, toPath, isDir, size, count, ok, code,
 * via ('portal' | 'link'), linkId and free-form details.
 */
export function logActivity(req, event) {
  record(req, event).catch((err) => console.error('[drive] activity log failed:', err.message));
}

async function record(req, event) {
  const settings = await driveSettings();
  if (settings.activityLog === false) return;
  if (event.action === 'list' && settings.logBrowsing === false) return;
  const user = req.user || null;
  const ip = clip(req.ip, 64);
  const fold = FOLD_MS[event.action];
  if (fold && event.ok !== false) {
    const who = user ? `u${user.id}` : `ip${ip}`;
    if (seenRecently(`${event.action}|${who}|${event.linkId || ''}|${event.shareId || ''}|${event.path || ''}|${event.details?.q || ''}`, fold)) return;
  }
  await query(
    `INSERT INTO drive_activity
       (user_id, user_name, user_login, action, via, share_id, share_title, path, to_share_id, to_path,
        is_dir, size, item_count, ok, error_code, ip, user_agent, link_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::int, (SELECT title FROM drive_shares WHERE id = $6::int), $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      user?.id || null,
      clip(user?.displayName, 255),
      clip(user?.username, 255),
      event.action,
      event.via || 'portal',
      Number.isInteger(event.shareId) ? event.shareId : null,
      clip(event.path || '', 4000),
      Number.isInteger(event.toShareId) ? event.toShareId : null,
      event.toPath == null ? null : clip(event.toPath, 4000),
      typeof event.isDir === 'boolean' ? event.isDir : null,
      Number.isFinite(event.size) ? Math.round(event.size) : null,
      Number.isInteger(event.count) ? event.count : null,
      event.ok !== false,
      clip(event.code, 40),
      ip,
      clip(req.get?.('user-agent'), 300),
      Number.isInteger(event.linkId) ? event.linkId : null,
      event.details && Object.keys(event.details).length ? JSON.stringify(event.details) : null,
    ]
  );
}

// Failures that only mean "this person has not connected yet" are not worth a row.
const QUIET = new Set(['CREDENTIALS_REQUIRED', 'CREDENTIALS_FAILED', 'RATE_LIMITED']);

export function clientLeft(req, res, err) {
  return err?.name === 'AbortError' || ['ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE', 'EPIPE'].includes(err?.code) || (res.headersSent && (req.destroyed || res.destroyed));
}

/**
 * Route wrapper: runs the handler, then logs success or failure. `describe`
 * turns the request (and the handler's result, when there is one) into one or
 * more events.
 */
export function audited(action, rawDescribe, handler) {
  // A request with a malformed path must still get its error answer (and a row), not crash the process.
  const describe = (req, result) => {
    try {
      return rawDescribe(req, result);
    } catch {
      return { path: '' };
    }
  };
  return async (req, res, next) => {
    let result;
    try {
      result = await handler(req, res);
    } catch (err) {
      // The browser hanging up mid-stream (pdf.js range reads, a cancelled download) still means it was opened.
      if (clientLeft(req, res, err)) {
        for (const event of [].concat(describe(req, null) || [])) logActivity(req, { action, ...event });
        return next(err);
      }
      if (!QUIET.has(err?.code)) {
        for (const event of [].concat(describe(req, null) || [])) {
          logActivity(req, { action, ...event, ok: false, code: err?.code || 'ERROR', details: { ...(event.details || {}), error: clip(err?.message, 300) } });
        }
      }
      return next(err);
    }
    for (const event of [].concat(describe(req, result) || [])) logActivity(req, { action, ...event });
    return undefined;
  };
}

// ── Reading the log ─────────────────────────────────────────────────────────

const ids = (value) =>
  String(value || '')
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 100);

const likeEscape = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** WHERE clause and parameters for the filters of the log page (and the CSV export). */
export function activityFilter(input = {}) {
  const where = [];
  const params = [];
  const add = (sql, ...values) => {
    let text = sql;
    for (const value of values) {
      params.push(value);
      text = text.replace('?', `$${params.length}`);
    }
    where.push(text);
  };

  const from = input.from ? new Date(input.from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
  if (!Number.isNaN(from.getTime())) add('a.at >= ?', from.toISOString());
  if (input.to) {
    const to = new Date(input.to);
    if (!Number.isNaN(to.getTime())) add('a.at <= ?', to.toISOString());
  }
  const users = ids(input.users);
  if (users.length) add('a.user_id = ANY(?::int[])', users);
  if (input.visitors === '1') where.push('a.user_id IS NULL');
  const shares = ids(input.shares);
  if (shares.length) add('(a.share_id = ANY(?::int[]) OR a.to_share_id = ANY(?::int[]))', shares, shares);
  const actions = String(input.actions || '')
    .split(',')
    .flatMap((item) => ACTION_GROUPS[item] || (ACTIONS.includes(item) ? [item] : []));
  if (actions.length) add('a.action = ANY(?::text[])', [...new Set(actions)]);
  if (input.result === 'ok') where.push('a.ok');
  if (input.result === 'failed') where.push('NOT a.ok');
  if (input.via === 'portal' || input.via === 'link') add('a.via = ?', input.via);
  if (typeof input.path === 'string' && input.path.trim()) {
    const path = input.path.trim().replace(/^\/+|\/+$/g, '');
    const prefix = `${likeEscape(path)}/%`;
    add('(a.path = ? OR a.path LIKE ? OR a.to_path = ? OR a.to_path LIKE ?)', path, prefix, path, prefix);
  }
  if (typeof input.ip === 'string' && input.ip.trim()) add('a.ip LIKE ?', `${likeEscape(input.ip.trim())}%`);
  if (typeof input.q === 'string' && input.q.trim()) {
    const like = `%${likeEscape(input.q.trim().slice(0, 200))}%`;
    add(
      `(a.path ILIKE ? OR a.to_path ILIKE ? OR a.user_name ILIKE ? OR a.user_login ILIKE ? OR a.share_title ILIKE ? OR a.ip ILIKE ? OR a.details::text ILIKE ?)`,
      like, like, like, like, like, like, like
    );
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function rowShape(row) {
  return {
    id: Number(row.id),
    at: row.at,
    user: row.user_id || row.user_name ? { id: row.user_id, name: row.current_name || row.user_name, login: row.user_login, avatarUrl: avatarOf(row.avatar_path), deleted: !row.user_id } : null,
    action: row.action,
    via: row.via,
    share: row.share_id || row.share_title ? { id: row.share_id, title: row.current_share || row.share_title, color: row.share_color || null } : null,
    path: row.path,
    toShare: row.to_share_id ? { id: row.to_share_id, title: row.to_share_title || null } : null,
    toPath: row.to_path,
    isDir: row.is_dir,
    size: row.size == null ? null : Number(row.size),
    count: row.item_count,
    ok: row.ok,
    code: row.error_code,
    ip: row.ip,
    userAgent: row.user_agent,
    linkId: row.link_id,
    details: row.details || null,
  };
}

const SELECT = `
  SELECT a.*, COALESCE(u.display_name, u.username) AS current_name, u.avatar_path,
         s.title AS current_share, s.color AS share_color, ts.title AS to_share_title
    FROM drive_activity a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN drive_shares s ON s.id = a.share_id
    LEFT JOIN drive_shares ts ON ts.id = a.to_share_id`;

/** One page of the log plus the period's figures and leaders. */
export async function listActivity(input = {}) {
  const { sql, params } = activityFilter(input);
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 50, 10), 200);
  const page = Math.max(Number(input.page) || 1, 1);
  const n = params.length;
  const [rows, totals, users, files] = await Promise.all([
    query(`${SELECT} ${sql} ORDER BY a.at DESC, a.id DESC LIMIT $${n + 1} OFFSET $${n + 2}`, [...params, pageSize, (page - 1) * pageSize]),
    query(
      `SELECT COUNT(*)::int AS events,
              COUNT(DISTINCT COALESCE(a.user_id::text, 'ip:' || a.ip))::int AS people,
              COUNT(*) FILTER (WHERE a.action = ANY($${n + 1}::text[]))::int AS downloads,
              COUNT(*) FILTER (WHERE a.action = ANY($${n + 2}::text[]))::int AS changes,
              COUNT(*) FILTER (WHERE a.action = 'delete')::int AS deletes,
              COUNT(*) FILTER (WHERE NOT a.ok)::int AS failures
         FROM drive_activity a ${sql}`,
      [...params, ACTION_GROUPS.download, ACTION_GROUPS.change]
    ),
    query(
      `SELECT a.user_id, MAX(COALESCE(u.display_name, u.username, a.user_name)) AS name, COUNT(*)::int AS events
         FROM drive_activity a LEFT JOIN users u ON u.id = a.user_id
         ${sql ? `${sql} AND` : 'WHERE'} a.user_id IS NOT NULL
        GROUP BY a.user_id ORDER BY events DESC LIMIT 5`,
      params
    ),
    query(
      `SELECT a.share_id, MAX(COALESCE(s.title, a.share_title)) AS share_title, a.path, COUNT(*)::int AS events
         FROM drive_activity a LEFT JOIN drive_shares s ON s.id = a.share_id
         ${sql ? `${sql} AND` : 'WHERE'} a.path <> '' AND a.action <> 'list'
        GROUP BY a.share_id, a.path ORDER BY events DESC LIMIT 5`,
      params
    ),
  ]);
  return {
    items: rows.rows.map(rowShape),
    total: totals.rows[0].events,
    page,
    pageSize,
    summary: totals.rows[0],
    top: {
      users: users.rows.map((row) => ({ id: row.user_id, name: row.name, events: row.events })),
      files: files.rows.map((row) => ({ shareId: row.share_id, shareTitle: row.share_title, path: row.path, events: row.events })),
    },
  };
}

/** People who appear in the log (deleted accounts included), for the filter. */
export async function activityPeople(q) {
  const like = `%${likeEscape(String(q || '').trim().slice(0, 100))}%`;
  const { rows } = await query(
    `SELECT a.user_id AS id, MAX(COALESCE(u.display_name, u.username, a.user_name)) AS name, MAX(COALESCE(u.username, a.user_login)) AS login
       FROM drive_activity a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.user_id IS NOT NULL
        AND (COALESCE(u.display_name, u.username, a.user_name) ILIKE $1 OR COALESCE(u.username, a.user_login) ILIKE $1)
      GROUP BY a.user_id ORDER BY name LIMIT 50`,
    [like]
  );
  return rows;
}

/**
 * One CSV cell. Text that a spreadsheet would read as a formula (= + - @, or
 * a leading tab / CR) gets a leading apostrophe; numbers stay numbers.
 */
export const csvCell = (value) => {
  if (value == null) return '';
  let text = String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The filtered log as CSV (Excel-friendly: BOM and ';'), newest first, up to 100 000 rows. */
export async function exportActivity(res, input = {}) {
  const { sql, params } = activityFilter(input);
  const { rows } = await query(`${SELECT} ${sql} ORDER BY a.at DESC, a.id DESC LIMIT 100000`, params);
  // Times in the viewer's zone (sent by the browser), else UTC; "2026-10-11 09:05:00" reads well in Excel.
  let zone = 'UTC';
  try {
    if (input.tz) zone = new Intl.DateTimeFormat('en', { timeZone: String(input.tz) }).resolvedOptions().timeZone;
  } catch {
    zone = 'UTC';
  }
  const stampOf = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const head = [`time (${zone})`, 'user', 'login', 'action', 'result', 'error', 'via', 'folder', 'path', 'to_folder', 'to_path', 'size', 'items', 'ip', 'user_agent', 'details'];
  const lines = rows.map((raw) => {
    const row = rowShape(raw);
    return [
      stampOf.format(new Date(row.at)),
      row.user?.name || '',
      row.user?.login || '',
      row.action,
      row.ok ? 'ok' : 'failed',
      row.code || '',
      row.via,
      row.share?.title || '',
      row.path,
      row.toShare?.title || '',
      row.toPath || '',
      row.size ?? '',
      row.count ?? '',
      row.ip || '',
      row.userAgent || '',
      row.details ? JSON.stringify(row.details) : '',
    ]
      .map(csvCell)
      .join(';');
  });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="file-server-activity-${stamp}.csv"`);
  res.send(`﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`);
}

/** Daily: drops rows older than the retention period (0 = keep forever). */
export async function pruneActivity() {
  const settings = await driveSettings();
  const days = Number(settings.activityDays) || 0;
  if (days > 0) await query(`DELETE FROM drive_activity WHERE at < NOW() - make_interval(days => $1)`, [days]);
}
