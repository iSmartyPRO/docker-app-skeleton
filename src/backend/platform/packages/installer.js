import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../../config/database.js';
import { APP_VERSION } from '../../config/version.js';
import { CATEGORIES, INTEGRATIONS, MODULE_MANIFEST } from '../../modules/manifest.js';
import { invalidateSettings } from '../../services/settings.js';
import { recordSecurityEvent } from '../../services/security.js';
import { onShutdown } from '../registry.js';
import { SDK_VERSION } from '../sdk/version.js';
import { openPackage, writePackageFiles, PackageError } from './archive.js';
import { badPackage, checkInstall, checkUninstall } from './checks.js';
import { clearBootMarker, readManifestAt, readPointer, writePointer } from './disk.js';
import { backupModule, dropModuleData, foreignKeysInto, moduleTables } from './backup.js';
import { getModuleRow, listModuleRows, saveModuleRow } from './store.js';
import { installedIndex } from './loader.js';
import { normalizeManifest } from './manifestFile.js';
import { IntegrityError, verifyPackageDir } from './integrity.js';
import { cleanStaging } from './staging.js';
import { archiveIncoming } from './incoming.js';
import { devMode, moduleRoot, stagingDir, versionDir, ID_PATTERN } from './paths.js';
import { BOOT_ID, requestRestart, restartPending } from './restart.js';

/*
 * Install, update and remove module packages (spec §4–5, §6 stage 4;
 * docs/module-packages.md «Install, update, remove»). Superadministrators only
 * (routes.js checks). Steps:
 *
 *   stage(file)     open + verify the archive (inflated once, in memory), run
 *                   the §5 checks, unpack it into .staging/<token>/ and return
 *                   the module card (preview); the upload itself is dropped
 *   install(token)  verify the staged folder again from disk (signed listing,
 *                   same as at stage) → check again → (update: refuse when other
 *                   tables have foreign keys into the module's; back up its
 *                   tables) → move the folder to $MODULES_DIR/<id>/<version> →
 *                   load the new code and apply its migrations in a child
 *                   process (one transaction: a failure changes nothing, the old
 *                   version stays) → installed_modules row → `current` pointer →
 *                   journal → restart. A new module is installed switched off.
 *   uninstall(id)   refused while other modules require it; the code is
 *                   deleted, the data (tables, settings) stays
 *   purgeData(id)   only for a removed module: a fresh backup first, then its
 *                   tables are dropped and its settings forgotten
 *
 * Install, uninstall and purge are refused (409) while a restart is pending:
 * the restart would cut them off half-way. The prepare child is killed when
 * the portal shuts down (its transaction is rolled back with its connection).
 */

const here = dirname(fileURLToPath(import.meta.url));
let busy = false;
let activeChild = null;

const problemError = (status, problems, code = problems[0]?.code || 'MODULE_CHECK_FAILED') =>
  Object.assign(new Error(problems.map((item) => item.message.en).join('; ')), { statusCode: status, code, problems });

const simpleProblem = (code, ruText, enText, params = {}) => ({ code, params, message: { ru: ruText, en: enText } });

async function exclusive(fn) {
  if (restartPending()) throw problemError(409, [simpleProblem('RESTART_PENDING', 'Портал перезапускается — дождитесь окончания перезапуска и повторите', 'The portal is restarting — wait until it is back and try again')]);
  if (busy) throw problemError(409, [simpleProblem('MODULES_BUSY', 'Идёт другая операция с модулями — подождите', 'Another module operation is running — please wait')]);
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

/** Ends a running prepare child (shutdown): its migrations' transaction is rolled back with its connection. */
export function stopPrepare() {
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) activeChild.kill('SIGKILL');
}
onShutdown(stopPrepare);
process.on('exit', stopPrepare);

function journal({ actor, ip, code, detail, params }) {
  return recordSecurityEvent({ kind: 'module_package', severity: 'info', username: actor, ip, detail, code, params }).catch(() => {});
}

const openOptions = () => ({ allowUnsigned: devMode(), categories: CATEGORIES, integrations: INTEGRATIONS });

/** What is installed now (checks.js), with removed packages whose data is kept. */
async function currentIndex() {
  const removedRows = (await listModuleRows()).filter((row) => row.source === 'package' && row.state === 'removed');
  return installedIndex(MODULE_MANIFEST, { removedRows });
}

