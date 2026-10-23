import { spawn } from 'node:child_process';
import { chmodSync, closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import config from '../../config/app.js';
import { uploadRoot } from '../../config/paths.js';
import { query, withTransaction } from '../../config/database.js';
import { appliedMigrations, recordedTables } from './store.js';
import { MODULE_TABLES, mayOwnTable } from './tableOwnership.js';
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
 * The backup before «Удалить данные» also holds the module's upload folder
 * (uploads/<id>, the convention every module follows for its files) as
 * <file>.uploads.tar.gz; restoreBackup puts it back when a backup has one.
 * Update backups do not: an update leaves the folder where it is.
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
 * MODULE_BACKUP_PGDUMP=0 forces the NDJSON format. Checked once per process,
 * asynchronously (the event loop keeps serving), with a 20 s limit.
 */
export async function pgDumpAvailable() {
  if (process.env.MODULE_BACKUP_PGDUMP === '0') return false;
  if (pgDumpChecked === null) {
    pgDumpChecked = run('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '-t', 'installed_modules', '-f', '/dev/null'], { timeoutMs: 20_000 }).then(
      () => true,
      (err) => {
        console.warn(`Module backups: pg_dump is not usable (${String(err.message).trim().split('\n')[0]}); the data-only NDJSON format is used`);
        return false;
      }
    );
  }
  return pgDumpChecked;
}

/** Tests: probe pg_dump again. */
export function resetPgDumpProbe() {
  pgDumpChecked = null;
}

/** pg_dump / pg_restore of one backup: MODULE_BACKUP_TIMEOUT_MS (30 min), then the tool is killed. */
const toolTimeoutMs = () => Math.max(1000, Number.parseInt(process.env.MODULE_BACKUP_TIMEOUT_MS || '', 10) || 30 * 60_000);

/** Prefix patterns a module always owns: "<id>_%" and the legacy prefixes the core declares for it (mp_% for Masterplan). */
export const ownPatterns = (id) => [`${id}_%`, ...(MODULE_TABLES[id] || []).filter((entry) => entry.endsWith('_')).map((entry) => `${entry}%`)];

/**
 * Tables of a module that exist now: the ones its migrations created
 * (module_tables), the tables named by its own prefixes (ownPatterns: also the
 * ones a migration created in a subtransaction — a DO … EXCEPTION block or a
 * SAVEPOINT — which the migration runner may not have attributed) plus the
 * names / prefix patterns of its manifest `tables` — never a core table or
 * another module's (tableOwnership.js), whatever an older manifest says.
 */
export async function moduleTables(id, manifest = null, db = { query }) {
  const names = new Set(await recordedTables(id, db));
  const patterns = [...ownPatterns(id), ...(manifest?.tables || [])].filter(Boolean);
  const existing = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename);
  for (const pattern of patterns) {
    const prefix = /[%*]$/.test(pattern) ? pattern.slice(0, -1) : null;
    for (const table of existing) if (prefix != null ? table.startsWith(prefix) : table === pattern) names.add(table);
  }
  const live = new Set(existing);
  return [...names].filter((table) => live.has(table) && SAFE_TABLE.test(table) && mayOwnTable(id, table)).sort();
}

/**
 * Objects outside `tables` that depend on them: [{ from, to, constraint, kind }] —
 * foreign keys from other tables (kind 'foreign key'), views and materialized
 * views reading them ('view': pg_depend through their rewrite rules), constraint
 * triggers of other tables referencing them ('trigger') and SQL-standard
 * functions (BEGIN ATOMIC) using them ('function').
 * A restore drops and recreates the module's tables and «Удалить данные» drops
 * them; both would have to CASCADE through such objects (silently removing
 * another table's constraint or view) or fail half-way, so updates and data
 * removal refuse instead. (A plpgsql function body is not tracked by
 * PostgreSQL and cannot be found.)
 */
