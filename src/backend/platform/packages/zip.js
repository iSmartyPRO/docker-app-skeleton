import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/*
 * A small ZIP reader and writer for module packages (docs/module-packages.md).
 * No dependencies: node:zlib does the deflate work.
 *
 * Supported: "stored" (0) and "deflate" (8) entries, one disk, no encryption.
 * Rejected on read (every one of them is a reason to distrust a package):
 *   - ZIP64 archives and entries, multi-disk archives, encrypted entries;
 *   - symbolic links (Unix mode in the external attributes);
 *   - unsafe names: absolute paths, drive letters, backslashes, `..` / `.`
 *     segments, empty segments, control characters (zip-slip);
 *   - duplicate names (also when they differ only in letter case, or as a
 *     file and a folder of the same name);
 *   - more entries than `maxFiles`, a declared or real size above the limits
 *     (zip bombs: inflation stops at the declared size), CRC mismatches,
 *     local headers that disagree with the central directory.
 */

export class ZipError extends Error {
  constructor(message, code = 'ZIP_INVALID') {
    super(message);
    this.code = code;
  }
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;

export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 5000,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxNameLength: 400,
});

/** A safe relative path inside an archive, or a ZipError. Folder entries end with '/'. */
export function checkEntryName(name, maxNameLength = DEFAULT_LIMITS.maxNameLength) {
  if (typeof name !== 'string' || !name) throw new ZipError('empty entry name');
  if (name.length > maxNameLength) throw new ZipError(`entry name too long: ${name.slice(0, 60)}…`);
  // Control characters (NUL included) and Windows separators.
  if (/[\u0000-\u001f\u007f\\]/.test(name)) throw new ZipError(`unsafe entry name: ${JSON.stringify(name)}`);
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw new ZipError(`absolute entry name: ${name}`);
  const body = name.endsWith('/') ? name.slice(0, -1) : name;
  if (!body) throw new ZipError('empty entry name');
  for (const part of body.split('/')) {
    if (!part || part === '.' || part === '..') throw new ZipError(`unsafe entry name: ${name}`);
  }
  return name;
}

