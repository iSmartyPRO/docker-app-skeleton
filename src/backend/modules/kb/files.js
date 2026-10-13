import { createReadStream } from 'fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { basename, extname, join } from 'path';
import multer from 'multer';
import { uploadRoot } from '../../config/paths.js';
import { KB_FILE_GROUPS } from '../catalog.js';
import { convertToPdf } from '../../services/integrations.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError } from './access.js';
import { FILE_CSP, readHead, touchPreview } from '../shared/storage.js';

/*
 * Files live outside the public /uploads tree (uploads/kb/…) and are only
 * served through access-checked routes with defensive headers.
 */

export const kbDir = join(uploadRoot, 'kb');
const cacheDir = join(kbDir, '.previews');

const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  heic: 'image/heic',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};

/** Formats the browser may display inline (everything else is a download). */
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'txt', 'md', 'json', 'xml', 'log', 'csv', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a']);

/** Office formats that become a PDF preview through the conversion service. */
export const CONVERTIBLE = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'odt', 'ods', 'odp', 'rtf']);

function extOf(name) {
  return extname(String(name || '')).slice(1).toLowerCase();
}

export async function kbSettings() {
  const parsed = parseSettings(await getSettings());
  return { module: parsed.modules.kb.settings, conversion: parsed.integrations.documents };
}

export async function removeStoredFile(name) {
  if (!name) return;
  await unlink(join(kbDir, basename(name))).catch(() => {});
}

/** Multer configured from the live module settings (size cap, allowed types). */
export async function uploader() {
  const { module } = await kbSettings();
  const allowed = new Set(module.fileGroups.flatMap((group) => KB_FILE_GROUPS[group] || []));
  await mkdir(kbDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, kbDir),
      filename: (_req, file, cb) => {
        const ext = extOf(file.originalname);
        cb(null, `${Date.now().toString(36)}-${randomBytes(12).toString('hex')}${ext ? `.${ext}` : ''}`);
      },
    }),
    limits: { fileSize: module.maxUploadMb * 1024 * 1024, files: 50 },
    fileFilter: (_req, file, cb) => {
      const ext = extOf(file.originalname);
      if (!allowed.has(ext)) {
        const error = httpError(400, `Files of type .${ext || '?'} are not allowed`, 'FILE_TYPE');
        cb(error);
        return;
      }
      cb(null, true);
    },
  }).array('files', 50);
}

/** Browsers send UTF-8 names as latin1 in multipart; restore the real name. */
export function originalName(file) {
  const raw = String(file.originalname || 'file');
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    return decoded.includes('�') ? raw : decoded;
  } catch {
    return raw;
  }
}

const SIGNATURES = {
  pdf: (head) => head.subarray(0, 5).toString() === '%PDF-',
  png: (head) => head[0] === 0x89 && head.subarray(1, 4).toString() === 'PNG',
  jpg: (head) => head[0] === 0xff && head[1] === 0xd8,
  gif: (head) => head.subarray(0, 3).toString() === 'GIF',
  webp: (head) => head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP',
};
SIGNATURES.jpeg = SIGNATURES.jpg;

/** Rejects files whose content does not match a format we render inline. */
export async function verifyContent(path, ext) {
  const check = SIGNATURES[ext];
  if (!check) return;
  const head = await readHead(path);
  if (!check(head)) {
    await unlink(path).catch(() => {});
    throw httpError(400, `The file content is not a valid .${ext}`, 'FILE_CONTENT');
  }
}

/** Streams a stored file with headers that keep it from executing as a page. */
export async function sendStoredFile(req, res, row, { download = false } = {}) {
  const path = join(kbDir, basename(row.file_name));
  const info = await stat(path).catch(() => null);
  if (!info) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  const ext = row.file_ext || extOf(row.file_name);
  const inline = !download && INLINE.has(ext);
  const filename = row.file_original || `file.${ext}`;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', FILE_CSP);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(path, { acceptRanges: true, lastModified: true, headers: {} });
}

const inflight = new Map();

/**
 * PDF preview of an office document, converted once and cached until the file
 * changes. Concurrent requests for the same file share one conversion.
 */
export async function previewPdf(row) {
  const ext = row.file_ext || extOf(row.file_name);
  if (!CONVERTIBLE.has(ext)) throw httpError(400, 'No PDF preview for this file type', 'NO_PREVIEW');
  const { conversion } = await kbSettings();
  if (!conversion?.enabled || !conversion?.serverUrl) {
    throw httpError(409, 'Document conversion is not configured', 'NO_CONVERTER');
  }
  const version = new Date(row.updated_at).getTime();
  const target = join(cacheDir, `${row.id}-${version}.pdf`);
  const info = await stat(target).catch(() => null);
  if (info) {
    touchPreview(target, info);
    return target;
  }

  if (!inflight.has(target)) {
    const job = (async () => {
      await mkdir(cacheDir, { recursive: true });
      const buffer = await readFile(join(kbDir, basename(row.file_name)));
      const pdf = await convertToPdf({
        buffer,
        filename: row.file_original || `document.${ext}`,
        serverUrl: conversion.serverUrl,
      });
      const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
      await writeFile(temp, pdf);
      await rename(temp, target);
      return target;
    })().finally(() => inflight.delete(target));
    inflight.set(target, job);
  }
  return inflight.get(target);
}

export function sendPreview(res, path, title) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${title || 'preview'}.pdf`)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  createReadStream(path).pipe(res);
}

export function fileExt(name) {
  return extOf(name);
}
