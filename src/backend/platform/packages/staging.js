import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stagingDir } from './paths.js';

/*
 * $MODULES_DIR/.staging: uploads waiting for «Установить» — <token>/ (the
 * verified, unpacked package) and <token>.json (what the check found). They
 * expire after an hour; cleanStaging() runs at boot, before each upload and
 * every 15 minutes (startStagingCleanup).
 */

export const STAGING_TTL_MS = 60 * 60 * 1000;

export function cleanStaging({ maxAgeMs = STAGING_TTL_MS } = {}) {
  const dir = stagingDir();
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      if (Date.now() - statSync(path).mtimeMs > maxAgeMs) {
        rmSync(path, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* gone */
    }
  }
  return removed;
}

let timer = null;
export function startStagingCleanup(intervalMs = 15 * 60 * 1000) {
  if (timer) return;
  try {
    cleanStaging();
  } catch (err) {
    console.warn(`Module staging cleanup: ${err.message}`);
  }
  timer = setInterval(() => {
    try {
      cleanStaging();
    } catch {
      /* next time */
    }
  }, intervalMs);
  timer.unref?.();
}
