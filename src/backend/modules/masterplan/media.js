import multer from 'multer';
import { mkdir, readFile, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { query } from '../../config/database.js';
import { uploadRoot } from '../../config/paths.js';
import { httpError } from '../shared/acl.js';
import { extOf, originalName, readHead, sendBlob, signatureMatches } from '../shared/storage.js';
import { MEDIA_KINDS } from './constants.js';
import { canConfigure, forbidden, notFound, requireProject } from './access.js';
import { actCaps, has, readCaps, rolesAt } from './rules.js';
import { intOr, iso, parseNumber, text } from './util.js';

/*
 * Media of the Masterplan module: construction photos and videos (journal),
 * renders, layouts and documents of objects, backgrounds of site plans.
 *
 * Files live under UPLOAD_DIR/masterplan/YYYY/MM (never the public /uploads
 * tree) and are served through access-checked routes with the shared
 * defensive headers (shared/storage.js). Pictures are compressed in the
 * browser before upload (long side ≤ 2560 px) and come with a small JPEG
 * preview (`thumb`), so phones on a slow connection send little and lists
 * load fast; EXIF date and GPS are read in the browser too.
 */

const ROOT = resolve(uploadRoot, 'masterplan');
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const VIDEO = new Set(['mp4', 'webm', 'mov']);
const DOCS = new Set(['pdf']);

export function mediaShape(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    width: row.width,
    height: row.height,
    takenAt: iso(row.taken_at),
    lat: row.lat,
    lng: row.lng,
    nodeId: row.node_id,
    reportId: row.report_id,
    series: row.series || null,
    url: `/api/app/masterplan/media/${row.id}`,
    thumbUrl: row.thumb_key ? `/api/app/masterplan/media/${row.id}?thumb=1` : null,
    createdAt: iso(row.created_at),
  };
}

export function mediaUploader(maxMb = 50) {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          const now = new Date();
          const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
          await mkdir(resolve(ROOT, dir), { recursive: true });
          const ext = extOf(originalName(file)).replace(/[^a-z0-9]/g, '');
          file.storageKey = `${dir}/${randomBytes(16).toString('hex')}${file.fieldname === 'thumb' ? '-t.jpg' : ext ? `.${ext}` : ''}`;
          cb(null, resolve(ROOT, dir));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 2 },
  }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]);
}

const pathOf = (key) => resolve(ROOT, key);

async function dropFiles(files) {
  for (const file of files) if (file?.path) await unlink(file.path).catch(() => {});
}

export async function removeMediaFiles(rows) {
  for (const row of rows) {
    for (const key of [row.storage_key, row.thumb_key]) if (key) await unlink(pathOf(key)).catch(() => {});
  }
}

/** SVG backgrounds must not carry scripts or event handlers (they are drawn inside the page). */
export function safeSvg(source) {
  const textValue = String(source || '');
  return /^[\s﻿]*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg\b/i.test(textValue) && !/<script\b|\bon[a-z]+\s*=|javascript:|<foreignObject\b|<iframe\b|<embed\b|<object\b/i.test(textValue);
}

/**
 * Stores one uploaded file: { projectId, nodeId?, kind, takenAt?, lat?, lng?, width?, height? }.
 * Rights: plan backgrounds — project configuration; photos for a report not
 * yet written — anyone who reports in the project; files of an object —
 * media.edit / build.edit in its zone.
 */
