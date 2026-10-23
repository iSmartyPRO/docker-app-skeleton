/*
 * Runs browser/pages.mjs in the Playwright container (one run at a time on this host).
 * playwright-core comes from $PACKAGE_KIT_PW_MODULES (a node_modules folder holding it) or is
 * installed once into the kit cache (<cache>/pw) — never into the repository.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { run, withHostLock, otherPlaywright } from './proc.mjs';

export const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.48.2-jammy';
const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function playwrightModules({ cacheDir, env, log }) {
  const given = process.env.PACKAGE_KIT_PW_MODULES;
  if (given && existsSync(join(given, 'playwright-core/package.json'))) return given;
  const dir = join(cacheDir, 'pw');
  const modules = join(dir, 'node_modules');
  if (existsSync(join(modules, 'playwright-core/package.json'))) return modules;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await run('npm install playwright-core', 'npm', ['install', '--no-audit', '--no-fund', 'playwright-core@1.48.2'], { cwd: dir, env, log, timeoutMs: 10 * 60_000 });
  return modules;
}

/**
 * Opens `pages` as `username` against `base` (the vite preview). Returns the result JSON
 * ({ login, pages: [{ url, finalPath, errors, notes, shot }], error? }) with shot paths on the host.
 */
export async function browse({ jobDir, base, username, password, pages, ignore = [], waitMs = 4500, pwModules, log, say }) {
  mkdirSync(join(jobDir, 'shots'), { recursive: true });
  const job = { base, username, password, pages, ignore, waitMs, shots: '/job/shots', result: '/job/result.json', locale: 'ru-RU' };
  writeFileSync(join(jobDir, 'job.json'), JSON.stringify(job, null, 2));
  const name = `pkgkit-pw-${randomBytes(4).toString('hex')}`;
  const args = ['run', '--rm', '--name', name, '--network', 'host', '--memory', '1500m', '--init',
    '-v', `${join(KIT, 'browser')}:/work/browser:ro`, '-v', `${pwModules}:/work/node_modules:ro`, '-v', `${jobDir}:/job`,
    PLAYWRIGHT_IMAGE, 'node', '/work/browser/pages.mjs', '/job/job.json'];
  await withHostLock('playwright', async () => {
    try {
      await run('playwright', 'docker', args, { cwd: jobDir, env: process.env, log, timeoutMs: Math.max(5 * 60_000, pages.length * 70_000) });
    } catch (err) {
      // Our own container only (its unique name), in case the run timed out.
      try {
        execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
      } catch {
        /* gone */
      }
      if (!existsSync(join(jobDir, 'result.json'))) throw err;
    }
  }, { busy: () => otherPlaywright(PLAYWRIGHT_IMAGE), say });
  const result = JSON.parse(readFileSync(join(jobDir, 'result.json'), 'utf8'));
  for (const page of result.pages || []) if (page.shot) page.shot = page.shot.replace('/job/', `${jobDir}/`);
  return result;
}
