import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../../config/database.js';
import { APP_VERSION } from '../../config/version.js';
import { CATEGORIES, INTEGRATIONS, MODULE_MANIFEST } from '../../modules/manifest.js';
import { invalidateSettings } from '../../services/settings.js';
import { recordSecurityEvent } from '../../services/security.js';
import { openPackage, unpackPackage, PackageError } from './archive.js';
import { checkInstall, checkUninstall } from './checks.js';
import { readManifestAt, readPointer, writePointer } from './disk.js';
import { backupModule, dropModuleData } from './backup.js';
import { getModuleRow, saveModuleRow } from './store.js';
import { installedIndex } from './loader.js';
import { devMode, moduleRoot, stagingDir, versionDir, ID_PATTERN } from './paths.js';
import { BOOT_ID, requestRestart } from './restart.js';

/*
 * Install, update and remove module packages (spec §4–5, §6 stage 4;
 * docs/module-packages.md «Install, update, remove»). Superadministrators only
 * (routes.js checks). Steps:
 *
 *   stage(file)     open + verify the archive, run the §5 checks, keep the
 *                   file in .staging and return the module card (preview)
 *   install(token)  check again → (update: back up the module's tables) →
 *                   unpack to $MODULES_DIR/<id>/<version> → load the new code
 *                   and apply its migrations in a child process (one
 *                   transaction: a failure changes nothing, the old version
 *                   stays) → installed_modules row → `current` pointer →
 *                   journal → restart. A new module is installed switched off.
 *   uninstall(id)   refused while other modules require it; the code is
 *                   deleted, the data (tables, settings) stays
 *   purgeData(id)   only for a removed module: a fresh backup first, then its
 *                   tables are dropped and its settings forgotten
 */

const here = dirname(fileURLToPath(import.meta.url));
const STAGING_TTL_MS = 60 * 60 * 1000;
let busy = false;

const problemError = (status, problems, code = problems[0]?.code || 'MODULE_CHECK_FAILED') =>
  Object.assign(new Error(problems.map((item) => item.message.en).join('; ')), { statusCode: status, code, problems });

const simpleProblem = (code, ruText, enText, params = {}) => ({ code, params, message: { ru: ruText, en: enText } });

async function exclusive(fn) {
  if (busy) throw problemError(409, [simpleProblem('MODULES_BUSY', 'Идёт другая операция с модулями — подождите', 'Another module operation is running — please wait')]);
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

function journal({ actor, ip, code, detail, params }) {
  return recordSecurityEvent({ kind: 'module_package', severity: 'info', username: actor, ip, detail, code, params }).catch(() => {});
}

const openOptions = () => ({ allowUnsigned: devMode(), categories: CATEGORIES, integrations: INTEGRATIONS });

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
  };
}

function cleanStaging() {
  const dir = stagingDir();
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    try {
      if (Date.now() - statSync(file).mtimeMs > STAGING_TTL_MS) rmSync(file, { force: true });
    } catch {
      /* gone */
    }
  }
}

/**
 * Step 1: an uploaded file. Returns { token, preview, problems } — problems
 * empty means «Установить» may be pressed. A damaged / foreign file throws
 * PackageError (422, «Файл повреждён или выпущен не нами»).
 */
export async function stagePackage(buffer, { actor = null, ip = null } = {}) {
  let opened;
  try {
    opened = openPackage(buffer, openOptions());
  } catch (err) {
    if (err instanceof PackageError) journal({ actor, ip, code: 'module_rejected', detail: `package rejected: ${err.problem.params?.reason || err.message}`.slice(0, 200), params: { reason: err.problem.params?.reason || '' } });
    throw err;
  }
  const check = checkInstall(opened.manifest, { installed: installedIndex(MODULE_MANIFEST), coreVersion: APP_VERSION });
  cleanStaging();
  mkdirSync(stagingDir(), { recursive: true });
  const token = randomBytes(16).toString('hex');
  writeFileSync(join(stagingDir(), `${token}.zip`), buffer);
  return { token, preview: previewOf(opened, check), problems: check.problems, unsigned: !opened.signed };
}

function stagedBuffer(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) throw problemError(400, [simpleProblem('BAD_TOKEN', 'Загрузите файл ещё раз', 'Upload the file again')]);
  const file = join(stagingDir(), `${token}.zip`);
  if (!existsSync(file)) throw problemError(410, [simpleProblem('STAGING_EXPIRED', 'Файл не найден или устарел — загрузите его ещё раз', 'The upload has expired — upload the file again')]);
  return { file, buffer: readFileSync(file) };
}

