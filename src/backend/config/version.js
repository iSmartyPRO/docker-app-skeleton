import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

const FILE_CANDIDATES = [
  '/app/VERSION',
  join(here, '../../../VERSION'),
  join(process.cwd(), '../VERSION'),
  join(process.cwd(), 'VERSION'),
  join(here, '../package.json'),
];

function readVersionFile(path) {
  if (!path || !existsSync(path)) return '';
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return '';
  if (path.endsWith('package.json')) {
    try {
      return String(JSON.parse(raw).version || '').trim();
    } catch {
      return '';
    }
  }
  return raw.split(/\r?\n/, 1)[0].trim();
}

function readAppVersion() {
  for (const candidate of FILE_CANDIDATES) {
    const value = readVersionFile(candidate);
    if (value) return value;
  }
  const fromEnv = String(process.env.APP_VERSION || '').trim();
  if (fromEnv) return fromEnv;
  return '0.0.1';
}

export const APP_VERSION = readAppVersion();
