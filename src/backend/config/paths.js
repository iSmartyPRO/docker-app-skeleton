import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const uploadRoot =
  process.env.UPLOAD_DIR || resolve(process.cwd(), '../uploads');

export const avatarDir = resolve(uploadRoot, 'avatars');
export const logoDir = resolve(uploadRoot, 'logos');

export function ensureUploadDirs() {
  mkdirSync(avatarDir, { recursive: true });
  mkdirSync(logoDir, { recursive: true });
}