export async function foreignKeysInto(tables, db = { query }) {
  if (!tables.length) return [];
  const { rows } = await db.query(
    `WITH mod AS (
       SELECT c.oid, c.relname FROM pg_class c
        WHERE c.relnamespace = current_schema()::regnamespace AND c.relname = ANY($1)
     )
     SELECT src.relname AS "from", mod.relname AS "to", c.conname AS "constraint", 'foreign key' AS kind
       FROM pg_constraint c
       JOIN pg_class src ON src.oid = c.conrelid
       JOIN mod ON mod.oid = c.confrelid
      WHERE c.contype = 'f' AND NOT (src.relname = ANY($1))
     UNION
     SELECT v.relname, mod.relname, r.rulename, 'view'
       FROM pg_depend d
       JOIN pg_rewrite r ON d.classid = 'pg_rewrite'::regclass AND r.oid = d.objid
       JOIN pg_class v ON v.oid = r.ev_class
       JOIN mod ON d.refclassid = 'pg_class'::regclass AND mod.oid = d.refobjid
      WHERE v.oid <> mod.oid AND NOT (v.relname = ANY($1))
     UNION
     SELECT src.relname, mod.relname, t.tgname, 'trigger'
       FROM pg_trigger t
       JOIN pg_class src ON src.oid = t.tgrelid
       JOIN mod ON mod.oid = t.tgconstrrelid
      WHERE NOT (src.relname = ANY($1)) AND NOT EXISTS (SELECT 1 FROM pg_constraint fk WHERE fk.oid = t.tgconstraint AND fk.contype = 'f')
     UNION
     SELECT p.proname, mod.relname, p.oid::regprocedure::text, 'function'
       FROM pg_depend d
       JOIN pg_proc p ON d.classid = 'pg_proc'::regclass AND p.oid = d.objid
       JOIN mod ON d.refclassid = 'pg_class'::regclass AND mod.oid = d.refobjid
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

/** Runs pg_dump / pg_restore (credentials in the environment, never in argv); killed after `timeoutMs`. */
function run(cmd, args, { out, timeoutMs = toolTimeoutMs() } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env: pgEnv(), stdio: ['ignore', out ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref?.();
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    if (out) child.stdout.pipe(out);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`${cmd} did not finish within ${Math.round(timeoutMs / 1000)} s`));
      return code === 0 ? resolvePromise() : reject(new Error(`${cmd} failed (${code}): ${stderr.trim()}`));
    });
  });
}

const NDJSON_BATCH = 1000;

/*
 * Data-only backup: one consistent snapshot (REPEATABLE READ, read only), each
 * table read through a cursor NDJSON_BATCH rows at a time, so a big table never
 * sits in memory as a whole. Each table section starts with
 * { "#table": name, "rows": null } (the row count is not known in advance).
 */
async function dumpNdjson(file, tables, header) {
  await withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    async function* lines() {
      yield `${JSON.stringify(header)}\n`;
      for (const [index, table] of tables.entries()) {
        const cursor = `portal_backup_${index}`;
        await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS r FROM ${quoteIdent(table)} t`);
        yield `${JSON.stringify({ '#table': table, rows: null })}\n`;
        for (;;) {
          const { rows } = await client.query(`FETCH ${NDJSON_BATCH} FROM ${cursor}`);
          if (!rows.length) break;
          yield rows.map((row) => `${row.r}\n`).join('');
        }
        await client.query(`CLOSE ${cursor}`);
      }
    }
    await pipeline(Readable.from(lines()), createGzip(), createWriteStream(file, { mode: PRIVATE_FILE }));
  });
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
export async function backupModule({ id, version, manifest = null, reason = 'manual', uploads = false }) {
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
  let format = tables.length > 0 && (await pgDumpAvailable()) ? 'pg_dump' : 'ndjson';
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
  let uploadsPart = null;
  if (uploads) {
    try {
      uploadsPart = await archiveUploads(id, `${base}.uploads.tar.gz`);
    } catch (err) {
      rmSync(file, { force: true });
      rmSync(`${base}.uploads.tar.gz`, { force: true });
      throw new Error(`Backup of ${id} failed: its upload folder could not be archived: ${err.message.split('\n')[0]}`);
    }
  }
  const meta = { id, version, file, format, tables, migrations, reason, createdAt: header.createdAt, bytes: statSync(file).size, ...(uploadsPart ? { uploads: uploadsPart } : {}) };
  writeFileSync(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`, { mode: PRIVATE_FILE });
  await pruneBackups({ keepFile: file }).catch((err) => console.warn(`Module backups: pruning failed: ${err.message}`));
  return meta;
}

const keepPerModule = () => Math.max(1, Number.parseInt(process.env.MODULE_BACKUP_KEEP || '', 10) || 5);
const maxTotalBytes = () => Math.max(1, Number.parseInt(process.env.MODULE_BACKUP_MAX_MB || '', 10) || 2048) * 1024 * 1024;

function removeBackup(meta) {
  rmSync(meta.file, { force: true });
  if (meta.uploads?.file) rmSync(meta.uploads.file, { force: true });
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
  for (const id of readdirSync(root)) if (/^[a-z][a-z0-9_]{1,31}$/.test(id)) for (const meta of listBackups(id)) total += (meta.bytes || 0) + (meta.uploads?.bytes || 0);
  candidates.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const meta of candidates) {
    if (total <= maxTotalBytes()) break;
    removeBackup(meta);
    removed.push(meta.file);
    total -= (meta.bytes || 0) + (meta.uploads?.bytes || 0);
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

/*
 * How rows go back into a table: only the columns that take a value (not GENERATED ALWAYS AS (…)
 * STORED), OVERRIDING SYSTEM VALUE for GENERATED ALWAYS AS IDENTITY, and afterwards every sequence
 * of the table (serial or identity) is set past the restored values.
 */
async function insertPlan(client, table) {
  const { rows } = await client.query(
    `SELECT a.attname, a.attgenerated <> '' AS generated, pg_get_serial_sequence($1, a.attname) AS seq
       FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    [quoteIdent(table)]
  );
  const columns = rows.filter((row) => !row.generated).map((row) => quoteIdent(row.attname)).join(', ');
  return {
    sql: `INSERT INTO ${quoteIdent(table)} (${columns}) OVERRIDING SYSTEM VALUE SELECT ${columns} FROM json_populate_record(NULL::${quoteIdent(table)}, $1::json)`,
    sequences: rows.filter((row) => row.seq).map((row) => ({ column: row.attname, seq: row.seq })),
  };
}

