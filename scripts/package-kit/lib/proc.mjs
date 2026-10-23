/*
 * Processes of the package kit: free ports, child processes with their output in log files,
 * and a registry of the PIDs this run started — the only processes it ever stops
 * (never a pattern kill: the host also runs production node and postgres).
 */
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const OWN = new Map(); // pid → { name, child }

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A TCP port nobody listens on now (asked from the OS, then released). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Minimal environment for children: nothing of the caller's (Makefile exports .env!) but PATH, HOME, locale. */
export function baseEnv(extra = {}) {
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'SHELL'];
  const out = {};
  for (const key of keep) if (process.env[key]) out[key] = process.env[key];
  return { ...out, ...extra };
}

/**
 * Starts a child with stdout/stderr appended to `log`. Returns { child, pid, exited: Promise<{code, signal}> }.
 */
export function start(name, command, args, { cwd, env, log }) {
  mkdirSync(dirname(log), { recursive: true });
  const out = createWriteStream(log, { flags: 'a' });
  out.write(`\n=== ${new Date().toISOString()} ${name}: ${command} ${args.join(' ')} (cwd ${cwd})\n`);
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  OWN.set(child.pid, { name, child });
  const exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      OWN.delete(child.pid);
      out.write(`=== ${new Date().toISOString()} ${name} exited code=${code} signal=${signal}\n`);
      setTimeout(() => out.end(), 50);
      resolve({ code, signal });
    });
    child.on('error', (err) => {
      out.write(`=== ${name} failed to start: ${err.message}\n`);
      OWN.delete(child.pid);
      resolve({ code: -1, signal: null, error: err });
    });
  });
  return { child, pid: child.pid, exited };
}

/** Runs a command to completion; rejects on a non-zero exit or after `timeoutMs`. */
export async function run(name, command, args, { cwd, env, log, timeoutMs = 600_000 }) {
  const proc = start(name, command, args, { cwd, env, log });
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
  });
  const result = await Promise.race([proc.exited, timeout]);
  clearTimeout(timer);
  if (result.timeout) {
    await stop(proc.pid);
    throw new Error(`${name} timed out after ${Math.round(timeoutMs / 1000)} s (log ${log})`);
  }
  if (result.code !== 0) throw new Error(`${name} failed (exit ${result.code ?? result.signal}; log ${log})`);
  return result;
}

/** Stops one process this run started: SIGTERM, then SIGKILL after `graceMs`. Unknown PIDs are left alone. */
export async function stop(pid, { graceMs = 12_000 } = {}) {
  const own = OWN.get(pid);
  if (!own) return false;
  const gone = new Promise((resolve) => own.child.once('exit', resolve));
  try {
    own.child.kill('SIGTERM');
  } catch {
    return false;
  }
  const done = await Promise.race([gone.then(() => true), sleep(graceMs).then(() => false)]);
  if (!done) {
    try {
      own.child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    await Promise.race([gone, sleep(3000)]);
  }
  return true;
}

export async function stopAll() {
  for (const pid of [...OWN.keys()]) await stop(pid, { graceMs: 8000 });
}

export const ownPids = () => [...OWN.entries()].map(([pid, { name }]) => ({ pid, name }));

// ── One heavy job at a time (vite builds, Playwright) ───────────────────────

/**
 * A lock shared by kit runs on this host (a file with the holder's PID, stale ones taken over), plus
 * `busy()`: a check for the same heavy work started by someone else (read-only, nothing is killed).
 */
export async function withHostLock(name, fn, { busy = () => null, waitMs = 30 * 60_000, say = () => {} } = {}) {
  const file = join(tmpdir(), `portal-package-kit-${name}.lock`);
  const started = Date.now();
  let told = false;
  for (;;) {
    const holder = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : null;
    const alive = holder && holder !== process.pid && isAlive(holder);
    const other = busy();
    if (!alive && !other) break;
    if (Date.now() - started > waitMs) throw new Error(`Waited ${Math.round(waitMs / 60000)} min for ${name}: ${alive ? `kit run ${holder}` : other}`);
    if (!told) {
      say(`waiting for ${alive ? `another kit run (pid ${holder})` : other} to finish before ${name}`);
      told = true;
    }
    await sleep(5000);
  }
  writeFileSync(file, String(process.pid));
  try {
    return await fn();
  } finally {
    try {
      if (readFileSync(file, 'utf8').trim() === String(process.pid)) rmSync(file, { force: true });
    } catch {
      /* gone */
    }
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Another `vite build` running on the host (someone's build): its description, else null. */
export function otherViteBuild() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    const line = out.split('\n').find((row) => /vite(\.js)?\s+build\b/.test(row) && !row.includes(String(process.pid)));
    return line ? `a vite build (${line.trim().slice(0, 80)})` : null;
  } catch {
    return null;
  }
}

/** A Playwright container already running (one run at a time on this host). */
export function otherPlaywright(image) {
  try {
    const out = execFileSync('docker', ['ps', '--filter', `ancestor=${image}`, '--format', '{{.Names}}'], { encoding: 'utf8' }).trim();
    return out ? `Playwright container ${out.split('\n')[0]}` : null;
  } catch {
    return null;
  }
}