const checkFor = async (manifest) => checkInstall(manifest, { installed: await currentIndex(), coreVersion: APP_VERSION, sdkVersion: SDK_VERSION });

/** The module card shown before «Установить». */
export function previewOf(opened, check) {
  const { manifest } = opened;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || null,
    version: manifest.version,
    core: manifest.core,
    category: manifest.category,
    permissions: manifest.permissions,
    requires: manifest.requires,
    enhances: manifest.enhances,
    changelog: manifest.changelog,
    tables: manifest.tables,
    hasServer: Boolean(manifest.server),
    hasWeb: Boolean(manifest.web),
    migrations: opened.files.filter((file) => file.name.startsWith('migrations/')).map((file) => file.name.slice('migrations/'.length)),
    signed: opened.signed,
    keyId: opened.keyId,
    checksum: opened.checksum,
    action: check.action,
    currentVersion: check.current?.version || null,
    removedVersion: check.removed?.version || null,
  };
}

const stagedDir = (token) => join(stagingDir(), token);
const stagedMeta = (token) => join(stagingDir(), `${token}.json`);

/**
 * Step 1: an uploaded file, or a file of incoming/ («Пакеты на сервере»:
 * `incoming` = { file, sha256 }, incoming.js read it) — the same checks. Returns { token, preview, problems } — problems
 * empty means «Установить» may be pressed. A damaged / foreign file throws
 * PackageError (422, «Файл повреждён или выпущен не нами»). The archive is
 * inflated once, here; install works from the unpacked folder.
 */
export function stagePackage(buffer, options = {}) {
  // One at a time and never while a restart is pending: each upload holds the file and its inflated files in memory.
  return exclusive(() => stageNow(buffer, options));
}

async function stageNow(buffer, { actor = null, ip = null, incoming = null } = {}) {
  let opened;
  try {
    opened = openPackage(buffer, openOptions());
  } catch (err) {
    if (err instanceof PackageError) journal({ actor, ip, code: 'module_rejected', detail: `package rejected${incoming ? ` (server file ${incoming.file})` : ''}: ${err.problem.params?.reason || err.message}`.slice(0, 200), params: { reason: err.problem.params?.reason || '', ...(incoming ? { file: incoming.file } : {}) } });
    throw err;
  }
  const check = await checkFor(opened.manifest);
  cleanStaging();
  mkdirSync(stagingDir(), { recursive: true });
  const token = randomBytes(16).toString('hex');
  writePackageFiles(opened.files, stagedDir(token));
  // The listing as signed: install checks that the folder still holds exactly these files.
  const { listingSha256 } = verifyPackageDir(stagedDir(token), { devMode: devMode() });
  writeFileSync(stagedMeta(token), `${JSON.stringify({ id: opened.manifest.id, version: opened.manifest.version, checksum: opened.checksum, keyId: opened.keyId, signed: opened.signed, listingSha256, ...(incoming ? { incoming: { file: incoming.file, sha256: incoming.sha256 } } : {}), at: new Date().toISOString() })}\n`, { mode: 0o600 });
  return { token, preview: previewOf(opened, check), problems: check.problems, unsigned: !opened.signed };
}

/** The staged package of `token`, verified again from disk: { dir, meta, manifest, signature }. */
function stagedPackage(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) throw problemError(400, [simpleProblem('BAD_TOKEN', 'Загрузите файл ещё раз', 'Upload the file again')]);
  const dir = stagedDir(token);
  if (!existsSync(dir) || !existsSync(stagedMeta(token))) throw problemError(410, [simpleProblem('STAGING_EXPIRED', 'Файл не найден или устарел — загрузите его ещё раз', 'The upload has expired — upload the file again')]);
  const meta = JSON.parse(readFileSync(stagedMeta(token), 'utf8'));
  let manifest;
  try {
    verifyPackageDir(dir, { expected: { listing_sha256: meta.listingSha256, signed_by: meta.signed ? meta.keyId : 'unsigned' }, devMode: devMode() });
    const normalized = normalizeManifest(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), { categories: CATEGORIES, integrations: INTEGRATIONS });
    if (normalized.problems.length) throw new IntegrityError(`manifest.json: ${normalized.problems.join('; ')}`);
    manifest = normalized.manifest;
  } catch (err) {
    if (err instanceof IntegrityError) throw new PackageError(badPackage(`staged copy: ${err.message}`));
    throw err;
  }
  const signatureFile = join(dir, 'SIGNATURE');
  return { dir, meta, manifest, signature: existsSync(signatureFile) ? readFileSync(signatureFile, 'utf8') : null };
}

