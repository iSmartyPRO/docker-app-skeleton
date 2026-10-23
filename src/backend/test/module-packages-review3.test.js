import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mayOwnTable, tablePatternProblem } from '../platform/packages/tableOwnership.js';
import { ownPatterns } from '../platform/packages/backup.js';
import { CRASH_LIMIT, attributeCrash, packageOfStack, recordCrash } from '../platform/packages/crashGuard.js';
import { UNFINISHED_LIMIT, unfinishedBootDecision } from '../platform/packages/loader.js';
import { exitForRestart, onRestartExit } from '../platform/packages/restart.js';
import { onShutdown, runShutdownHooks } from '../platform/registry.js';

/*
 * Fixes after the third review of the package platform (docs/module-packages.md): shutdown hooks
 * with their own timeout, crashes attributed to a package, unfinished boots with an attempt
 * counter, the restart before listen clearing in-flight markers, table ownership with exact
 * entries winning, the module's own prefixes in its tables. No database.
 */

const here = dirname(fileURLToPath(import.meta.url));
const temp = () => mkdtempSync(join(tmpdir(), 'portal-pkg-r3-'));

test('shutdown: a hook that never resolves is left behind after its timeout; the next hook still runs', async () => {
  const ran = [];
  onShutdown(() => new Promise(() => {}), { module: 'stuck' });
  onShutdown(() => ran.push('next'), { module: 'fine' });
  const started = Date.now();
  await runShutdownHooks({ timeoutMs: 200 });
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(ran, ['next']);
});

test('shutdown: server.js arms the force-exit timers before awaiting the hooks', () => {
  const text = readFileSync(resolve(here, '../server.js'), 'utf8');
  const body = text.slice(text.indexOf('const shutdown = async'));
  assert.ok(body.indexOf("'Shutdown timed out, exiting'") < body.indexOf('await runShutdownHooks()'));
});

test('crash attribution: the topmost frame in $MODULES_DIR names the package', () => {
  const root = '/app/data/modules';
  const stack = [
    'Error: boom /app/data/modules/other/1.0.0/server/index.js',
    '    at helper (file:///app/backend/services/x.js:1:1)',
    '    at Timeout._onTimeout (file:///app/data/modules/masterplan/1.1.0/server/index.js?v=1.1.0:120:9)',
    '    at /app/data/modules/hello/2.0.0/server/index.js:3:1',
  ].join('\n');
  assert.deepEqual(packageOfStack(stack, root), { id: 'masterplan', version: '1.1.0' });
  assert.equal(packageOfStack('Error: x\n    at file:///app/backend/server.js:1:1', root), null);
  assert.equal(packageOfStack('Error: /app/data/modules/hello/1.0.0/x', root), null, 'the message is not a frame');
  assert.equal(packageOfStack(undefined, root), null);
});

