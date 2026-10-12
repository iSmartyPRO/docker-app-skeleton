import { mkdir, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { extname, resolve } from 'path';
import multer from 'multer';
import { query } from '../../config/database.js';
import { uploadRoot } from '../../config/paths.js';
import { httpError } from '../shared/acl.js';
import { FILE_CSP, contentDisposition, hasSignature, readHead, signatureMatches } from '../shared/storage.js';
import { originalName } from '../kb/files.js';

/*
 * Chat uploads live in UPLOAD_DIR/chat/<year>/<month>/<random>.<ext>. They
 * are served only through the API after a room access check; anything that
 * is not a picture, PDF or media file goes out as a download.
 */

const ROOT = resolve(uploadRoot, 'chat');

export const filePath = (key) => resolve(ROOT, key);

async function newKey(ext) {
  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await mkdir(resolve(ROOT, dir), { recursive: true });
  return `${dir}/${randomBytes(16).toString('hex')}${ext ? `.${ext}` : ''}`;
}

const extOf = (name) => extname(String(name || '')).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);

export function chatUploader(maxMb) {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newKey(extOf(originalName(file)));
          cb(null, filePath(file.storageKey).replace(/[^/\\]+$/, ''));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 10 },
  }).array('files', 10);
}

export function runUpload(upload, req, res) {
  return new Promise((done, fail) => {
    upload(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') fail(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err?.code === 'LIMIT_FILE_COUNT') fail(httpError(400, 'Up to 10 files at once', 'TOO_MANY_FILES'));
      else if (err) fail(err);
      else done(req.files || []);
    });
  });
}

/**
 * Formats a browser may show inline, by extension, with the content types the
 * uploader's browser may report for them. The stored mime is whatever the
 * client sent, so a file opens inline only when its name and its type agree
 * (and, for pictures and PDFs, its bytes); everything else downloads.
 */
const INLINE = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  bmp: ['image/bmp', 'image/x-ms-bmp'],
  pdf: ['application/pdf'],
  mp4: ['video/mp4', 'audio/mp4'],
  webm: ['video/webm', 'audio/webm'],
  mp3: ['audio/mpeg', 'audio/mp3'],
  ogg: ['audio/ogg', 'video/ogg'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
};

/** The content type to show the file inline with, or null (download). Pure: no file access. */
export function inlineType(name, mime) {
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  const allowed = INLINE[extOf(name)];
  return allowed && allowed.includes(type) ? type : null;
}

export function fileShape(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    url: `/api/app/chat/files/${row.id}`,
    image: /^image\//.test(inlineType(row.name, row.mime) || ''),
  };
}

export async function sendFile(res, row, download) {
  const path = filePath(row.storage_key);
  let type = download ? null : inlineType(row.name, row.mime);
  if (type && hasSignature(extOf(row.name))) {
    const head = await readHead(path).catch(() => null);
    if (!head) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
    if (!signatureMatches(head, extOf(row.name))) type = null;
  }
  res.setHeader('Content-Type', type || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(row.name, Boolean(type)));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', FILE_CSP);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path);
}

export async function removeStored(key) {
  await unlink(filePath(key)).catch(() => {});
}

export async function purgeOrphanFiles() {
  const { rows } = await query(`DELETE FROM chat_files WHERE message_id IS NULL AND created_at < NOW() - INTERVAL '1 day' RETURNING storage_key`);
  for (const row of rows) await removeStored(row.storage_key);
}
