import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import config from '../../config/app.js';
import { query, withTransaction } from '../../config/database.js';
import { appliedMigrations, recordedTables } from './store.js';
import { mayOwnTable } from './tableOwnership.js';
import { backupsDir } from './paths.js';

/*
 * Backups of a module's tables (spec §6 stage 4): before every update and
 * before «Удалить данные».
 *
 * The tables of a module: the ones its migrations created (module_tables)
 * plus the names / prefix patterns its manifest lists in `tables` (for
 * modules whose tables existed before packages, e.g. mp_% for Masterplan).
 *
 * Format: pg_dump custom format (<file>.dump, restores tables with their
 * structure) when pg_dump can reach the database (the image installs
 * postgresql18-client; the probe connects, so a client older than the server
 * counts as missing); otherwise — and whenever pg_dump fails — a gzip NDJSON
 * file (<file>.ndjson.gz) with the rows of each table (row_to_json), which
 * restores data into tables of the same structure. Next to each backup,
 * <file>.json describes it. Files are 0600, folders 0700 (they hold full table data).
 *
 *   $MODULES_DIR/.backups/<id>/<id>-<version>-<UTC stamp>-<reason>.{dump|ndjson.gz,json}
 *
 * Retention (pruneBackups, after every backup): the newest MODULE_BACKUP_KEEP
 * (5) per module, and at most MODULE_BACKUP_MAX_MB (2048) in all — the oldest go
 * first; the newest backup of each module and the one a pending update would
 * roll back to are never removed.
 */

const SAFE_TABLE = /^[a-z_][a-z0-9_]{0,62}$/;
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const PRIVATE_FILE = 0o600;
const PRIVATE_DIR = 0o700;

let pgDumpChecked = null;
/**
 * True when pg_dump / pg_restore can back up this database: the probe dumps the
 * schema of one platform table over a real connection (a missing client, a
 * client older than the server or a refused login all count as «no»).
 * MODULE_BACKUP_PGDUMP=0 forces the NDJSON format. Checked once per process.
 */
export function pgDumpAvailable() {
  if (process.env.MODULE_BACKUP_PGDUMP === '0') return false;
  if (pgDumpChecked === null) {
    const probe = spawnSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '-t', 'installed_modules', '-f', '/dev/null'], { encoding: 'utf8', env: pgEnv(), timeout: 20_000 });
    pgDumpChecked = probe.status === 0;
    if (!pgDumpChecked) console.warn(`Module backups: pg_dump is not usable (${(probe.error?.message || probe.stderr || `exit ${probe.status}`).trim().split('\n')[0]}); the data-only NDJSON format is used`);
  }
  return pgDumpChecked;
}

/** Tests: probe pg_dump again. */
export function resetPgDumpProbe() {
  pgDumpChecked = null;
}

/**
 * Tables of a module that exist now: the ones its migrations created
 * (module_tables) plus the names / prefix patterns of its manifest `tables` —
 * never a core table or another module's (tableOwnership.js), whatever an
 * older manifest says.
 */
export async function moduleTables(id, manifest = null, db = { query }) {
  const names = new Set(await recordedTables(id, db));
  const patterns = (manifest?.tables || []).filter(Boolean);
  const existing = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename);
  for (const pattern of patterns) {
    const prefix = /[%*]$/.test(pattern) ? pattern.slice(0, -1) : null;
    for (const table of existing) if (prefix != null ? table.startsWith(prefix) : table === pattern) names.add(table);
  }
  const live = new Set(existing);
  return [...names].filter((table) => live.has(table) && SAFE_TABLE.test(table) && mayOwnTable(id, table)).sort();
}

/**
 * Foreign keys from tables outside `tables` into them: [{ from, to, constraint }].
 * A restore drops and recreates the module's tables and «Удалить данные» drops
 * them; both would have to CASCADE through such keys (silently removing
 * another table's constraint), so updates and data removal refuse instead.
 */
export async function foreignKeysInto(tables, db = { query }) {
  if (!tables.length) return [];
  const { rows } = await db.query(
    `SELECT src.relname AS "from", dst.relname AS "to", c.conname AS "constraint"
       FROM pg_constraint c
       JOIN pg_class src ON src.oid = c.conrelid
       JOIN pg_class dst ON dst.oid = c.confrelid
      WHERE c.contype = 'f' AND dst.relnamespace = current_schema()::regnamespace
        AND dst.relname = ANY($1) AND NOT (src.relname = ANY($1))
      ORDER BY 1, 2, 3`,
    [tables]
  );
  return rows;
}

function pgEnv() {
  return {
    ...process.env,
    PGHOST: String(config.postgres.host || ''),
    PGPORT: String(config.postgres.port || 5432),
    PGDATABASE: String(config.postgres.database || ''),
    PGUSER: String(config.postgres.user || ''),
    PGPASSWORD: String(config.postgres.password ?? ''),
  };
}