/** Runs prepare.mjs for an unpacked version: { ok, applied, tables, migrations } or { ok: false, error, migration?, code? }. */
export function prepareVersion(id, version, { migrate = true, timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(here, 'prepare.mjs'), id, version, ...(migrate ? ['--migrate'] : [])], {
      cwd: resolve(here, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    activeChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) activeChild = null;
      const line = stdout.split('\n').reverse().find((item) => item.startsWith('@@prepare '));
      if (line) {
        try {
          return resolvePromise(JSON.parse(line.slice('@@prepare '.length)));
        } catch {
          /* fall through */
        }
      }
      return resolvePromise({ ok: false, error: `the check process ended (${signal || code}): ${stderr.trim().split('\n').slice(-3).join(' ')}` });
    });
    child.on('error', (err) => {
      if (activeChild === child) activeChild = null;
      resolvePromise({ ok: false, error: err.message });
    });
  });
}

/** Keeps the current and previous version folders of a module, removes the rest. */
function pruneVersions(id) {
  const keep = new Set([readPointer(id, 'current'), readPointer(id, 'previous')].filter(Boolean));
  const root = moduleRoot(id);
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    if (/^\d+\.\d+\.\d+$/.test(name) && !keep.has(name)) rmSync(join(root, name), { recursive: true, force: true });
    if (name.startsWith('.') && name.includes('.tmp-')) rmSync(join(root, name), { recursive: true, force: true });
  }
}

/** The §5-style refusal for a failed prepare. */
function prepareProblem(prepared, current) {
  if (prepared.code === 'SCHEMA_NEWER') {
    return simpleProblem('SCHEMA_NEWER', `База данных модуля новее этого файла (уже применены миграции, которых в нём нет) — установите версию не ниже установленной ранее: ${prepared.error}`, `The module's database is newer than this file (it has migrations the file does not) — install at least the version installed before: ${prepared.error}`);
  }
  if (prepared.code === 'MIGRATION_CHANGED') {
    return simpleProblem('MIGRATION_CHANGED', `Уже применённая миграция ${prepared.migration} изменена в этом файле — такой пакет установить нельзя`, `The already applied migration ${prepared.migration} was changed in this file — such a package cannot be installed`, { migration: prepared.migration });
  }
  if (prepared.migration) {
    return simpleProblem('MIGRATION_FAILED', `Миграция ${prepared.migration} не выполнилась, изменения отменены${current ? `, оставлена версия ${current.version}` : ''}: ${prepared.error}`, `Migration ${prepared.migration} failed, nothing was changed${current ? `; version ${current.version} stays` : ''}: ${prepared.error}`, { migration: prepared.migration });
  }
  return simpleProblem('MODULE_DOES_NOT_START', `Модуль не запускается: ${prepared.error}`, `The module does not start: ${prepared.error}`);
}

/** Refuses (409) when tables outside the module have foreign keys into its tables: a restore or data removal could not run. */
async function refuseForeignKeys(id, tables, { purge = false } = {}) {
  const keys = await foreignKeysInto(tables);
  if (!keys.length) return;
  const list = keys.map((key) => `${key.kind && key.kind !== 'foreign key' ? `${key.kind} ` : ''}${key.from} → ${key.to}`).join(', ');
  throw problemError(409, [
    purge
      ? simpleProblem('FOREIGN_KEYS', `На таблицы модуля ссылаются другие таблицы или представления (${list}) — данные нельзя удалить, не повредив их`, `Other tables or views reference the module's tables (${list}) — its data cannot be deleted without breaking them`, { keys: list })
      : simpleProblem('FOREIGN_KEYS', `На таблицы модуля ссылаются другие таблицы или представления (${list}) — при неудачном обновлении его таблицы нельзя было бы восстановить, поэтому обновление отменено`, `Other tables or views reference the module's tables (${list}) — after a failed update its tables could not be restored, so the update is refused`, { keys: list }),
  ]);
}

