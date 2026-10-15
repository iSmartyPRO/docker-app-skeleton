import { query } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { LEVEL, httpError } from '../shared/acl.js';
import { originalName } from '../shared/storage.js';
import { nodeInLink } from './links.js';
import {
  createFolder,
  ensureFolderTree,
  fileUploader,
  filesSettings,
  moveNode,
  nodeShape,
  renameNode,
  replaceContent,
  resolveTarget,
  runUpload,
  safeName,
  storeUploads,
  trashNode,
} from './service.js';

/*
 * What visitors of a public link may change (see links.js for the model).
 *
 * Every write runs as the link's author (their access context): the usual
 * Files checks apply unchanged — edit rights on the target, the owner's
 * personal quota, file types and magic bytes, the knowledge-base guard on
 * deletes, the trash. On top of that each route needs its permission on the
 * link, a visitor session (with a name when the link asks for one), a target
 * inside the shared subtree (never the shared root itself for rename, move
 * and delete) and the link's own limits (file size, types, total quota).
 * Each change is written to fs_link_events with the visitor's name: that is
 * the activity log, the per-link quota and the source of owner notices.
 */

const MB = 1024 * 1024;
const EVENT_ACTIONS = ['upload', 'replace', 'mkdir', 'rename', 'move', 'delete'];

export function requirePerm(link, key) {
  if (!link.perms.includes(key)) throw httpError(403, 'This link does not allow this action', 'LINK_FORBIDDEN');
}

/**
 * Writes need a visitor session token (scope "w": never a read token, nor one
 * issued before scopes, which the page swaps for a new one on its next load),
 * and the name (and e-mail) when the link asks for them.
 */
export function requireSession(link) {
  if (!link.visitor?.sid || link.visitor.scope !== 'write') throw httpError(401, 'Start a visitor session first', 'VISITOR_SESSION');
  if (link.require_name && !link.visitor.n) throw httpError(400, 'Enter your name', 'VISITOR_NAME');
  if (link.require_name && link.require_email && !link.visitor.e) throw httpError(400, 'Enter your e-mail', 'VISITOR_EMAIL');
}

const extensionsOf = (link) => (link.extensions ? link.extensions.split(',').filter(Boolean) : []);

/** Inside the link, and not its root (the shared item itself cannot be renamed, moved or deleted). */
async function innerNode(link, id) {
  const { node } = await nodeInLink(link, id);
  if (node.id === link.node_id) throw httpError(403, 'The shared item itself cannot be changed', 'LINK_ROOT');
  return node;
}

async function folderInLink(link, id) {
  const { node } = await nodeInLink(link, id || link.node_id);
  if (node.kind !== 'folder') throw httpError(400, 'Choose a folder', 'NOT_FOLDER');
  return node;
}

/**
 * One row of the link's activity. `name` is what the owner sees (the stored
 * name); `sentName` the name the visitor sent, when it differs (shown back to
 * an upload-only visitor, who must not learn that the folder held that name).
 */
export async function logEvent(client, link, ip, { action, node = null, name = null, bytes = 0, sentName = null }) {
  if (!EVENT_ACTIONS.includes(action)) return;
  await (client || { query }).query(
    `INSERT INTO fs_link_events (link_id, link_title, node_id, owner_id, action, name, bytes, session_id, visitor_name, visitor_email, ip, notified, sent_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      link.id,
      (link.title || link.name || '').slice(0, 255),
      node?.id || null,
      link.created_by,
      action,
      name ? String(name).slice(0, 255) : null,
      Math.max(0, Number(bytes) || 0),
      link.visitor?.sid || null,
      link.visitor?.n || null,
      link.visitor?.e || null,
      ip ? String(ip).slice(0, 64) : null,
      !link.notify,
      sentName && sentName !== name ? String(sentName).slice(0, 255) : null,
    ]
  );
}

/** Bytes uploaded through the link so far (uploads and replacements, deleted ones included). */
async function linkBytes(client, linkId) {
  const { rows } = await client.query(`SELECT COALESCE(SUM(bytes), 0)::bigint AS used FROM fs_link_events WHERE link_id = $1`, [linkId]);
  return Number(rows[0].used);
}

/**
 * The total a link may take in: its own quota, else the module's default for
 * links without one (linkQuotaMb, 0 = unlimited). Uploads and replacements
 * both count (a replacement also keeps the old version in the owner's trash).
 */
export function linkQuotaBytes(link, settings = {}) {
  const own = Number(link.quota_mb) || 0;
  if (own > 0) return own * MB;
  const fallback = Number(settings.linkQuotaMb) || 0;
  return fallback > 0 ? fallback * MB : 0;
}

/** The link's total quota, checked under a per-link lock inside the write's transaction. */
function quotaHook(link, settings) {
  const quota = linkQuotaBytes(link, settings);
  if (!quota) return null;
  return async (client, file) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fs-link:${link.id}`]);
    if ((await linkBytes(client, link.id)) + file.size > quota) throw httpError(413, 'The upload limit of this link is reached', 'LINK_QUOTA');
  };
}