function run(cmd, args, { out } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env: pgEnv(), stdio: ['ignore', out ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    if (out) child.stdout.pipe(out);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} failed (${code}): ${stderr.trim()}`))));
  });
}

async function dumpNdjson(file, tables, header) {
  async function* lines() {
    yield `${JSON.stringify(header)}\n`;
    for (const table of tables) {
      const rows = (await query(`SELECT row_to_json(t)::text AS r FROM ${quoteIdent(table)} t`)).rows;
      yield `${JSON.stringify({ '#table': table, rows: rows.length })}\n`;
      for (const row of rows) yield `${row.r}\n`;
    }
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(file, { mode: PRIVATE_FILE }));
}

/** An empty file only the app user can read (pg_dump -f keeps the mode of an existing file). */
function createPrivateFile(file) {
  closeSync(openSync(file, 'w', PRIVATE_FILE));
  chmodSync(file, PRIVATE_FILE);
}

/**
 * Backs up the module's tables. Returns the description written next to it:
 * { id, version, file, format, tables, migrations, reason, createdAt, bytes }.
 * A module without tables still gets a (small) backup, so the rule «data is
 * removed only after a fresh backup» holds. When pg_dump fails the NDJSON
 * format is used instead (an update is not blocked by the client tools).
 */
export async function backupModule({ id, version, manifest = null, reason = 'manual' }) {
  const dir = resolve(backupsDir(), id);
  mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  try {
    chmodSync(backupsDir(), PRIVATE_DIR);
    chmodSync(dir, PRIVATE_DIR);
  } catch {
    /* a folder made by someone else: the files are private anyway */
  }
  const tables = await moduleTables(id, manifest);
  const migrations = (await appliedMigrations(id)).map((row) => row.migration_id);
  const base = join(dir, `${id}-${version || '0.0.0'}-${stamp()}-${String(reason).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'manual'}`);
  const header = { format: 'portal-module-backup', formatVersion: 1, module: id, version, tables, migrations, createdAt: new Date().toISOString() };
  let format = tables.length > 0 && pgDumpAvailable() ? 'pg_dump' : 'ndjson';
  let file = null;
  if (format === 'pg_dump') {
    file = `${base}.dump`;
    try {
      createPrivateFile(file);
      await run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', ...tables.flatMap((table) => ['-t', quoteIdent(table)]), '-f', file]);
      chmodSync(file, PRIVATE_FILE);
    } catch (err) {
      rmSync(file, { force: true });
      console.warn(`Backup of ${id}: pg_dump failed (${err.message.split('\n')[0]}); using the NDJSON format`);
      format = 'ndjson';
    }
  }
  if (format === 'ndjson') {
    file = `${base}.ndjson.gz`;
    try {
      await dumpNdjson(file, tables, header);
    } catch (err) {
      rmSync(file, { force: true });
      throw new Error(`Backup of ${id} failed: ${err.message}`);
    }
  }
  const meta = { id, version, file, format, tables, migrations, reason, createdAt: header.createdAt, bytes: statSync(file).size };
  writeFileSync(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`, { mode: PRIVATE_FILE });
  await pruneBackups({ keepFile: file }).catch((err) => console.warn(`Module backups: pruning failed: ${err.message}`));
  return meta;
}

const keepPerModule = () => Math.max(1, Number.parseInt(process.env.MODULE_BACKUP_KEEP || '', 10) || 5);
const maxTotalBytes = () => Math.max(1, Number.parseInt(process.env.MODULE_BACKUP_MAX_MB || '', 10) || 2048) * 1024 * 1024;

function removeBackup(meta) {
  rmSync(meta.file, { force: true });
  rmSync(meta.file.replace(/\.(dump|ndjson\.gz)$/, '.json'), { force: true });
}

/**
 * Retention: the newest MODULE_BACKUP_KEEP backups of each module, and at most
 * MODULE_BACKUP_MAX_MB in all (oldest first). Never removed: the newest backup
 * of each module, `keepFile`, and backups a module row points at (the backup
 * an update would roll back to). Returns the removed files.
 */
