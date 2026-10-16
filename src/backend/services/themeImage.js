import { spawn } from 'child_process';
import { mkdir, readdir, rm, stat, unlink, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { uploadRoot } from '../config/paths.js';

/*
 * Background pictures of the custom theme (Account → Appearance → «Своя»).
 *
 * The upload is checked in Node before any decoder sees it: size (≤ 8 MB),
 * type by magic bytes (JPEG, PNG, WebP, GIF — never by name or MIME) and the
 * pixel size read from the header (≤ 4096 × 4096, so a decompression bomb is
 * refused without decoding). Pillow — already in the production image for
 * file-server thumbnails (py3-pillow, with WebP) — then re-encodes it:
 *
 *   <id>.webp     long side ≤ 2560 px, quality 82   (desktop)
 *   <id>-m.webp   long side ≤ 1280 px, quality 78   (phones)
 *   <id>-p.webp   32 px, blurred                    (placeholder while the picture loads)
 *
 * Re-encoding drops metadata (EXIF, GPS), applies the EXIF rotation and
 * flattens transparency. Files live in uploads/backgrounds/<userId>/ and are
 * served to their owner only (routes/experience.routes.js).
 */

export const BACKGROUND_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxSide: 4096,
  minSide: 200,
});

export const backgroundRoot = resolve(uploadRoot, 'backgrounds');
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'themeImage.py');
const PYTHON = process.env.IMAGE_PYTHON || process.env.SMBGATE_PYTHON || 'python3';
const VARIANTS = { full: '', mobile: '-m', placeholder: '-p' };
export const IMAGE_ID_RE = /^[a-f0-9]{24}$/;

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/** Image type by its first bytes; null for anything else. */
export function sniffImageType(buffer) {
  if (!buffer || buffer.length < 16) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'gif';
  return null;
}

/** Pixel size from the header of a JPEG, PNG, WebP or GIF; null when it cannot be read. */
export function imageDimensions(buffer, type = sniffImageType(buffer)) {
  try {
    if (type === 'png') {
      if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (type === 'gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    if (type === 'webp') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (type === 'jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        // Fill bytes, standalone markers.
        if (marker === 0xff) {
          offset += 1;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const length = buffer.readUInt16BE(offset + 2);
        const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isFrame) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        if (length < 2) return null;
        offset += 2 + length;
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Checks an uploaded background before it is decoded. Returns { type, width,
 * height } or throws a 400/413 with a code the page translates.
 */
export function validateBackground(buffer, limits = BACKGROUND_LIMITS) {
  if (!buffer?.length) throw httpError(400, 'The picture is empty', 'BG_EMPTY');
  if (buffer.length > limits.maxBytes) throw httpError(413, 'The picture is larger than 8 MB', 'BG_TOO_LARGE');
  const type = sniffImageType(buffer);
  if (!type) throw httpError(400, 'Only JPEG, PNG, WebP or GIF pictures can be used', 'BG_TYPE');
  const size = imageDimensions(buffer, type);
  if (!size || !size.width || !size.height) throw httpError(400, 'The picture cannot be read', 'BG_UNREADABLE');
  if (size.width > limits.maxSide || size.height > limits.maxSide) {
    throw httpError(400, `The picture is larger than ${limits.maxSide} × ${limits.maxSide} pixels`, 'BG_DIMENSIONS');
  }
  if (size.width < limits.minSide || size.height < limits.minSide) {
    throw httpError(400, `The picture is smaller than ${limits.minSide} × ${limits.minSide} pixels`, 'BG_TOO_SMALL');
  }
  return { type, ...size };
}

export const userBackgroundDir = (userId) => join(backgroundRoot, String(Number(userId)));

/** Absolute path of one variant of a person's picture, or null for a bad id / variant. */
export function backgroundFile(userId, imageId, variant = 'full') {
  if (!IMAGE_ID_RE.test(String(imageId || '')) || !(variant in VARIANTS) || !Number.isInteger(Number(userId))) return null;
  return join(userBackgroundDir(userId), `${imageId}${VARIANTS[variant]}.webp`);
}

/*
 * Fair use of the converter: one picture at a time per person, at most
 * `perHour` per person an hour, and at most `maxQueue` people waiting in
 * the shared queue (the rest are asked to try again in a minute).
 */
export const BACKGROUND_RATE = Object.freeze({ perHour: 10, maxQueue: 6, windowMs: 60 * 60 * 1000 });
const busyUsers = new Set();
const uploadsOf = new Map();

/** Takes a converter slot for `userId` or throws 429 / 503; returns the release function. */
export function admitBackground(userId, now = Date.now(), rate = BACKGROUND_RATE) {
  const key = Number(userId);
  if (busyUsers.has(key)) throw httpError(429, 'The previous picture is still being processed', 'BG_BUSY');
  const recent = (uploadsOf.get(key) || []).filter((at) => now - at < rate.windowMs);
  if (recent.length >= rate.perHour) throw httpError(429, 'Too many pictures in an hour, try again later', 'BG_RATE');
  if (busyUsers.size >= rate.maxQueue) throw httpError(503, 'Too many pictures are being processed, try again in a minute', 'BG_QUEUE_FULL');
  recent.push(now);
  uploadsOf.set(key, recent);
  if (uploadsOf.size > 1000) {
    for (const [id, list] of uploadsOf) if (!list.some((at) => now - at < rate.windowMs)) uploadsOf.delete(id);
  }
  busyUsers.add(key);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyUsers.delete(key);
  };
}

// One conversion at a time: a 4096² picture takes ~50 MB while it is decoded.
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

function runPillow(input, outDir, id) {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(PYTHON, [SCRIPT, input, outDir, id], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), 45000);
    proc.stdout.on('data', (chunk) => {
      out += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      err += chunk;
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return rejectRun(new Error(err.trim().split('\n').pop() || `image conversion failed (${code})`));
      try {
        resolveRun(JSON.parse(out.trim().split('\n').pop()));
      } catch {
        rejectRun(new Error('image conversion returned no result'));
      }
    });
  });
}