function findEocd(buf) {
  // The EOCD record is 22 bytes plus a comment of up to 65535 bytes.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * Reads a whole archive held in memory. Returns [{ name, data }] for files
 * (folder entries are checked and left out), in archive order.
 * `limits.only(name)` → false skips inflating that file (it is left out).
 */
export function readZip(buffer, limits = {}) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new ZipError('not a zip archive');
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new ZipError('not a zip archive');
  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === SIG_EOCD64_LOCATOR) throw new ZipError('ZIP64 archives are not supported', 'ZIP64');
  const disk = buffer.readUInt16LE(eocd + 4);
  const cdDisk = buffer.readUInt16LE(eocd + 6);
  const countDisk = buffer.readUInt16LE(eocd + 8);
  const count = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported', 'ZIP64');
  if (disk !== 0 || cdDisk !== 0 || countDisk !== count) throw new ZipError('multi-disk archives are not supported');
  if (count > lim.maxFiles) throw new ZipError(`too many entries (${count} > ${lim.maxFiles})`, 'ZIP_TOO_MANY');
  if (cdOffset + cdSize > eocd) throw new ZipError('central directory out of bounds');

  const seen = new Map();
  const out = [];
  let total = 0;
  let pos = cdOffset;
  for (let index = 0; index < count; index += 1) {
    if (pos + 46 > eocd || buffer.readUInt32LE(pos) !== SIG_CENTRAL) throw new ZipError('broken central directory');
    const madeBy = buffer.readUInt16LE(pos + 4);
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compSize = buffer.readUInt32LE(pos + 20);
    const size = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const diskStart = buffer.readUInt16LE(pos + 34);
    const external = buffer.readUInt32LE(pos + 38);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    const extra = buffer.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
    pos += 46 + nameLen + extraLen + commentLen;
    if (pos > eocd) throw new ZipError('broken central directory');

    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff || diskStart === 0xffff) throw new ZipError('ZIP64 entries are not supported', 'ZIP64');
    for (let at = 0; at + 4 <= extra.length; ) {
      const tag = extra.readUInt16LE(at);
      const len = extra.readUInt16LE(at + 2);
      if (tag === 0x0001) throw new ZipError('ZIP64 entries are not supported', 'ZIP64');
      at += 4 + len;
    }
    if (flags & 0x1) throw new ZipError(`encrypted entry: ${name}`);
    checkEntryName(name, lim.maxNameLength);
    const unixMode = madeBy >> 8 === 3 ? external >>> 16 : 0;
    const type = unixMode & 0o170000;
    if (type === 0o120000) throw new ZipError(`symbolic link in archive: ${name}`, 'ZIP_SYMLINK');
    if (type && type !== 0o100000 && type !== 0o040000) throw new ZipError(`special file in archive: ${name}`, 'ZIP_SYMLINK');
    const isDir = name.endsWith('/');
    const key = (isDir ? name.slice(0, -1) : name).toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined && !(previous === 'dir' && isDir)) throw new ZipError(`duplicate entry: ${name}`, 'ZIP_DUPLICATE');
    seen.set(key, isDir ? 'dir' : 'file');
    if (isDir) {
      if (size !== 0) throw new ZipError(`folder entry with data: ${name}`);
      continue;
    }
    if (method !== 0 && method !== 8) throw new ZipError(`unsupported compression method ${method}: ${name}`);
    if (size > lim.maxEntryBytes) throw new ZipError(`entry too large: ${name}`, 'ZIP_TOO_LARGE');
    total += size;
    if (total > lim.maxTotalBytes) throw new ZipError('archive too large when unpacked', 'ZIP_TOO_LARGE');
    // `only(name)`: inflate just these files (a peek at manifest.json); the rest is checked in the directory only.
    if (lim.only && !lim.only(name)) continue;

    if (localOffset + 30 > cdOffset || buffer.readUInt32LE(localOffset) !== SIG_LOCAL) throw new ZipError(`broken local header: ${name}`);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.toString('utf8', localOffset + 30, localOffset + 30 + localNameLen);
    if (localName !== name) throw new ZipError(`local header does not match the directory: ${name}`);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    if (start + compSize > cdOffset) throw new ZipError(`entry data out of bounds: ${name}`);
    const raw = buffer.subarray(start, start + compSize);
    let data;
    if (method === 0) {
      if (compSize !== size) throw new ZipError(`size mismatch: ${name}`);
      data = Buffer.from(raw);
    } else {
      try {
        data = size === 0 ? Buffer.alloc(0) : inflateRawSync(raw, { maxOutputLength: size });
      } catch (err) {
        throw new ZipError(`cannot inflate ${name}: ${err.code === 'ERR_BUFFER_TOO_LARGE' ? 'larger than declared' : err.message}`);
      }
    }
    if (data.length !== size) throw new ZipError(`size mismatch: ${name}`);
    if (crc32(data) >>> 0 !== crc) throw new ZipError(`CRC mismatch: ${name}`);
    out.push({ name, data });
  }
  // A file "a" and a folder "a/" (or "a/b"): a file cannot also be a folder.
  for (const { name } of out) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      if (seen.get(parts.slice(0, i).join('/').toLowerCase()) === 'file') throw new ZipError(`duplicate entry: ${name}`, 'ZIP_DUPLICATE');
    }
  }
  return out;
}

// 1980-01-01 00:00 in DOS format: reproducible archives (the same files give the same bytes).
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/**
 * Writes [{ name, data }] into a ZIP buffer. Entries keep the given order;
 * `deflate: false` stores everything. Files only (folders are implied).
 */
export function writeZip(entries, { deflate = true } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const names = new Set();
  for (const entry of entries) {
    const name = checkEntryName(entry.name);
    if (name.endsWith('/')) throw new ZipError(`folder entries are not written: ${name}`);
    if (names.has(name.toLowerCase())) throw new ZipError(`duplicate entry: ${name}`, 'ZIP_DUPLICATE');
    names.add(name.toLowerCase());
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    if (data.length >= 0xffffffff) throw new ZipError(`entry too large: ${name}`, 'ZIP_TOO_LARGE');
    const crc = crc32(data) >>> 0;
    let method = 0;
    let body = data;
    if (deflate && data.length > 0) {
      const packed = deflateRawSync(data, { level: 9 });
      if (packed.length < data.length) {
        method = 8;
        body = packed;
      }
    }
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
    if (offset >= 0xffffffff) throw new ZipError('archive too large', 'ZIP_TOO_LARGE');
  }
  if (names.size > 0xfffe) throw new ZipError('too many entries', 'ZIP_TOO_MANY');
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(names.size, 8);
  eocd.writeUInt16LE(names.size, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
