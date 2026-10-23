import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import config from '../../config/app.js';
import { query, withTransaction } from '../../config/database.js';
import { appliedMigrations, recordedTables } from './store.js';
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
 * structure) when pg_dump is available in the container (the image installs
 * postgresql-client); otherwise a gzip NDJSON file (<file>.ndjson.gz) with the
 * rows of each table (row_to_json), which restores data into tables of the
 * same structure. Next to each backup, <file>.json describes it.
 *
 *   $MODULES_DIR/.backups/<id>/<id>-<version>-<UTC stamp>-<reason>.{dump|ndjson.gz,json}
 */

const SAFE_TABLE = /^[a-z_][a-z0-9_]{0,62}$/;
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

let pgDumpChecked = null;
/** True when pg_dump / pg_restore can be run (MODULE_BACKUP_PGDUMP=0 forces the NDJSON format). */
export function pgDumpAvailable() {
  if (process.env.MODULE_BACKUP_PGDUMP === '0') return false;
  if (pgDumpChecked === null) {
    const probe = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
    pgDumpChecked = probe.status === 0;
  }
  return pgDumpChecked;
}

/** Tables of a module that exist now, from module_tables and the manifest `tables` patterns. */
export async function moduleTables(id, manifest = null, db = { query }) {
  const names = new Set(await recordedTables(id, db));
  const patterns = (manifest?.tables || []).filter(Boolean);
  const existing = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename);
  for (const pattern of patterns) {
    const prefix = /[%*]$/.test(pattern) ? pattern.slice(0, -1) : null;
    for (const table of existing) if (prefix != null ? table.startsWith(prefix) : table === pattern) names.add(table);
  }
  const live = new Set(existing);
  // Platform tables are never a module's.
  for (const own of ['installed_modules', 'module_migrations', 'module_tables']) names.delete(own);
  return [...names].filter((table) => live.has(table) && SAFE_TABLE.test(table)).sort();
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
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(file));
}

/**
 * Backs up the module's tables. Returns the description written next to it:
 * { id, version, file, format, tables, migrations, reason, createdAt, bytes }.
 * A module without tables still gets a (small) backup, so the rule «data is
 * removed only after a fresh backup» holds.
 */
export async function backupModule({ id, version, manifest = null, reason = 'manual' }) {
  const dir = resolve(backupsDir(), id);
  mkdirSync(dir, { recursive: true });
  const tables = await moduleTables(id, manifest);
  const migrations = (await appliedMigrations(id)).map((row) => row.migration_id);
  const base = join(dir, `${id}-${version || '0.0.0'}-${stamp()}-${String(reason).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'manual'}`);
  const usePgDump = tables.length > 0 && pgDumpAvailable();
  const file = usePgDump ? `${base}.dump` : `${base}.ndjson.gz`;
  const header = { format: 'portal-module-backup', formatVersion: 1, module: id, version, tables, migrations, createdAt: new Date().toISOString() };
  try {
    if (usePgDump) {
      await run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', ...tables.flatMap((table) => ['-t', quoteIdent(table)]), '-f', file]);
    } else {
      await dumpNdjson(file, tables, header);
    }
  } catch (err) {
    rmSync(file, { force: true });
    throw new Error(`Backup of ${id} failed: ${err.message}`);
  }
  const meta = { id, version, file, format: usePgDump ? 'pg_dump' : 'ndjson', tables, migrations, reason, createdAt: header.createdAt, bytes: statSync(file).size };
  writeFileSync(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
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
 * tables (structure and data) and put module_migrations back as it was;
 * NDJSON backups refill tables of the same structure.
 */
export async function restoreBackup(meta) {
  if (!meta?.file || !existsSync(meta.file)) throw new Error('backup file not found');
  if (meta.format === 'pg_dump') {
    await run('pg_restore', ['--clean', '--if-exists', '--single-transaction', '--no-owner', '--no-privileges', '-d', String(config.postgres.database || ''), meta.file]);
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM module_migrations WHERE module_id = $1 AND NOT (migration_id = ANY($2))`, [meta.id, meta.migrations || []]);
    });
    return;
  }
  await restoreNdjson(meta);
}

/** Drops the module's tables and forgets its migrations (after a backup — the installer makes one first). */
export async function dropModuleData(id, manifest = null) {
  const tables = await moduleTables(id, manifest);
  await withTransaction(async (client) => {
    if (tables.length) await client.query(`DROP TABLE IF EXISTS ${tables.map(quoteIdent).join(', ')}`);
    await client.query(`DELETE FROM module_tables WHERE module_id = $1`, [id]);
    await client.query(`DELETE FROM module_migrations WHERE module_id = $1`, [id]);
  });
  return tables;
}