/** Early refusal before the body is read, when the request alone cannot fit the link quota. */
async function precheckQuota(link, req, settings) {
  const quota = linkQuotaBytes(link, settings);
  if (!quota) return;
  const length = Number(req.get('content-length')) || 0;
  const used = await linkBytes({ query }, link.id);
  // A little room for the multipart envelope.
  if (used >= quota || length > quota - used + 256 * 1024) throw httpError(413, 'The upload limit of this link is reached', 'LINK_QUOTA');
}

function uploaderFor(link, settings, { field = 'files', maxFiles = 20 } = {}) {
  const exts = extensionsOf(link);
  return fileUploader(settings, field, {
    maxBytes: (link.max_file_mb || 0) * MB,
    allow: exts.length ? (ext) => exts.includes(ext) : null,
    maxFiles,
  });
}

/**
 * POST /upload — new files into a folder of the link (upload-only links: its
 * root). A name already taken gets "name (2)" as usual; a visitor who cannot
 * see the folder is answered with the name they sent, so a drop box never
 * reveals what it holds (the owner sees the stored names).
 */
export async function visitorUpload(link, req, res) {
  requirePerm(link, 'upload');
  requireSession(link);
  const canView = link.perms.includes('view');
  const folder = await folderInLink(link, canView ? req.query.folder : null);
  const target = await resolveTarget(link.authorCtx, { parentId: folder.id });
  const settings = await filesSettings();
  await precheckQuota(link, req, settings);
  await runUpload(await uploaderFor(link, settings), req, res);
  const sent = new Map();
  const rows = await storeUploads(link.authorCtx, target, req.files || [], {
    before: quotaHook(link, settings),
    after: (client, row, file) => {
      const sentName = safeName(originalName(file));
      sent.set(row.id, sentName);
      return logEvent(client, link, req.ip, { action: 'upload', node: row, name: row.name, bytes: row.size, sentName });
    },
  });
  return rows.map((row) => {
    const shape = nodeShape(row, LEVEL.view);
    return canView ? shape : { ...shape, name: sent.get(row.id) || shape.name };
  });
}

/** POST /nodes/:id/replace — a new version of a file (the old one goes to the owner's trash). */
export async function visitorReplace(link, id, req, res) {
  requirePerm(link, 'replace');
  requireSession(link);
  const { node } = await nodeInLink(link, id);
  if (node.kind !== 'file') throw httpError(400, 'Choose a file', 'NOT_FILE');
  const settings = await filesSettings();
  await precheckQuota(link, req, settings);
  await runUpload(await uploaderFor(link, settings, { field: 'file', maxFiles: 1 }), req, res);
  const file = (req.files || [])[0];
  if (!file) throw httpError(400, 'Choose a file', 'FILE_MISSING');
  const row = await replaceContent(link.authorCtx, node.id, file, {
    before: quotaHook(link, settings),
    after: (client, updated) => logEvent(client, link, req.ip, { action: 'replace', node: updated, name: updated.name, bytes: updated.size }),
  });
  return nodeShape(row, LEVEL.view);
}

/** POST /folders — { parentId, name }. */
export async function visitorMkdir(link, input, ip) {
  requirePerm(link, 'mkdir');
  requireSession(link);
  const parent = await folderInLink(link, input?.parentId);
  const node = await createFolder(link.authorCtx, { parentId: parent.id, name: input?.name });
  await logEvent(null, link, ip, { action: 'mkdir', node, name: node.name });
  return { ...node, level: 'view' };
}

/** POST /folders/tree — folder uploads (needs upload and mkdir). */
export async function visitorFolderTree(link, input, ip) {
  requirePerm(link, 'upload');
  requirePerm(link, 'mkdir');
  requireSession(link);
  const parent = await folderInLink(link, input?.parentId);
  const quota = linkQuotaBytes(link, await filesSettings());
  if (quota && Number(input?.bytes) > 0 && (await linkBytes({ query }, link.id)) + Number(input.bytes) > quota) {
    throw httpError(413, 'The upload limit of this link is reached', 'LINK_QUOTA');
  }
  const result = await ensureFolderTree(link.authorCtx, { parentId: parent.id }, input?.paths, { bytes: input?.bytes });
  if (result.created) await logEvent(null, link, ip, { action: 'mkdir', node: { id: result.folders[0] }, name: String(input.paths[0] || '') });
  return result;
}

/** PUT /nodes/:id — { name } renames, { move: { parentId } } moves inside the link. */
export async function visitorUpdate(link, id, input, ip) {
  requirePerm(link, 'rename');
  requireSession(link);
  const node = await innerNode(link, id);
  let shaped = null;
  if (input?.name !== undefined) {
    shaped = await renameNode(link.authorCtx, node.id, input.name);
    await logEvent(null, link, ip, { action: 'rename', node: shaped, name: `${node.name} → ${shaped.name}` });
  }
  if (input?.move) {
    const target = await folderInLink(link, input.move.parentId);
    shaped = await moveNode(link.authorCtx, node.id, { parentId: target.id });
    await logEvent(null, link, ip, { action: 'move', node: shaped, name: `${shaped.name} → ${target.name}` });
  }
  if (!shaped) throw httpError(400, 'Nothing to change', 'NAME_REQUIRED');
  return { ...shaped, level: 'view' };
}

