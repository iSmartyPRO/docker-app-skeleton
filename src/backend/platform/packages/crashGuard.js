import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { modulesDir, moduleRoot } from './paths.js';
import { readBootMarker, writeBootMarker } from './disk.js';

/*
 * Crashes caused by a package (docs/module-packages.md «Crashes»).
 *
 * An uncaught exception ends the process (its state is unknown). Before it does, the stack is
 * searched for a frame in a package's code ($MODULES_DIR/<id>/<version>/…); the topmost such
 * frame names the package the crash is attributed to:
 *
 *   - during its boot (import, migrations, register) or the settle window after an update
 *     (its boot marker says «loading»): the marker becomes «crashed», so the next start acts at
 *     once — an update is rolled back, a package that was already running is blocked;
 *   - later: the crash is counted in $MODULES_DIR/<id>/.crashes; at CRASH_LIMIT (3) crashes of
 *     the same version within CRASH_WINDOW_MS (10 min) its marker becomes «blocked» and the next
 *     start skips it (installed_modules.error and the journal say why). The count is cleared once
 *     the portal has run for CRASH_WINDOW_MS with the package (clearCrashesLater, loader.js).
 *
 * Without a package frame the process ends as Node would end it (exit code 1). The journal entry
 * is written when it can be within JOURNAL_WAIT_MS; the files above are written first, synchronously.
 *
 * No imports from the rest of the backend (it runs while the process is going down): the loader
 * hands the journal function in with setCrashJournal().
 */

export const CRASH_LIMIT = 3;
export const CRASH_WINDOW_MS = 10 * 60_000;
const JOURNAL_WAIT_MS = 1500;

let journal = null;
let installed = false;

/** loader.js: how a crash is journaled (recordSecurityEvent). */
export function setCrashJournal(fn) {
  journal = typeof fn === 'function' ? fn : null;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The package a stack trace points into: { id, version } of its topmost frame in $MODULES_DIR, or null. */
export function packageOfStack(stack, root = modulesDir()) {
  if (typeof stack !== 'string' || !stack) return null;
  const bases = [root, pathToFileURL(root).href].map((base) => escape(base.replace(/\/+$/, '')));
  const pattern = new RegExp(`(?:${bases.join('|')})/([a-z][a-z0-9_]{1,31})/(\\d{1,6}\\.\\d{1,6}\\.\\d{1,6})/`);
  for (const line of stack.split('\n')) {
    if (!/^\s+at /.test(line)) continue; // frames only: the message may name any path
    const match = line.match(pattern);
    if (match) return { id: match[1], version: match[2] };
  }
  return null;
}

const crashFile = (id) => join(moduleRoot(id), '.crashes');

export function readCrashes(id) {
  try {
    const value = JSON.parse(readFileSync(crashFile(id), 'utf8'));
    return value && typeof value === 'object' && Array.isArray(value.times) ? value : null;
  } catch {
    return null;
  }
}

/** Counts one crash of `id` `version`: → { count } within the window (older crashes and other versions dropped). */
export function recordCrash(id, version, { now = Date.now(), windowMs = CRASH_WINDOW_MS } = {}) {
  const previous = readCrashes(id);
  const times = (previous?.version === version ? previous.times : []).map(Number).filter((time) => Number.isFinite(time) && now - time < windowMs);
  times.push(now);
  if (existsSync(moduleRoot(id))) {
    const temp = `${crashFile(id)}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ version, times })}\n`);
    renameSync(temp, crashFile(id));
  }
  return { count: times.length };
}

export function clearCrashes(id) {
  rmSync(crashFile(id), { force: true });
}

/**
 * What a crash means for the package it is attributed to (files written, nothing else):
 * → { id, version, action: 'crashed' | 'counted' | 'blocked', count? } or null (not a package's).
 */
export function attributeCrash(err, { now = Date.now(), bootId = '' } = {}) {
  const pkg = packageOfStack(err?.stack);
  if (!pkg || !existsSync(moduleRoot(pkg.id))) return null;
  const message = String(err?.message || err).slice(0, 300);
  const marker = readBootMarker(pkg.id);
  if (marker && marker.version === pkg.version && marker.status === 'loading') {
    writeBootMarker(pkg.id, { ...marker, status: 'crashed', bootId, reason: `it crashed the portal while starting: ${message}` });
    return { ...pkg, action: 'crashed', message };
  }
  if (marker && marker.version === pkg.version && marker.status === 'blocked') return { ...pkg, action: 'blocked', message };
  const { count } = recordCrash(pkg.id, pkg.version, { now });
  if (count >= CRASH_LIMIT) {
    writeBootMarker(pkg.id, { version: pkg.version, status: 'blocked', bootId, reason: `it crashed the portal ${count} times within ${Math.round(CRASH_WINDOW_MS / 60_000)} minutes (last: ${message})` });
    return { ...pkg, action: 'blocked', count, message };
  }
  return { ...pkg, action: 'counted', count, message };
}

/** The uncaughtException handler: attribute, journal (briefly), exit 1. */
export function onUncaughtException(err, origin = 'uncaughtException', { bootId = '', exit = (code) => process.exit(code) } = {}) {
  console.error(`Uncaught exception (${origin}); the process ends:`, err?.stack || err);
  let crash = null;
  try {
    crash = attributeCrash(err, { bootId });
  } catch (fsErr) {
    console.error(`Crash attribution failed: ${fsErr.message}`);
  }
  if (!crash) return exit(1);
  const what =
    crash.action === 'crashed'
      ? 'while starting; the next start rolls an update back or skips the package'
      : crash.action === 'blocked'
        ? `${crash.count || CRASH_LIMIT} times within ${Math.round(CRASH_WINDOW_MS / 60_000)} minutes; it is not loaded at the next start`
        : `(${crash.count} of ${CRASH_LIMIT} within ${Math.round(CRASH_WINDOW_MS / 60_000)} minutes before it is blocked)`;
  console.error(`Module package ${crash.id} ${crash.version} crashed the portal ${what}`);
  if (!journal) return exit(1);
  const done = () => exit(1);
  const timer = setTimeout(done, JOURNAL_WAIT_MS);
  Promise.resolve()
    .then(() => journal({ code: 'module_crashed', severity: 'error', detail: `${crash.id} ${crash.version} crashed the portal ${what}: ${crash.message}`, params: { module: crash.id, version: crash.version, action: crash.action } }))
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer);
      done();
    });
  return undefined;
}

/** Installs the handler once (services/processGuards.js). */
export function installCrashGuard({ bootId = '' } = {}) {
  if (installed) return;
  installed = true;
  process.on('uncaughtException', (err, origin) => onUncaughtException(err, origin, { bootId }));
}