/**
 * Validates and converts an uploaded picture for `userId`. Returns
 * { id, width, height, luma, scheme } — `scheme` suggests light or dark
 * panels from the picture's brightness.
 */
export async function storeBackground(userId, buffer) {
  const meta = validateBackground(buffer);
  const release = admitBackground(userId);
  try {
    return await convertBackground(userId, buffer, meta);
  } finally {
    release();
  }
}

async function convertBackground(userId, buffer, meta) {
  const dir = userBackgroundDir(userId);
  await mkdir(dir, { recursive: true });
  const id = randomBytes(12).toString('hex');
  const input = join(dir, `.${id}.upload`);
  await writeFile(input, buffer, { mode: 0o600 });
  try {
    const result = await serial(() => runPillow(input, dir, id));
    return {
      id,
      width: result.width || meta.width,
      height: result.height || meta.height,
      luma: Number(result.luma) || 0.5,
      scheme: Number(result.luma) > 0.55 ? 'light' : 'dark',
    };
  } catch (err) {
    await removeBackground(userId, id);
    if (err.code === 'ENOENT') throw httpError(503, 'Image conversion is not available on this server', 'BG_NO_CONVERTER');
    throw httpError(400, 'The picture cannot be converted', 'BG_UNREADABLE');
  } finally {
    await unlink(input).catch(() => {});
  }
}

export async function removeBackground(userId, imageId) {
  if (!IMAGE_ID_RE.test(String(imageId || ''))) return;
  await Promise.all(Object.keys(VARIANTS).map((variant) => rm(backgroundFile(userId, imageId, variant), { force: true })));
}

const STRAY_UPLOAD_MS = 10 * 60 * 1000;

/**
 * Deletes every picture of the person except `keep` (ids). An upload being
 * converted right now (`.<id>.upload`, younger than 10 minutes) belongs to
 * another request and stays; older ones are leftovers and go.
 */
export async function pruneBackgrounds(userId, keep = [], now = Date.now()) {
  const dir = userBackgroundDir(userId);
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const kept = new Set(keep.filter(Boolean));
  await Promise.all(
    names
      .filter((name) => !kept.has(name.replace(/^\./, '').slice(0, 24)))
      .map(async (name) => {
        if (name.endsWith('.upload')) {
          const info = await stat(join(dir, name)).catch(() => null);
          if (!info || now - info.mtimeMs < STRAY_UPLOAD_MS) return;
        }
        await rm(join(dir, name), { force: true });
      })
  );
}

/** Removes a person's whole folder (account deleted). */
export async function dropUserBackgrounds(userId) {
  await rm(userBackgroundDir(userId), { recursive: true, force: true });
}
