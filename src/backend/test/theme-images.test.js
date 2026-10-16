import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/*
 * Custom-theme backgrounds: type by magic bytes, pixel size from headers,
 * the 8 MB / 4096² / 200² limits, and — when Pillow is available (production
 * image; locally IMAGE_PYTHON=/path/to/python-with-pillow) — the real WebP
 * conversion with its phone version and placeholder.
 */

const uploads = mkdtempSync(join(tmpdir(), 'theme-img-'));
process.env.UPLOAD_DIR = uploads;
const images = await import('../services/themeImage.js');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** A real RGB PNG (gradient), small enough to build in memory. */
function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = (x * 255) / width;
      row[2 + x * 3] = (y * 255) / height;
      row[3 + x * 3] = 200;
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
/** PNG header only (enough for the checks that run before decoding). */
function pngHeader(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), Buffer.alloc(16)]);
}
function jpegHeader(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc2, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(32)]);
}
function webp(kind, width, height) {
  const head = Buffer.alloc(40);
  head.write('RIFF', 0, 'ascii');
  head.write('WEBP', 8, 'ascii');
  head.write(kind, 12, 'ascii');
  if (kind === 'VP8X') {
    head.writeUIntLE(width - 1, 24, 3);
    head.writeUIntLE(height - 1, 27, 3);
  } else if (kind === 'VP8L') {
    head[20] = 0x2f;
    head.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 21);
  } else {
    head.writeUInt16LE(width, 26);
    head.writeUInt16LE(height, 28);
  }
  return head;
}
function gif(width, height) {
  const head = Buffer.alloc(20);
  head.write('GIF89a', 0, 'ascii');
  head.writeUInt16LE(width, 6);
  head.writeUInt16LE(height, 8);
  return head;
}

test('type by magic bytes, never by name', () => {
  assert.equal(images.sniffImageType(pngHeader(10, 10)), 'png');
  assert.equal(images.sniffImageType(jpegHeader(10, 10)), 'jpeg');
  assert.equal(images.sniffImageType(webp('VP8 ', 10, 10)), 'webp');
  assert.equal(images.sniffImageType(gif(10, 10)), 'gif');
  assert.equal(images.sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(images.sniffImageType(Buffer.from('%PDF-1.7 aaaaaaaaaaaaaa')), null);
  assert.equal(images.sniffImageType(Buffer.alloc(4)), null);
});

test('pixel size from headers of every accepted type', () => {
  assert.deepEqual(images.imageDimensions(pngHeader(1920, 1080)), { width: 1920, height: 1080 });
  assert.deepEqual(images.imageDimensions(jpegHeader(4000, 3000)), { width: 4000, height: 3000 });
  assert.deepEqual(images.imageDimensions(webp('VP8X', 2560, 1440)), { width: 2560, height: 1440 });
  assert.deepEqual(images.imageDimensions(webp('VP8L', 800, 600)), { width: 800, height: 600 });
  assert.deepEqual(images.imageDimensions(webp('VP8 ', 1024, 768)), { width: 1024, height: 768 });
  assert.deepEqual(images.imageDimensions(gif(640, 480)), { width: 640, height: 480 });
  assert.equal(images.imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'jpeg'), null);
});

test('limits: 8 MB, 4096 × 4096, at least 200 × 200, known types only', () => {
  const code = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (err) {
      return err.code;
    }
  };
  assert.equal(images.BACKGROUND_LIMITS.maxBytes, 8 * 1024 * 1024);
  assert.equal(code(() => images.validateBackground(pngHeader(4096, 4096))), 'ok');
  assert.equal(code(() => images.validateBackground(pngHeader(4097, 1000))), 'BG_DIMENSIONS');
  assert.equal(code(() => images.validateBackground(jpegHeader(1000, 5000))), 'BG_DIMENSIONS');
  // A decompression bomb: tiny file, huge declared size — refused before decoding.
  assert.equal(code(() => images.validateBackground(pngHeader(60000, 60000))), 'BG_DIMENSIONS');
  assert.equal(code(() => images.validateBackground(pngHeader(150, 900))), 'BG_TOO_SMALL');
  assert.equal(code(() => images.validateBackground(Buffer.from('GIF87a'.padEnd(20, '\0')))), 'BG_UNREADABLE');
  assert.equal(code(() => images.validateBackground(Buffer.from('hello world, not an image'))), 'BG_TYPE');
  assert.equal(code(() => images.validateBackground(Buffer.alloc(0))), 'BG_EMPTY');
  const big = Buffer.concat([pngHeader(1000, 1000), Buffer.alloc(8 * 1024 * 1024)]);
  assert.equal(code(() => images.validateBackground(big)), 'BG_TOO_LARGE');
});