/**
 * Step 2: installs or updates a staged package. Resolves to
 * { id, version, action, applied, restart: true, bootId } once the new
 * version is ready; the restart follows the answer.
 */
export async function installStaged(token, { actor = null, ip = null, restart = true } = {}) {
  return exclusive(async () => {
    const staged = stagedPackage(token);
    const { manifest, meta } = staged;
    const check = await checkFor(manifest);
    if (check.problems.length) throw problemError(409, check.problems);
    const current = check.action === 'update' ? check.current : null;
    let backup = null;
    if (current) {
      let currentManifest = null;
      try {
        currentManifest = readManifestAt(manifest.id, current.version);
      } catch {
        currentManifest = null;
      }
      const tablesManifest = { tables: [...new Set([...(currentManifest?.tables || []), ...manifest.tables])] };
      await refuseForeignKeys(manifest.id, await moduleTables(manifest.id, tablesManifest));
      backup = await backupModule({ id: manifest.id, version: current.version, manifest: tablesManifest, reason: 'update' });
    }
    // The verified staged folder becomes the version folder (same file system: a rename).
    mkdirSync(moduleRoot(manifest.id), { recursive: true });
    const target = versionDir(manifest.id, manifest.version);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    renameSync(staged.dir, target);
    rmSync(stagedMeta(token), { force: true });
    const prepared = await prepareVersion(manifest.id, manifest.version, { migrate: true });
    if (!prepared.ok) {
      // The migrations ran in one transaction: nothing changed in the database; the old version stays.
      if (target !== (current ? versionDir(manifest.id, current.version) : null)) rmSync(target, { recursive: true, force: true });
      journal({ actor, ip, code: 'module_failed', detail: `${manifest.id} ${manifest.version} not installed: ${prepared.error}`.slice(0, 200), params: { module: manifest.id, version: manifest.version } });
      throw problemError(422, [prepareProblem(prepared, current)]);
    }
    await saveModuleRow({
      id: manifest.id,
      version: manifest.version,
      state: 'installed',
      source: 'package',
      installed_by: actor || 'unknown',
      error: null,
      checksum: meta.checksum,
      signed_by: meta.keyId || (meta.signed ? null : 'unsigned'),
      listing_sha256: meta.listingSha256,
      signature: staged.signature,
      previous_version: current?.version || null,
      pending_check: Boolean(current),
      backup_file: backup?.file || null,
      // A new install starts a new story: the outcome of an old rollback is no longer current.
      last_rollback: null,
      manifest,
      touchInstalledAt: !current,
    });
    // A marker of an older attempt (a version that was skipped at boot) does not apply to the new version.
    clearBootMarker(manifest.id);
    writePointer(manifest.id, 'previous', current?.version || null);
    writePointer(manifest.id, 'current', manifest.version);
    pruneVersions(manifest.id);
    // From «Пакеты на сервере»: the file goes to incoming/installed/ (incoming.js).
    const moved = meta.incoming ? archiveIncoming(meta.incoming.file, meta.incoming.sha256) : null;
    const from = meta.incoming ? ` from server file ${meta.incoming.file}${moved ? '' : ' (file not moved)'}` : '';
    journal({
      actor,
      ip,
      code: current ? 'module_updated' : 'module_installed',
      detail: (current ? `${manifest.id} updated ${current.version} → ${manifest.version}${from}` : `${manifest.id} ${manifest.version} installed${meta.signed ? '' : ' (unsigned, development mode)'}${from}`).slice(0, 200),
      params: { module: manifest.id, version: manifest.version, from: current?.version || '', ...(meta.incoming ? { file: meta.incoming.file } : {}) },
    });
    if (restart) requestRestart(`${current ? 'update' : 'install'} ${manifest.id} ${manifest.version}`);
    return { id: manifest.id, version: manifest.version, action: current ? 'update' : 'install', ...(meta.incoming ? { incomingFile: meta.incoming.file, incomingMoved: Boolean(moved) } : {}), applied: prepared.applied, tables: prepared.tables, backup: backup ? { file: backup.file, format: backup.format } : null, restart, bootId: BOOT_ID };
  });
}

