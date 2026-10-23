import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_LIMITS } from './archive.js';
import { readZip } from './zip.js';
import { incomingDir } from './paths.js';

/*
 * «Пакеты на сервере» (docs/module-packages.md «Packages on the server»): zip
 * files the host operator copied into $MODULES_DIR/incoming/ (production:
 * ./data/modules/incoming on the host) for a superadministrator whose browser
 * cannot receive the file. «Установить» reads the file here and hands its bytes
 * to stagePackage() — exactly the path of an upload (same caps, signature, §5
 * checks, module card, install, restart).
 *
 * Listed (and accepted) only: plain regular files named *.zip directly in
 * incoming/ (no symbolic links, no folders, no hidden names, nothing in
 * sub-folders), at most PACKAGE_LIMITS.maxUploadBytes. incoming/ itself must be
 * a real folder, not a link. The name and version on the list are read from
 * manifest.json without checking the signature — for display only; the full
 * check runs at «Установить».
 *
 * After a successful install the file is MOVED to incoming/installed/<name>
 * (replacing an older file of that name there): the list shows only what is
 * still to be installed, and the operator keeps the exact file that went in
 * (delete it by hand when no longer needed). It is moved only when its bytes
 * are still the ones that were checked (sha256).
 */

export const INSTALLED_FOLDER = 'installed';
const NAME = /^[^./\\\u0000-\u001f\u007f][^/\\\u0000-\u001f\u007f]{0,199}$/;

export class IncomingError extends Error {
  constructor(status, code, ru, en) {
    super(en);
    this.statusCode = status;
    this.code = code;
    this.problems = [{ code, params: {}, message: { ru, en } }];
  }
}

const notFound = () => new IncomingError(404, 'INCOMING_NOT_FOUND', 'Файл не найден в папке incoming на сервере — обновите список', 'The file is not in the incoming folder on the server — refresh the list');
const tooLarge = () => new IncomingError(413, 'FILE_TOO_LARGE', `Файл больше ${PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024} МБ`, `The file is larger than ${PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024} MB`);

/** True when `name` may be an incoming package's name (no path, no hidden file, ends with .zip). */
export const incomingName = (name) => typeof name === 'string' && NAME.test(name) && /\.zip$/i.test(name);

/** incoming/ when it is a real folder (not a link), else null. */
function folder() {
  const dir = incomingDir();
  try {
    return lstatSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

/** lstat of incoming/<name> when it is a plain regular file within the cap, else null. */
function entryStat(dir, name) {
  if (!incomingName(name)) return null;
  try {
    const stat = lstatSync(join(dir, name));
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

// name → { size, mtimeMs, info }: the manifest peek is not repeated for an unchanged file.
const peekCache = new Map();

/** { id, name, version } from manifest.json of a zip buffer, or null (display only — not verified). */
function peek(buffer) {
  try {
    const [file] = readZip(buffer, { ...PACKAGE_LIMITS, only: (entry) => entry === 'manifest.json' });
    const raw = file ? JSON.parse(file.data.toString('utf8')) : null;
    if (!raw || typeof raw !== 'object') return null;
    return { id: typeof raw.id === 'string' ? raw.id.slice(0, 64) : null, name: raw.name && typeof raw.name === 'object' ? raw.name : typeof raw.name === 'string' ? raw.name.slice(0, 200) : null, version: typeof raw.version === 'string' ? raw.version.slice(0, 32) : null };
  } catch {
    return null;
  }
}

/**
 * The packages waiting in incoming/: [{ file, bytes, modifiedAt, id, name, version }],
 * newest first. Links, folders, other names and files above the cap are left out.
 */
export function listIncoming() {
  const dir = folder();
  if (!dir) return [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const stat = entryStat(dir, name);
    if (!stat || stat.size > PACKAGE_LIMITS.maxUploadBytes || stat.size === 0) continue;
    let cached = peekCache.get(name);
    if (!cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
      let info = null;
      try {
        info = peek(readIncoming(name).buffer);
      } catch {
        continue; // changed or gone while listing
      }
      cached = { size: stat.size, mtimeMs: stat.mtimeMs, info };
      peekCache.set(name, cached);
    }
    out.push({ file: name, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString(), id: cached.info?.id || null, name: cached.info?.name || null, version: cached.info?.version || null });
  }
  for (const name of peekCache.keys()) if (!names.includes(name)) peekCache.delete(name);
  return out.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : a.file.localeCompare(b.file)));
}

/**
 * The bytes of incoming/<name>: { buffer, sha256 }. The file is opened without
 * following links (O_NOFOLLOW) and checked again on the open descriptor (a
 * regular file within the cap), so a swap after the listing does not get past.
 */
export function readIncoming(name) {
  const dir = folder();
  if (!dir || !entryStat(dir, name)) throw notFound();
  let fd;
  try {
    fd = openSync(join(dir, name), constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  } catch {
    throw notFound();
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw notFound();
    if (stat.size > PACKAGE_LIMITS.maxUploadBytes) throw tooLarge();
    // One byte more than the cap: a file that grew since fstat is refused, not cut.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, PACKAGE_LIMITS.maxUploadBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (!read) break;
      length += read;
    }
    if (length > PACKAGE_LIMITS.maxUploadBytes) throw tooLarge();
    const data = buffer.subarray(0, length);
    return { buffer: data, sha256: createHash('sha256').update(data).digest('hex') };
  } finally {
    closeSync(fd);
  }
}

/**
 * After a successful install: incoming/<name> → incoming/installed/<name>, when
 * it still holds the installed bytes (`sha256`). Returns the new path or null;
 * never throws (the module is installed either way).
 */
export function archiveIncoming(name, sha256) {
  try {
    const dir = folder();
    if (!dir) return null;
    const { sha256: now } = readIncoming(name);
    if (now !== sha256) return null;
    const target = join(dir, INSTALLED_FOLDER);
    mkdirSync(target, { recursive: true, mode: 0o755 });
    if (!lstatSync(target).isDirectory()) return null; // a link named «installed»: leave the file where it is
    const path = join(target, name);
    renameSync(join(dir, name), path);
    peekCache.delete(name);
    return path;
  } catch (err) {
    console.warn(`Module packages: incoming/${name} not moved to ${INSTALLED_FOLDER}/: ${err.message}`);
    return null;
  }
}
