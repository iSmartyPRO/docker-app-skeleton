import multer from 'multer';
import { randomBytes } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { extname } from 'path';
import { avatarDir, ensureUploadDirs, logoDir } from '../config/paths.js';

ensureUploadDirs();

const AVATAR_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const LOGO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);

function diskStorage(directory, prefix) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, directory),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '').toLowerCase();
      const safeExt = (prefix === 'logo' ? LOGO_EXT : AVATAR_EXT).has(ext) ? ext : '.png';
      cb(null, `${prefix}-${randomBytes(16).toString('hex')}${safeExt}`);
    },
  });
}

function imageFilter(allowed, message) {
  return (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '');
    const okMime = mime.startsWith('image/') || mime === 'image/svg+xml';
    if (!allowed.has(ext) || !okMime) {
      cb(new Error(message));
      return;
    }
    cb(null, true);
  };
}

export const avatarUpload = multer({
  storage: diskStorage(avatarDir, 'user'),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: imageFilter(AVATAR_EXT, 'Avatar must be a JPG, PNG or WebP image under 1 MB'),
}).single('avatar');

export const logoUpload = multer({
  storage: diskStorage(logoDir, 'logo'),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter(LOGO_EXT, 'Logo must be a SVG, PNG, JPG or WebP image under 2 MB'),
}).single('logo');

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

export async function verifyUploadedFile(file, kind = 'avatar') {
  if (!file?.path) {
    const error = new Error('Upload failed');
    error.statusCode = 400;
    throw error;
  }

  const ext = extname(file.filename || file.originalname || '').toLowerCase();
  const allowed = kind === 'logo' ? LOGO_EXT : AVATAR_EXT;
  if (!allowed.has(ext)) {
    await unlink(file.path).catch(() => {});
    const error = new Error('Unsupported file type');
    error.statusCode = 400;
    throw error;
  }

  const sample = await readFile(file.path, { encoding: null });
  const head = sample.subarray(0, 16);
  const ok =
    ext === '.svg'
      ? /^[\s\uFEFF]*<(?:\?xml|svg)\b/i.test(sample.subarray(0, 256).toString('utf8')) &&
        !/<script\b|on\w+\s*=|javascript:/i.test(sample.toString('utf8'))
      : ext === '.png'
        ? startsWith(head, [0x89, 0x50, 0x4e, 0x47])
        : ext === '.webp'
          ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
          : startsWith(head, [0xff, 0xd8, 0xff]);

  if (!ok) {
    await unlink(file.path).catch(() => {});
    const error = new Error('File content does not match the image type');
    error.statusCode = 400;
    throw error;
  }
}