test('crash attribution: in its boot window → «crashed»; later counted, blocked at the third within 10 minutes', () => {
  const dir = temp();
  const saved = process.env.MODULES_DIR;
  process.env.MODULES_DIR = dir;
  try {
    mkdirSync(join(dir, 'boom', '1.0.0'), { recursive: true });
    const err = new Error('kaput');
    err.stack = `Error: kaput\n    at tick (${pathToFileURL(join(dir, 'boom/1.0.0/server/index.js')).href}:1:1)`;
    writeFileSync(join(dir, 'boom/.boot-attempt'), JSON.stringify({ version: '1.0.0', status: 'loading', attempts: 1 }));
    assert.equal(attributeCrash(err).action, 'crashed');
    assert.equal(JSON.parse(readFileSync(join(dir, 'boom/.boot-attempt'), 'utf8')).status, 'crashed');
    rmSync(join(dir, 'boom/.boot-attempt'));
    const now = Date.now();
    assert.equal(attributeCrash(err, { now }).action, 'counted');
    assert.equal(attributeCrash(err, { now: now + 1000 }).count, 2);
    const third = attributeCrash(err, { now: now + 2000 });
    assert.equal(third.action, 'blocked');
    assert.equal(third.count, CRASH_LIMIT);
    assert.match(JSON.parse(readFileSync(join(dir, 'boom/.boot-attempt'), 'utf8')).reason, /3 times within 10 minutes/);
    // Old crashes and another version do not count.
    rmSync(join(dir, 'boom/.boot-attempt'));
    assert.equal(recordCrash('boom', '1.0.0', { now: now + 11 * 60_000 }).count, 1);
    assert.equal(recordCrash('boom', '1.0.1', { now: now + 11 * 60_000 }).count, 1);
    // Not a package of this portal: nothing written.
    const core = new Error('core');
    core.stack = 'Error: core\n    at x (file:///app/backend/server.js:1:1)';
    assert.equal(attributeCrash(core), null);
  } finally {
    process.env.MODULES_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash guard in a real process: an uncaught exception from a package timer exits 1 and is counted', () => {
  const dir = temp();
  try {
    mkdirSync(join(dir, 'modules', 'boom', '1.0.0', 'server'), { recursive: true });
    writeFileSync(join(dir, 'modules/boom/1.0.0/server/index.js'), `setTimeout(() => { throw new Error('timer kaput'); }, 10);\n`);
    writeFileSync(
      join(dir, 'run.mjs'),
      `const { installCrashGuard } = await import(${JSON.stringify(pathToFileURL(resolve(here, '../platform/packages/crashGuard.js')).href)});
installCrashGuard({ bootId: 'test' });
await import(${JSON.stringify(pathToFileURL(join(dir, 'modules/boom/1.0.0/server/index.js')).href)});
setTimeout(() => {}, 5000);
`
    );
    const runOnce = () => spawnSync(process.execPath, [join(dir, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, MODULES_DIR: join(dir, 'modules') }, timeout: 20_000 });
    const first = runOnce();
    assert.equal(first.status, 1);
    assert.match(first.stderr, /Module package boom 1\.0\.0 crashed the portal \(1 of 3/);
    runOnce();
    const third = runOnce();
    assert.equal(third.status, 1);
    assert.match(third.stderr, /it is not loaded at the next start/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'modules/boom/.boot-attempt'), 'utf8')).status, 'blocked');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unfinished boots: attributable stops act at once, others only on the second in a row', () => {
  assert.equal(UNFINISHED_LIMIT, 2);
  // Not attributable (OOM, power loss, docker kill, the watchdog): loaded again.
  assert.deepEqual(unfinishedBootDecision({ status: 'loading' }), { retry: true, attempt: 2 });
  assert.deepEqual(unfinishedBootDecision({ status: 'loading' }, { pending: true }), { retry: true, attempt: 2 });
  assert.equal(unfinishedBootDecision({ status: 'loading', attempts: 2 }).retry, false);
  assert.equal(unfinishedBootDecision({ status: 'loading', attempts: 2 }, { pending: true }).rollback, true);
  // Attributed by the crash guard: at once.
  assert.equal(unfinishedBootDecision({ status: 'crashed' }).retry, false);
  assert.equal(unfinishedBootDecision({ status: 'crashed' }, { pending: true }).rollback, true);
  // Timed out: an update is rolled back at once, a running package gets a second try.
  assert.equal(unfinishedBootDecision({ status: 'timeout' }, { pending: true }).retry, false);
  assert.deepEqual(unfinishedBootDecision({ status: 'timeout', attempts: 1 }), { retry: true, attempt: 2 });
  assert.equal(unfinishedBootDecision({ status: 'timeout', attempts: 2 }).retry, false);
  // Blocked stays blocked.
  assert.equal(unfinishedBootDecision({ status: 'blocked', reason: 'x' }).reason, 'x');
});

test('restart before listen: the before-exit hooks run, then exit 75', () => {
  const calls = [];
  onRestartExit(() => calls.push('cleared'));
  onRestartExit(() => {
    throw new Error('a broken hook does not stop the exit');
  });
  let code = null;
  exitForRestart({ exit: (value) => (code = value) });
  assert.deepEqual(calls, ['cleared']);
  assert.equal(code, 75);
});

