import { mkdir, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { extname, resolve } from 'path';
import multer from 'multer';
import { query } from '../../config/database.js';
import { uploadRoot } from '../../config/paths.js';
import { httpError } from '../shared/acl.js';
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

/** Content types a browser may show inline; everything else downloads. */
const INLINE = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm|mp4))$/;

export function fileShape(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    url: `/api/app/chat/files/${row.id}`,
    image: /^image\/(png|jpe?g|gif|webp|bmp)$/.test(row.mime || ''),
  };
}

export function sendFile(res, row, download) {
  const inline = !download && INLINE.test(row.mime || '');
  res.setHeader('Content-Type', inline ? row.mime : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.attachment(row.name);
  if (inline) res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  res.sendFile(filePath(row.storage_key));
}

export async function removeStored(key) {
  await unlink(filePath(key)).catch(() => {});
}

export async function purgeOrphanFiles() {
  const { rows } = await query(`DELETE FROM chat_files WHERE message_id IS NULL AND created_at < NOW() - INTERVAL '1 day' RETURNING storage_key`);
  for (const row of rows) await removeStored(row.storage_key);
}