async function resetSequences(client, table, sequences) {
  for (const { column, seq } of sequences) {
    await client.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(${quoteIdent(column)}) FROM ${quoteIdent(table)}), 0) + 1, false)`, [seq]);
  }
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
    let plan = null;
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
        plan = await insertPlan(client, table);
        continue;
      }
      if (!table) throw new Error('backup file is damaged');
      await client.query(plan.sql, [line]);
    }
    for (const name of meta.tables) await resetSequences(client, name, (await insertPlan(client, name)).sequences);
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
  } else await restoreNdjson(meta);
  if (meta.uploads?.file) await restoreUploads(meta);
}

// ── Upload folders ──────────────────────────────────────────────────────────

/** The folder a module keeps its files in: uploads/<id> (UPLOAD_DIR/<id>). */
export function uploadFolderOf(id) {
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(String(id || ''))) throw new Error(`bad module id ${id}`);
  return resolve(uploadRoot, id);
}

/** Files under a folder: { files, bytes } (links are not followed). */
function folderStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    files += 1;
    bytes += statSync(join(entry.parentPath ?? entry.path, entry.name)).size;
  }
  return { files, bytes };
}

/**
 * tar.gz of uploads/<id> (entries `<id>/…`, relative to the upload root) into `file`.
 * null when the module has no upload folder.
 */
export async function archiveUploads(id, file) {
  const dir = uploadFolderOf(id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const stats = folderStats(dir);
  createPrivateFile(file);
  await run('tar', ['-czf', file, '-C', resolve(uploadRoot), id]);
  chmodSync(file, PRIVATE_FILE);
  return { file, folder: id, files: stats.files, sourceBytes: stats.bytes, bytes: statSync(file).size };
}

/** Entry names of a tar.gz (`tar -tzf`). */
function tarEntries(file) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('tar', ['-tzf', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err = (err + chunk).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolvePromise(out.split('\n').filter(Boolean)) : reject(new Error(`tar -t failed (${code}): ${err.trim()}`))));
  });
}

/**
 * Puts the upload folder of a backup back (extracted over uploads/, files of the
 * archive replace files of the same name). Every entry must stay inside
 * `<id>/` — anything else refuses the whole archive.
 */
export async function restoreUploads(meta) {
  const part = meta?.uploads;
  if (!part?.file || !existsSync(part.file)) throw new Error('upload archive not found');
  const id = meta.id;
  uploadFolderOf(id);
  const entries = await tarEntries(part.file);
  const bad = entries.find((name) => {
    const clean = name.replace(/^\.\//, '');
    return !(clean === id || clean === `${id}/` || clean.startsWith(`${id}/`)) || clean.split('/').includes('..');
  });
  if (bad) throw new Error(`upload archive of ${id} holds ${bad}, outside ${id}/`);
  mkdirSync(resolve(uploadRoot), { recursive: true });
  await run('tar', ['-xzf', part.file, '-C', resolve(uploadRoot)]);
}

/** Removes uploads/<id> (after a backup). → { files, bytes } that were there, or null. */
export function removeUploads(id) {
  const dir = uploadFolderOf(id);
  if (!existsSync(dir)) return null;
  const stats = statSync(dir).isDirectory() ? folderStats(dir) : { files: 1, bytes: statSync(dir).size };
  rmSync(dir, { recursive: true, force: true });
  return stats;
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