export async function pruneBackups({ keepFile = null, rowFiles = null } = {}) {
  const root = backupsDir();
  if (!existsSync(root)) return [];
  const protectedFiles = new Set([keepFile].filter(Boolean));
  try {
    const referenced = rowFiles || (await query(`SELECT backup_file FROM installed_modules WHERE backup_file IS NOT NULL`)).rows.map((row) => row.backup_file);
    for (const fileName of referenced) protectedFiles.add(fileName);
  } catch {
    /* no table yet */
  }
  const removed = [];
  const candidates = [];
  for (const id of readdirSync(root)) {
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(id)) continue;
    const list = listBackups(id);
    list.forEach((meta, index) => {
      if (index === 0 || protectedFiles.has(meta.file)) return;
      if (index >= keepPerModule()) {
        removeBackup(meta);
        removed.push(meta.file);
      } else candidates.push(meta);
    });
  }
  let total = 0;
  for (const id of readdirSync(root)) if (/^[a-z][a-z0-9_]{1,31}$/.test(id)) for (const meta of listBackups(id)) total += meta.bytes || 0;
  candidates.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const meta of candidates) {
    if (total <= maxTotalBytes()) break;
    removeBackup(meta);
    removed.push(meta.file);
    total -= meta.bytes || 0;
  }
  return removed;
}

/** Backups of a module, newest first (descriptions). */
export function listBackups(id) {
  const dir = resolve(backupsDir(), id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((meta) => meta && meta.file && existsSync(meta.file))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function restoreNdjson(meta) {
  const current = (await appliedMigrations(meta.id)).map((row) => row.migration_id);
  if (current.join(',') !== (meta.migrations || []).join(',')) {
    throw new Error(`The backup was made at migrations [${meta.migrations.join(', ')}], the database is at [${current.join(', ')}]: this backup format restores data only into tables of the same structure`);
  }
  const reader = createInterface({ input: createReadStream(meta.file).pipe(createGunzip()), crlfDelay: Infinity });
  await withTransaction(async (client) => {
    if (meta.tables.length) await client.query(`TRUNCATE ${meta.tables.map(quoteIdent).join(', ')}`);
    let table = null;
    let first = true;
    for await (const line of reader) {
      if (!line) continue;
      if (first) {
        first = false;
        continue;
      }
      const value = JSON.parse(line);
      if (value && typeof value['#table'] === 'string' && Object.keys(value).length === 2) {
        if (!meta.tables.includes(value['#table'])) throw new Error(`unexpected table ${value['#table']} in backup`);
        table = value['#table'];
        continue;
      }
      if (!table) throw new Error('backup file is damaged');
      await client.query(`INSERT INTO ${quoteIdent(table)} SELECT * FROM json_populate_record(NULL::${quoteIdent(table)}, $1::json)`, [line]);
    }
  });
}

/**
 * Restores a backup made by backupModule: pg_dump backups drop and recreate the
 * tables (structure and data), drop the tables later migrations created and put
 * module_migrations / module_tables back as they were;
 * NDJSON backups refill tables of the same structure.
 */
export async function restoreBackup(meta) {
  if (!meta?.file || !existsSync(meta.file)) throw new Error('backup file not found');
  if (meta.format === 'pg_dump') {
    const kept = meta.migrations || [];
    // First the tables created by migrations the backup did not have (the failed version's): they may
    // reference the tables being restored (pg_restore --clean could not drop those), and left behind the
    // next update's CREATE TABLE of the same name would fail.
    await withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT table_name FROM module_tables WHERE module_id = $1 AND migration_id IS NOT NULL AND NOT (migration_id = ANY($2))`, [meta.id, kept]);
      const extra = rows.map((row) => row.table_name).filter((table) => !(meta.tables || []).includes(table) && SAFE_TABLE.test(table) && mayOwnTable(meta.id, table));
      if (extra.length) await client.query(`DROP TABLE IF EXISTS ${extra.map(quoteIdent).join(', ')}`);
      await client.query(`DELETE FROM module_tables WHERE module_id = $1 AND migration_id IS NOT NULL AND NOT (migration_id = ANY($2))`, [meta.id, kept]);
    });
    await run('pg_restore', ['--clean', '--if-exists', '--single-transaction', '--no-owner', '--no-privileges', '-d', String(config.postgres.database || ''), meta.file]);
    // The schema is the backup's again: so are the applied migrations.
    await query(`DELETE FROM module_migrations WHERE module_id = $1 AND NOT (migration_id = ANY($2))`, [meta.id, kept]);
    return;
  }
  await restoreNdjson(meta);
}

/** Drops the module's tables and forgets its migrations (after a backup — the installer makes one first). */
export async function dropModuleData(id, manifest = null) {
  const tables = await moduleTables(id, manifest);
  const keys = await foreignKeysInto(tables);
  if (keys.length) throw Object.assign(new Error(`other tables reference the module's tables: ${keys.map((key) => `${key.from} → ${key.to}`).join(', ')}`), { code: 'FOREIGN_KEYS', keys });
  await withTransaction(async (client) => {
    if (tables.length) await client.query(`DROP TABLE IF EXISTS ${tables.map(quoteIdent).join(', ')}`);
    await client.query(`DELETE FROM module_tables WHERE module_id = $1`, [id]);
    await client.query(`DELETE FROM module_migrations WHERE module_id = $1`, [id]);
  });
  return tables;
}