export async function storeMedia(ctx, body, files) {
  const file = files.file?.[0];
  const thumb = files.thumb?.[0];
  try {
    if (!file) throw httpError(400, 'No file', 'NO_FILE');
    const project = await requireProject(ctx, body.projectId);
    const kind = MEDIA_KINDS.includes(body.kind) ? body.kind : 'photo';
    const nodeId = intOr(body.nodeId);
    // Media of a series (house project / apartment type): shown in the card of every object of it.
    const series = !nodeId ? text(body.series, 160) || null : null;
    let node = null;
    if (nodeId) {
      const { rows } = await query(`SELECT id, project_id, path FROM mp_nodes WHERE id = $1 AND project_id = $2`, [nodeId, project.id]);
      if (!rows[0]) throw httpError(400, 'Unknown object', 'INVALID_FIELD');
      node = rows[0];
    }
    if (kind === 'plan') {
      if (!canConfigure(ctx, project.id)) throw forbidden();
    } else if (series) {
      if (!['render', 'layout', 'doc'].includes(kind)) throw httpError(400, 'A series takes renders, layouts and documents', 'INVALID_FIELD');
      if (!has(actCaps(ctx, { project_id: project.id, path: [] }), 'media.edit') && !canConfigure(ctx, project.id)) throw forbidden();
    } else if (node) {
      const caps = actCaps(ctx, node);
      const ok = has(caps, 'media.edit') || (['photo', 'video'].includes(kind) && has(caps, 'build.edit')) || canConfigure(ctx, project.id) || rolesAt(ctx, node).has('admin');
      if (!ok) throw forbidden();
    } else if (!has(readCaps(ctx, project.id), 'build.edit') && !canConfigure(ctx, project.id)) {
      throw forbidden();
    }
    const name = originalName(file).slice(0, 255);
    const ext = extOf(name);
    const allowed = kind === 'plan' ? new Set([...IMAGE, 'svg']) : ['photo'].includes(kind) ? IMAGE : kind === 'video' ? VIDEO : new Set([...IMAGE, ...DOCS, 'svg']);
    if (!allowed.has(ext)) throw httpError(400, 'This file type is not allowed here', 'FILE_TYPE');
    const head = await readHead(file.path, 16);
    if (!signatureMatches(head, ext)) throw httpError(400, `The file content is not a valid .${ext}`, 'FILE_CONTENT');
    if (ext === 'svg' && !safeSvg(await readFile(file.path, 'utf8'))) throw httpError(400, 'The SVG contains scripts or is not an SVG', 'FILE_CONTENT');
    let thumbKey = null;
    if (thumb) {
      const thead = await readHead(thumb.path, 4);
      if (signatureMatches(thead, 'jpg')) thumbKey = thumb.storageKey;
      else await dropFiles([thumb]);
    }
    const takenAt = body.takenAt && !Number.isNaN(Date.parse(body.takenAt)) ? new Date(body.takenAt) : null;
    const num = (value, min, max) => {
      const n = parseNumber(value);
      return n === null || Number.isNaN(n) || n < min || n > max ? null : n;
    };
    const { rows } = await query(
      `INSERT INTO mp_media (project_id, node_id, kind, name, mime, size, storage_key, thumb_key, width, height, taken_at, lat, lng, created_by, series)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        project.id,
        node?.id || null,
        kind,
        name,
        text(file.mimetype, 120),
        file.size,
        file.storageKey,
        thumbKey,
        num(body.width, 1, 100000),
        num(body.height, 1, 100000),
        takenAt,
        num(body.lat, -90, 90),
        num(body.lng, -180, 180),
        ctx.userId,
        kind === 'plan' ? null : series,
      ]
    );
    return mediaShape(rows[0]);
  } catch (err) {
    await dropFiles([file, thumb]);
    throw err;
  }
}

/** Who may open a file: report files follow the report; files waiting for a report — their uploader. */
async function mediaAccess(ctx, row) {
  const caps = readCaps(ctx, row.project_id);
  if (!caps.size) return false;
  if (row.report_id) {
    const { rows } = await query(`SELECT status, author_id, visibility FROM mp_reports WHERE id = $1`, [row.report_id]);
    const report = rows[0];
    if (!report || !has(caps, 'build.view')) return false;
    if (report.status === 'published') return report.visibility !== 'internal' || has(caps, 'build.edit') || has(caps, 'build.drafts');
    return report.author_id === ctx.userId || has(caps, 'build.drafts') || has(caps, 'build.moderate');
  }
  if (row.series) return true;
  if (!row.node_id && row.kind !== 'plan') return row.created_by === ctx.userId || canConfigure(ctx, row.project_id);
  return true;
}

export async function sendMedia(ctx, id, res, { thumb = false, download = false } = {}) {
  const { rows } = await query(`SELECT * FROM mp_media WHERE id = $1`, [intOr(id, 0)]);
  const row = rows[0];
  if (!row || !(await mediaAccess(ctx, row))) throw notFound('File not found');
  const useThumb = thumb && row.thumb_key;
  const key = useThumb ? row.thumb_key : row.storage_key;
  const ext = useThumb ? 'jpg' : extOf(row.name);
  await sendBlob(res, pathOf(key), { name: row.name, ext, download });
}

export async function deleteMedia(ctx, id) {
  const { rows } = await query(`SELECT m.*, n.path FROM mp_media m LEFT JOIN mp_nodes n ON n.id = m.node_id WHERE m.id = $1`, [intOr(id, 0)]);
  const row = rows[0];
  if (!row || !(await mediaAccess(ctx, row))) throw notFound('File not found');
  // A photo of a journal report follows the report's rights (author window, moderators), not the uploader's.
  if (row.report_id) {
    const { deleteReportMedia } = await import('./construction.js');
    await deleteReportMedia(ctx, row.report_id, row.id);
    return;
  }
  const node = row.node_id ? { project_id: row.project_id, path: row.path } : null;
  const ok = row.created_by === ctx.userId || canConfigure(ctx, row.project_id) || (node && has(actCaps(ctx, node), 'media.edit')) || (row.series && has(actCaps(ctx, { project_id: row.project_id, path: [] }), 'media.edit'));
  if (!ok) throw forbidden();
  const { rows: used } = await query(`SELECT 1 FROM mp_plans WHERE media_id = $1 LIMIT 1`, [row.id]);
  if (used.length) throw httpError(409, 'The file is the background of a site plan', 'MEDIA_IN_USE');
  await query(`DELETE FROM mp_media WHERE id = $1`, [row.id]);
  await removeMediaFiles([row]);
}

/** Uploads waiting for a report for more than a day are removed (scheduler, with the daily checks). */
export async function purgeOrphans() {
  const { rows } = await query(`DELETE FROM mp_media WHERE report_id IS NULL AND node_id IS NULL AND series IS NULL AND kind IN ('photo', 'video') AND created_at < NOW() - INTERVAL '2 days' AND id NOT IN (SELECT media_id FROM mp_plans WHERE media_id IS NOT NULL) RETURNING storage_key, thumb_key`);
  await removeMediaFiles(rows);
  return rows.length;
}