test('file paths stay inside the person’s folder', () => {
  assert.equal(images.backgroundFile(7, '../../../etc/passwd'), null);
  assert.equal(images.backgroundFile(7, 'a'.repeat(24), 'secret'), null);
  assert.equal(images.backgroundFile('7/../8', 'a'.repeat(24)), null);
  assert.equal(images.backgroundFile(7, 'a'.repeat(24), 'mobile'), join(uploads, 'backgrounds', '7', `${'a'.repeat(24)}-m.webp`));
});

const python = process.env.IMAGE_PYTHON || 'python3';
const hasPillow = spawnSync(python, ['-c', 'import PIL.features as f; assert f.check("webp")'], { stdio: 'ignore' }).status === 0;

test('Pillow converts to WebP with a phone version and a placeholder', { skip: hasPillow ? false : 'Pillow with WebP not available (set IMAGE_PYTHON)' }, async () => {
  const result = await images.storeBackground(42, png(1600, 900));
  assert.match(result.id, /^[a-f0-9]{24}$/);
  assert.equal(result.width, 1600);
  assert.ok(['light', 'dark'].includes(result.scheme));
  for (const variant of ['full', 'mobile', 'placeholder']) {
    const file = images.backgroundFile(42, result.id, variant);
    assert.ok(existsSync(file), variant);
    const data = readFileSync(file);
    assert.equal(images.sniffImageType(data), 'webp', variant);
  }
  const mobile = images.imageDimensions(readFileSync(images.backgroundFile(42, result.id, 'mobile')));
  assert.equal(Math.max(mobile.width, mobile.height), 1280);
  const placeholder = images.imageDimensions(readFileSync(images.backgroundFile(42, result.id, 'placeholder')));
  assert.equal(Math.max(placeholder.width, placeholder.height), 32);
  // Pruning keeps only the saved picture.
  const second = await images.storeBackground(42, png(400, 400));
  await images.pruneBackgrounds(42, [second.id]);
  assert.equal(existsSync(images.backgroundFile(42, result.id)), false);
  assert.ok(existsSync(images.backgroundFile(42, second.id)));
  // Content that only claims to be an image fails in the decoder, leaving nothing behind.
  const fake = Buffer.concat([pngHeader(800, 800), Buffer.alloc(200, 7)]);
  await assert.rejects(images.storeBackground(42, fake), (err) => err.code === 'BG_UNREADABLE');
  await images.dropUserBackgrounds(42);
});

test('the converter is shared fairly: one picture at a time per person, an hourly limit, a bounded queue', () => {
  const code = (fn) => {
    try {
      fn();
      return null;
    } catch (err) {
      return err.code;
    }
  };
  const rate = { perHour: 3, maxQueue: 2, windowMs: 60 * 60 * 1000 };
  const t0 = 1_000_000;
  const release = images.admitBackground(501, t0, rate);
  assert.equal(code(() => images.admitBackground(501, t0, rate)), 'BG_BUSY', 'the same person waits for the first picture');
  const other = images.admitBackground(502, t0, rate);
  assert.equal(code(() => images.admitBackground(503, t0, rate)), 'BG_QUEUE_FULL', 'the queue is bounded');
  release();
  release(); // twice is harmless
  other();
  images.admitBackground(501, t0 + 1, rate)();
  images.admitBackground(501, t0 + 2, rate)();
  assert.equal(code(() => images.admitBackground(501, t0 + 3, rate)), 'BG_RATE', 'three an hour');
  images.admitBackground(501, t0 + rate.windowMs + 1, rate)();
});

test('pruning keeps the given pictures and uploads still being converted', async () => {
  const dir = images.userBackgroundDir(77);
  mkdirSync(dir, { recursive: true });
  const [saved, fresh, old, busy, stray] = ['a', 'b', 'c', 'd', 'e'].map((ch) => ch.repeat(24));
  for (const id of [saved, fresh, old]) for (const suffix of ['', '-m', '-p']) writeFileSync(join(dir, `${id}${suffix}.webp`), 'x');
  writeFileSync(join(dir, `.${busy}.upload`), 'x');
  writeFileSync(join(dir, `.${stray}.upload`), 'x');
  const hourAgo = (Date.now() - 60 * 60 * 1000) / 1000;
  utimesSync(join(dir, `.${stray}.upload`), hourAgo, hourAgo);
  await images.pruneBackgrounds(77, [saved, fresh]);
  assert.ok(existsSync(images.backgroundFile(77, saved)));
  assert.ok(existsSync(images.backgroundFile(77, fresh, 'mobile')));
  assert.equal(existsSync(images.backgroundFile(77, old)), false);
  assert.ok(existsSync(join(dir, `.${busy}.upload`)), 'another request is converting it');
  assert.equal(existsSync(join(dir, `.${stray}.upload`)), false, 'a leftover goes');
  await images.dropUserBackgrounds(77);
});

test.after(() => rmSync(uploads, { recursive: true, force: true }));
