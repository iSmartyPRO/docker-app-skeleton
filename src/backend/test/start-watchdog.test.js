import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The start.sh watchdog (docs/module-packages.md «Watchdog»): node that stops beating while it
 * does not answer /health is killed and started again; a slow node that keeps beating is not.
 * Runs start.sh itself with a fake nginx and a small entry script instead of server.js.
 */

const here = dirname(fileURLToPath(import.meta.url));
const START = resolve(here, '../../../start.sh');
const shells = ['/bin/sh', '/usr/bin/busybox'].filter((path) => existsSync(path));

function run(shell, entry) {
  const dir = mkdtempSync(join(tmpdir(), 'portal-watchdog-'));
  try {
    writeFileSync(join(dir, 'nginx'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'nginx'), 0o755);
    writeFileSync(join(dir, 'entry.mjs'), entry);
    const args = shell.endsWith('busybox') ? ['sh', START] : [START];
    const result = spawnSync(shell, args, {
      cwd: dir,
      timeout: 60_000,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PORTAL_APP_DIR: dir,
        PORTAL_ENTRY: 'entry.mjs',
        PORTAL_WATCHDOG_SECONDS: '2',
        PORTAL_WATCHDOG_INTERVAL: '1',
        PORTAL_HEARTBEAT_FILE: join(dir, 'beat'),
        PORT: '1', // nothing answers /health there
        MODULES_DIR: join(dir, 'modules'),
      },
    });
    const runs = existsSync(join(dir, 'runs')) ? readFileSync(join(dir, 'runs'), 'utf8').trim().split('\n').length : 0;
    return { ...result, runs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ENTRY_HEAD = `
import { appendFileSync, existsSync } from 'node:fs';
const first = !existsSync('runs');
appendFileSync('runs', 'run\\n');
const { startHeartbeat } = await import(${JSON.stringify(resolve(here, '../services/heartbeat.js'))});
`;

for (const shell of shells) {
  test(`watchdog (${shell}): a hung node is killed and started again; the next start runs`, { timeout: 90_000 }, () => {
    const result = run(shell, `${ENTRY_HEAD}
startHeartbeat({ everyMs: 200 });
if (first) { const until = Date.now() + 30_000; while (Date.now() < until) {} }
process.exit(0);
`);
    assert.match(result.stdout, /Watchdog: node \(\d+\) has been unresponsive/);
    assert.match(result.stdout, /killed by the watchdog/);
    assert.equal(result.runs, 2);
    assert.equal(result.status, 0);
  });

  test(`watchdog (${shell}): a slow node that keeps beating is not killed`, { timeout: 90_000 }, () => {
    const result = run(shell, `${ENTRY_HEAD}
startHeartbeat({ everyMs: 200 });
await new Promise((done) => setTimeout(done, 5000));
process.exit(0);
`);
    assert.doesNotMatch(result.stdout, /Watchdog/);
    assert.equal(result.runs, 1);
    assert.equal(result.status, 0);
  });
}

test('watchdog: PORTAL_WATCHDOG_SECONDS=0 turns it off', () => {
  const text = readFileSync(START, 'utf8');
  assert.match(text, /if \[ "\$WATCHDOG_SECONDS" -gt 0 \]/);
});