/** DELETE /nodes/:id — to the owner's trash. */
export async function visitorDelete(link, id, ip) {
  requirePerm(link, 'delete');
  requireSession(link);
  const node = await innerNode(link, id);
  await trashNode(link.authorCtx, node.id);
  await logEvent(null, link, ip, { action: 'delete', node, name: node.name });
}

/** Upload-only visitors see what they sent in this session (under the names they sent), and nothing else. */
export async function sessionUploads(link) {
  if (!link.visitor?.sid) return [];
  const { rows } = await query(
    `SELECT n.id, COALESCE(e.sent_name, n.name) AS name, n.size, n.ext, n.mime, e.created_at
     FROM fs_link_events e JOIN fs_nodes n ON n.id = e.node_id
     WHERE e.link_id = $1 AND e.session_id = $2 AND e.action = 'upload'
       AND n.deleted_at IS NULL AND n.parent_id = $3
     ORDER BY e.id DESC LIMIT 200`,
    [link.id, link.visitor.sid, link.node_id]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, size: Number(row.size) || 0, ext: row.ext, at: row.created_at }));
}

// ── Owner notices ───────────────────────────────────────────────────────────

const QUIET_SECONDS = 45;

/**
 * Scheduler job: one notice per visitor burst. Events of links with
 * "notify me" wait (notified = false) until their session has been quiet for
 * QUIET_SECONDS (or ten minutes passed), then become a single notice to the
 * link's author: "Anna — link "Contracts": 3 uploaded, 1 changed".
 */
export async function flushLinkNotices({ quietSeconds = QUIET_SECONDS } = {}) {
  const { rows } = await query(
    `WITH ready AS (
       SELECT link_id, session_id FROM fs_link_events WHERE notified = FALSE
       GROUP BY link_id, session_id
       HAVING MAX(created_at) < NOW() - make_interval(secs => $1) OR MIN(created_at) < NOW() - INTERVAL '10 minutes'
     )
     UPDATE fs_link_events e SET notified = TRUE FROM ready r
     WHERE e.notified = FALSE AND e.link_id IS NOT DISTINCT FROM r.link_id AND e.session_id IS NOT DISTINCT FROM r.session_id
     RETURNING e.link_id, e.session_id, e.owner_id, e.action, e.name, e.link_title, e.visitor_name`,
    [quietSeconds]
  );
  if (!rows.length) return 0;
  const bursts = new Map();
  for (const row of rows) {
    const key = `${row.link_id}:${row.session_id}`;
    if (!bursts.has(key)) bursts.set(key, { ...row, counts: { upload: 0, change: 0, delete: 0 }, names: [] });
    const burst = bursts.get(key);
    const bucket = row.action === 'upload' ? 'upload' : row.action === 'delete' ? 'delete' : 'change';
    burst.counts[bucket] += 1;
    if (row.action === 'upload' && burst.names.length < 5) burst.names.push(row.name);
  }
  const linkIds = [...new Set(rows.map((row) => row.link_id).filter(Boolean))];
  const { rows: links } = linkIds.length ? await query(`SELECT id, node_id FROM fs_links WHERE id = ANY($1)`, [linkIds]) : { rows: [] };
  const nodeOf = new Map(links.map((row) => [row.id, row.node_id]));
  let sent = 0;
  for (const burst of bursts.values()) {
    if (!burst.owner_id) continue;
    const nodeId = nodeOf.get(burst.link_id);
    const { upload, change, delete: removed } = burst.counts;
    const more = upload > burst.names.length ? upload - burst.names.length : 0;
    await notify({
      userIds: [burst.owner_id],
      kind: 'files.linkActivity',
      module: 'files',
      link: nodeId ? `/app/files/n/${nodeId}` : '/app/files',
      render: (locale) => {
        const ru = locale === 'ru';
        const who = burst.visitor_name || (ru ? 'Посетитель' : 'A visitor');
        const parts = ru
          ? [upload && `загружено: ${upload}`, change && `изменено: ${change}`, removed && `удалено: ${removed}`]
          : [upload && `${upload} uploaded`, change && `${change} changed`, removed && `${removed} deleted`];
        const names = burst.names.length ? `\n${burst.names.join(', ')}${more ? (ru ? ` и ещё ${more}` : ` and ${more} more`) : ''}` : '';
        return {
          title: ru ? `${who} — ссылка «${burst.link_title}»` : `${who} — link “${burst.link_title}”`,
          body: `${parts.filter(Boolean).join(', ')}${names}`,
        };
      },
    });
    sent += 1;
  }
  return sent;
}
