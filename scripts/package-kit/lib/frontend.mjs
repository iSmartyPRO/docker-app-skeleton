/*
 * The core frontend for the kit's browser checks: built once per state of src/frontend
 * (cached by a digest of HEAD + the uncommitted changes), served by `vite preview`, whose proxy
 * sends /api and /modules to the kit backend (VITE_API_URL).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './pure.mjs';
import { run, start, sleep, withHostLock, otherViteBuild } from './proc.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Digest of what the frontend build depends on in this checkout. */
export function frontendKey(root) {
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const paths = ['src/frontend', 'VERSION'];
  const diff = git(root, 'diff', 'HEAD', '--', ...paths);
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '--', ...paths);
  let untrackedDigest = '';
  for (const file of untracked.split('\n').filter(Boolean)) {
    try {
      untrackedDigest += `${file}:${git(root, 'hash-object', '--', file).trim()}\n`;
    } catch {
      untrackedDigest += `${file}:?\n`;
    }
  }
  return sha256(`${head}\n${diff}\n${untrackedDigest}`).slice(0, 16);
}

/** Builds (or reuses) the core frontend into `<cacheDir>/front-<key>`. Returns the folder. */
export async function buildFrontend({ root, cacheDir, env, log, say }) {
  const key = frontendKey(root);
  const out = join(cacheDir, `front-${key}`);
  if (existsSync(join(out, 'index.html')) && existsSync(join(out, 'sdk/manifest.json'))) {
    say(`frontend: reusing build ${key}`);
    return { dir: out, key, reused: true };
  }
  mkdirSync(cacheDir, { recursive: true });
  const front = join(root, 'src/frontend');
  await withHostLock('vite-build', async () => {
    rmSync(out, { recursive: true, force: true });
    await run('vite build', process.execPath, [join(front, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: front,
      env: { ...env, NODE_OPTIONS: '--max-old-space-size=2048' },
      log,
      timeoutMs: 20 * 60_000,
    });
  }, { busy: otherViteBuild, say });
  if (!existsSync(join(out, 'index.html'))) throw new Error(`vite build wrote no index.html (log ${log})`);
  // Keep the three newest builds.
  const builds = readdirSync(cacheDir).filter((name) => name.startsWith('front-')).map((name) => ({ name, at: statSync(join(cacheDir, name)).mtimeMs })).sort((a, b) => b.at - a.at);
  for (const old of builds.slice(3)) rmSync(join(cacheDir, old.name), { recursive: true, force: true });
  return { dir: out, key, reused: false };
}

/** `vite preview` of a build on `port`, proxying to the backend. Returns { pid, base }. */
export async function startPreview({ root, dir, port, backendBase, env, log }) {
  const front = join(root, 'src/frontend');
  const proc = start('vite preview', process.execPath, [join(front, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: front,
    env: { ...env, VITE_API_URL: backendBase },
    log,
  });
  const base = `http://127.0.0.1:${port}`;
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 200) {
        const api = await fetch(`${base}/api/modules/installed`, { signal: AbortSignal.timeout(5000) });
        if (api.status === 200) return { pid: proc.pid, base, proc };
      }
    } catch {
      /* not yet */
    }
    await sleep(700);
  }
  throw new Error(`vite preview did not answer on ${base} (log ${log})`);
}