/** Removes a package's code (data stays). Refused while other modules require it. */
export async function uninstallPackage(id, { actor = null, ip = null, restart = true } = {}) {
  return exclusive(async () => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw problemError(404, [simpleProblem('NOT_INSTALLED', 'Модуль не установлен', 'The module is not installed')]);
    const problems = checkUninstall(id, { installed: await currentIndex() });
    if (problems.length) throw problemError(problems[0].code === 'NOT_INSTALLED' ? 404 : 409, problems);
    const version = readPointer(id) || (await getModuleRow(id))?.version || '0.0.0';
    writePointer(id, 'current', null);
    writePointer(id, 'previous', null);
    rmSync(moduleRoot(id), { recursive: true, force: true });
    await saveModuleRow({ id, version, state: 'removed', source: 'package', error: null, pending_check: false, previous_version: null });
    journal({ actor, ip, code: 'module_removed', detail: `${id} ${version} removed (data kept)`, params: { module: id, version } });
    if (restart) requestRestart(`remove ${id}`);
    return { id, version, restart, bootId: BOOT_ID };
  });
}

/**
 * «Удалить данные» of a removed module: a fresh backup is made first (the data
 * is not touched when it fails), then the module's tables are dropped and its
 * stored settings forgotten. `confirm` must repeat the module id.
 */
export async function purgeModuleData(id, { actor = null, ip = null, confirm = null } = {}) {
  return exclusive(async () => {
    const row = typeof id === 'string' && ID_PATTERN.test(id) ? await getModuleRow(id) : null;
    if (!row || row.source !== 'package') throw problemError(404, [simpleProblem('NOT_INSTALLED', 'Модуль не найден', 'The module was not found')]);
    if (row.state !== 'removed' || readPointer(id)) throw problemError(409, [simpleProblem('REMOVE_FIRST', 'Сначала удалите модуль — данные удаляются только у удалённого модуля', 'Remove the module first — data is deleted only for a removed module')]);
    if (confirm !== id) throw problemError(400, [simpleProblem('CONFIRM_REQUIRED', `Для подтверждения введите «${id}»`, `Type “${id}” to confirm`)]);
    const manifest = row.manifest || {};
    await refuseForeignKeys(id, await moduleTables(id, manifest), { purge: true });
    const backup = await backupModule({ id, version: row.version, manifest, reason: 'purge' });
    if (!backup?.file || !existsSync(backup.file) || statSync(backup.file).size === 0) throw problemError(500, [simpleProblem('BACKUP_FAILED', 'Резервная копия не создана — данные не удалены', 'The backup was not made — nothing was deleted')]);
    const tables = await dropModuleData(id, manifest);
    await query(`UPDATE app_settings SET value = (value::jsonb - $1::text)::text, updated_at = NOW() WHERE key = 'modules' AND value ~ '^\\s*\\{'`, [id]);
    invalidateSettings();
    await query(`DELETE FROM installed_modules WHERE id = $1`, [id]);
    journal({ actor, ip, code: 'module_data_removed', detail: `${id}: data removed (${tables.length} tables), backup ${backup.file.split('/').pop()}`.slice(0, 200), params: { module: id, tables: tables.length } });
    return { id, tables, backup: { file: backup.file, format: backup.format, bytes: backup.bytes } };
  });
}

/** Makes a backup of a module's tables on demand (Settings → Modules → «Резервная копия»). */
export async function backupNow(id, { actor = null, ip = null } = {}) {
  const row = typeof id === 'string' && ID_PATTERN.test(id) ? await getModuleRow(id) : null;
  if (!row || row.source !== 'package') throw problemError(404, [simpleProblem('NOT_INSTALLED', 'Модуль не найден', 'The module was not found')]);
  // Like install / update: one module operation at a time, none while a restart is pending.
  return exclusive(async () => {
    const backup = await backupModule({ id, version: row.version, manifest: row.manifest || {}, reason: 'manual' });
    journal({ actor, ip, code: 'module_backup', detail: `${id}: backup ${backup.file.split('/').pop()}`.slice(0, 200), params: { module: id } });
    return backup;
  });
}
