import { createReadStream } from 'fs';
import { mkdir, open, readFile, readdir, rename, stat, unlink, utimes, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { extname, join, normalize, resolve, sep } from 'path';
import { uploadRoot } from '../../config/paths.js';
import { convertToPdf } from '../../services/integrations.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError } from './acl.js';

/*
 * File storage shared by Files and the Knowledge Base.
 *
 * Blobs live under UPLOAD_DIR (never the public /uploads tree) and are
 * addressed by a storage key relative to it, e.g. "files/2026/10/<random>.pdf".
 * They are served only through access-checked routes with defensive headers.
 */

export const MIME = {
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
export const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'txt', 'md', 'json', 'xml', 'log', 'csv', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a']);

/** Office formats that become a PDF preview through the conversion service. */
export const CONVERTIBLE = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'odt', 'ods', 'odp', 'rtf']);

export function extOf(name) {
  return extname(String(name || '')).slice(1).toLowerCase().slice(0, 12);
}

export function mimeOf(ext) {
  return MIME[ext] || 'application/octet-stream';
}

/** Absolute path of a storage key; refuses keys that escape UPLOAD_DIR. */
export function storagePath(key) {
  const clean = normalize(String(key || '')).replace(/^([/\\])+/, '');
  const full = resolve(uploadRoot, clean);
  if (!clean || clean === '.' || !full.startsWith(`${resolve(uploadRoot)}${sep}`)) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  return join(uploadRoot, clean);
}

/** New random storage key inside a dated folder: files/2026/10/<random>.ext */
export async function newStorageKey(ext, prefix = 'files') {
  const now = new Date();
  const dir = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(uploadRoot, dir), { recursive: true });
  return `${dir}/${Date.now().toString(36)}-${randomBytes(12).toString('hex')}${ext ? `.${ext}` : ''}`;
}

export async function removeBlob(key) {
  if (!key) return;
  try {
    await unlink(storagePath(key));
  } catch {
    /* already gone */
  }
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

/** The first `bytes` bytes of a file (fewer when it is shorter); never reads the whole file. */
export async function readHead(path, bytes = 16) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Formats whose content we check by their magic bytes. */
export const hasSignature = (ext) => Boolean(SIGNATURES[ext]);

/** True when `head` starts like a .ext file; formats without a signature always pass. */
export function signatureMatches(head, ext) {
  const check = SIGNATURES[ext];
  return !check || (head.length >= 4 && check(head));
}

/** Rejects files whose content does not match a format we render inline. */
export async function verifyContent(path, ext) {
  if (!SIGNATURES[ext]) return;
  const head = await readHead(path);
  if (!signatureMatches(head, ext)) {
    await unlink(path).catch(() => {});
    throw httpError(400, `The file content is not a valid .${ext}`, 'FILE_CONTENT');
  }
}

/** CSP for user files opened directly: nothing runs, nothing submits, framed only by the portal. */
export const FILE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'self'; sandbox";

/** `inline` or `attachment` with an ASCII fallback name and the real UTF-8 one (RFC 6266). */
export function contentDisposition(name, inline = false) {
  const filename = String(name || 'file').replace(/[\r\n]/g, ' ');
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Streams a blob with headers that keep it from executing as a page. */
export async function sendBlob(res, path, { name, ext, download = false }) {
  const info = await stat(path).catch(() => null);
  if (!info) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  // A picture or PDF opens in the browser only when its bytes really are one.
  const inline = !download && INLINE.has(ext) && (!hasSignature(ext) || signatureMatches(await readHead(path).catch(() => Buffer.alloc(0)), ext));
  res.setHeader('Content-Type', mimeOf(ext));
  res.setHeader('Content-Disposition', contentDisposition(name || `file.${ext}`, inline));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', FILE_CSP);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(path, { acceptRanges: true, lastModified: true, headers: {} });
}

export const previewDir = () => join(uploadRoot, '.previews');
const inflight = new Map();

// ── Preview caches ──────────────────────────────────────────────────────────
// Converted PDFs, drive thumbnails and drawings are kept until nobody has
// used them for PREVIEW_MAX_DAYS: a cache hit refreshes the file's time (at
// most daily) and a scheduled job removes what is older. A removed preview is
// simply made again the next time someone opens the file.

export const PREVIEW_MAX_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Every folder that holds derived files only. */
export const previewCacheDirs = () => [previewDir(), join(uploadRoot, 'kb', '.previews')];

/** Marks a cached preview as used (at most once a day per file). */
export function touchPreview(path, info) {
  if (info && Date.now() - info.mtimeMs < DAY_MS) return;
  const now = new Date();
  utimes(path, now, now).catch(() => {});
}

/**
 * Removes cached previews untouched for `maxDays`, and leftovers of
 * interrupted jobs (*.tmp, job-*) older than a day. Returns the count.
 */
export async function prunePreviewCaches({ dirs = previewCacheDirs(), maxDays = PREVIEW_MAX_DAYS, now = Date.now() } = {}) {
  let removed = 0;
  const walk = async (dir, depth) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Folders stay: a job may be about to write into one.
        if (depth < 3) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      const age = now - Math.max(info.mtimeMs, info.atimeMs || 0);
      const leftover = entry.name.endsWith('.tmp') || entry.name.startsWith('job-');
      if (age > (leftover ? DAY_MS : maxDays * DAY_MS)) {
        await unlink(full).then(() => (removed += 1)).catch(() => {});
      }
    }
  };
  for (const dir of dirs) await walk(dir, 0);
  return removed;
}

/**
 * PDF preview of an office document, converted once and cached until the file
 * changes (`version`). Concurrent requests for the same file share one job.
 * The source is a local `path`, or `load()` returning a Buffer (remote files).
 * `verify()`, when given, runs whenever this request does not read the source
 * itself (a cached PDF, or another request's job): remote callers check the
 * person's read access there.
 */
export async function officePreview({ cacheKey, version, path, load, name, ext, verify }) {
  if (!CONVERTIBLE.has(ext)) throw httpError(400, 'No PDF preview for this file type', 'NO_PREVIEW');
  const conversion = parseSettings(await getSettings()).integrations.documents;
  if (!conversion?.enabled || !conversion?.serverUrl) {
    throw httpError(409, 'Document conversion is not configured', 'NO_CONVERTER');
  }
  const target = join(previewDir(), `${cacheKey}-${new Date(version).getTime()}.pdf`);
  const info = await stat(target).catch(() => null);
  if (info) {
    if (verify) await verify();
    touchPreview(target, info);
    return target;
  }
  if (inflight.has(target)) {
    if (verify) await verify();
  } else {
    const job = (async () => {
      await mkdir(previewDir(), { recursive: true });
      const pdf = await convertToPdf({ buffer: load ? await load() : await readFile(path), filename: name || `document.${ext}`, serverUrl: conversion.serverUrl });
      const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
      await writeFile(temp, pdf);
      await rename(temp, target);
      return target;
    })().finally(() => inflight.delete(target));
    inflight.set(target, job);
  }
  return inflight.get(target);
}

export function sendPdf(res, path, title) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${title || 'preview'}.pdf`)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  createReadStream(path).pipe(res);
}