/** Runs prepare.mjs for an unpacked version: { ok, applied, tables, migrations } or { ok: false, error }. */
export function prepareVersion(id, version, { migrate = true, timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(here, 'prepare.mjs'), id, version, ...(migrate ? ['--migrate'] : [])], {
      cwd: resolve(here, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('close', (code, signal) => {
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
    child.on('error', (err) => resolvePromise({ ok: false, error: err.message }));
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

/**
 * Step 2: installs or updates a staged package. Resolves to
 * { id, version, action, applied, restart: true, bootId } once the new
 * version is ready; the restart follows the answer.
 */
export async function installStaged(token, { actor = null, ip = null, restart = true } = {}) {
  return exclusive(async () => {
    const { file, buffer } = stagedBuffer(token);
    const opened = openPackage(buffer, openOptions());
    const { manifest } = opened;
    const check = checkInstall(manifest, { installed: installedIndex(MODULE_MANIFEST), coreVersion: APP_VERSION });
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
      backup = await backupModule({ id: manifest.id, version: current.version, manifest: { tables: [...new Set([...(currentManifest?.tables || []), ...manifest.tables])] }, reason: 'update' });
    }
    const target = unpackPackage(opened);
    const prepared = await prepareVersion(manifest.id, manifest.version, { migrate: true });
    if (!prepared.ok) {
      // The migrations ran in one transaction: nothing changed in the database; the old version stays.
      if (target !== (current ? versionDir(manifest.id, current.version) : null)) rmSync(target, { recursive: true, force: true });
      journal({ actor, ip, code: 'module_failed', detail: `${manifest.id} ${manifest.version} not installed: ${prepared.error}`.slice(0, 200), params: { module: manifest.id, version: manifest.version } });
      throw problemError(422, [
        prepared.migration
          ? simpleProblem('MIGRATION_FAILED', `Миграция ${prepared.migration} не выполнилась, изменения отменены${current ? `, оставлена версия ${current.version}` : ''}: ${prepared.error}`, `Migration ${prepared.migration} failed, nothing was changed${current ? `; version ${current.version} stays` : ''}: ${prepared.error}`, { migration: prepared.migration })
          : simpleProblem('MODULE_DOES_NOT_START', `Модуль не запускается: ${prepared.error}`, `The module does not start: ${prepared.error}`),
      ]);
    }
    await saveModuleRow({
      id: manifest.id,
      version: manifest.version,
      state: 'installed',
      source: 'package',
      installed_by: actor || 'unknown',
      error: null,
      checksum: opened.checksum,
      signed_by: opened.keyId || (opened.signed ? null : 'unsigned'),
      previous_version: current?.version || null,
      pending_check: Boolean(current),
      backup_file: backup?.file || null,
      manifest,
      touchInstalledAt: !current,
    });
    writePointer(manifest.id, 'previous', current?.version || null);
    writePointer(manifest.id, 'current', manifest.version);
    pruneVersions(manifest.id);
    rmSync(file, { force: true });
    journal({
      actor,
      ip,
      code: current ? 'module_updated' : 'module_installed',
      detail: current ? `${manifest.id} updated ${current.version} → ${manifest.version}` : `${manifest.id} ${manifest.version} installed${opened.signed ? '' : ' (unsigned, development mode)'}`,
      params: { module: manifest.id, version: manifest.version, from: current?.version || '' },
    });
    if (restart) requestRestart(`${current ? 'update' : 'install'} ${manifest.id} ${manifest.version}`);
    return { id: manifest.id, version: manifest.version, action: current ? 'update' : 'install', applied: prepared.applied, tables: prepared.tables, backup: backup ? { file: backup.file, format: backup.format } : null, restart, bootId: BOOT_ID };
  });
}

/** Removes a package's code (data stays). Refused while other modules require it. */
export async function uninstallPackage(id, { actor = null, ip = null, restart = true } = {}) {
  return exclusive(async () => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw problemError(404, [simpleProblem('NOT_INSTALLED', 'Модуль не установлен', 'The module is not installed')]);
    const problems = checkUninstall(id, { installed: installedIndex(MODULE_MANIFEST) });
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
  const backup = await backupModule({ id, version: row.version, manifest: row.manifest || {}, reason: 'manual' });
  journal({ actor, ip, code: 'module_backup', detail: `${id}: backup ${backup.file.split('/').pop()}`.slice(0, 200), params: { module: id } });
  return backup;
}