test('table ownership: another module’s exact table wins over a module’s own prefix', () => {
  assert.equal(mayOwnTable('kb', 'kb_item_files'), false, 'Files owns it');
  assert.equal(mayOwnTable('files', 'kb_item_files'), true);
  assert.equal(mayOwnTable('kb', 'kb_items'), true);
  assert.equal(tablePatternProblem('kb', 'kb_%'), null, 'the prefix may cover it; run time leaves kb_item_files out');
  assert.match(tablePatternProblem('kb', 'kb_item_files'), /overlaps the tables of module "files"/);
  assert.match(tablePatternProblem('hello', 'mp_%'), /must start with "hello_"/);
});

test('a module’s tables always include its own prefixes (tables a subtransaction created)', () => {
  assert.deepEqual(ownPatterns('hello'), ['hello_%']);
  assert.deepEqual(ownPatterns('masterplan'), ['masterplan_%', 'mp_%']);
  assert.deepEqual(ownPatterns('employees'), ['employees_%', 'emp_%']);
});

test('the file a crash count lives in is the module root, not a version folder', () => {
  const dir = temp();
  const saved = process.env.MODULES_DIR;
  process.env.MODULES_DIR = dir;
  try {
    mkdirSync(join(dir, 'boom'), { recursive: true });
    recordCrash('boom', '1.0.0');
    assert.ok(existsSync(join(dir, 'boom/.crashes')));
  } finally {
    process.env.MODULES_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inventory: a store challenge must be a plain token (it is signed with the inventory)', async () => {
  const { inventory, CHALLENGE_PATTERN } = await import('../platform/packages/inventory.js');
  assert.ok(CHALLENGE_PATTERN.test('a1B2-c3_d4'));
  for (const bad of ['short', 'has space here', 'x'.repeat(129), '<script>']) {
    await assert.rejects(inventory({ challenge: bad }), (err) => err.code === 'BAD_CHALLENGE' && err.statusCode === 400);
  }
});

test('SDK: no database password / JWT secret (appConfig) and no key material; sealing of stored secrets without the keys', async () => {
  const sdk = await import('../platform/sdk/server.js');
  for (const name of ['appConfig', 'decryptionKeys', 'reportUnreadableSecret', 'openSealed']) assert.equal(name in sdk, false, name);
  // SDK 1.1.0: Remote's stored passwords (sealed while it was built in) open the same way from the package.
  const crypto = await import('../services/crypto.js');
  assert.equal(sdk.unseal(crypto.seal('s3cret')), 's3cret');
  assert.equal(crypto.unseal(sdk.seal('s3cret')), 's3cret');
  assert.equal(sdk.SDK_VERSION, '1.1.0');
});

test('signing key: a passphrase encrypts the key file; signing needs the passphrase', async () => {
  const { generateSigningKey, signFiles } = await import('../platform/packages/signature.js');
  const files = [{ name: 'manifest.json', data: Buffer.from('{}') }];
  const key = generateSigningKey({ passphrase: 'correct horse' });
  assert.equal(key.encrypted, true);
  assert.match(key.privateKey, /BEGIN ENCRYPTED PRIVATE KEY/);
  assert.throws(() => signFiles(files, key.privateKey), /MODULE_SIGNING_KEY_PASSPHRASE/);
  assert.throws(() => signFiles(files, key.privateKey, { passphrase: 'wrong' }), /cannot be opened/);
  assert.equal(JSON.parse(signFiles(files, key.privateKey, { passphrase: 'correct horse' }).toString()).keyId, key.keyId);
  const plain = generateSigningKey();
  assert.equal(plain.encrypted, false);
  assert.equal(JSON.parse(signFiles(files, plain.privateKey).toString()).keyId, plain.keyId);
});

test('keygen reads MODULE_SIGNING_KEY_PASSPHRASE and warns about an unprotected key (not run: it edits trusted-keys.json)', () => {
  const text = readFileSync(resolve(here, '../../../scripts/build-module.mjs'), 'utf8');
  assert.match(text, /generateSigningKey\(\{ passphrase \}\)/);
  assert.match(text, /offline build host/);
});
