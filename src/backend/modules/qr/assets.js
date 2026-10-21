import { randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { uploadRoot } from '../../config/paths.js';
import { httpError } from '../shared/acl.js';

/*
 * Logos uploaded for QR codes (PNG, SVG, WebP, JPEG up to 1 MB), checked by
 * their bytes, stored under uploads/qr/ with random names that are never
 * reused, served by /api/qr/assets/<file> with a sandbox CSP.
 */

const DIR = () => join(uploadRoot, 'qr');
const FILE = /^[a-f0-9]{24}\.(png|svg|webp|jpg)$/;
export const ASSET_TYPES = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg' };

const SIGNATURES = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  svg: (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(b.toString('utf8', 0, 4096)),
};

export function assetType(buffer) {
  return Object.keys(SIGNATURES).find((key) => SIGNATURES[key](buffer)) || null;
}

export async function storeAsset(file) {
  if (!file?.buffer?.length) throw httpError(400, 'Choose a file', 'NO_FILE');
  if (file.buffer.length > 1024 * 1024) throw httpError(413, 'Logos are limited to 1 MB', 'FILE_TOO_LARGE');
  const ext = assetType(file.buffer);
  if (!ext) throw httpError(400, 'Use PNG, SVG, WebP or JPEG', 'QR_FILE_TYPE');
  const name = `${randomBytes(12).toString('hex')}.${ext}`;
  await mkdir(DIR(), { recursive: true });
  await writeFile(join(DIR(), name), file.buffer);
  return name;
}

export async function readAsset(name) {
  if (!FILE.test(name || '')) return null;
  try {
    return { data: await readFile(join(DIR(), name)), ext: name.split('.').pop() };
  } catch {
    return null;
  }
}
