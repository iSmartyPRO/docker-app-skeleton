import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIGRATION_FILE } from './archive.js';
import { installSdkResolver } from '../sdkLoader.mjs';
import { MODULE_TABLES } from './tableOwnership.js';

/*
 * Versioned migrations of a module (spec §6 stage 2, docs/module-packages.md «Migrations»).
 *
 *   migrations/001_init.sql, 002_add_index.js, …   in a package (NNN_name, NNN unique)
 *   migrations: [{ id: '001_init', up: async (db) => {} }]   or in the server module itself
 *
 * Each migration runs once per module (module_migrations). All migrations that
 * are pending for one install / update / boot run in ONE transaction: if any
 * fails, the database is left exactly as it was and nothing is recorded. A JS
 * migration exports `up(db)` (named, or default { up } / default function);
 * `db.query(text, params)` runs inside that transaction. Tables created by a
 * migration are recorded in module_tables (backups, «Удалить данные»).
 * No CREATE INDEX CONCURRENTLY and the like: they cannot run in a transaction.
 */

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Migrations of an unpacked package folder, ordered by number. */
export function packageMigrations(dir) {
  const folder = join(dir, 'migrations');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort()
    .map((name) => {
      const file = join(folder, name);
      const text = readFileSync(file, 'utf8');
      const id = name.replace(/\.(sql|js)$/, '');
      return name.endsWith('.sql') ? { id, sql: text, checksum: sha(text) } : { id, file, checksum: sha(text) };
    });
}

/** Normalizes a module's own `migrations` export ([{ id, up }] or [{ id, sql }]). */
export function inlineMigrations(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (!item || typeof item.id !== 'string' || !/^\d{3}_[a-z0-9_]+$/.test(item.id)) throw new Error(`migration id "${item?.id}" must look like 001_name`);
    if (typeof item.up !== 'function' && typeof item.sql !== 'string') throw new Error(`migration ${item.id} needs up(db) or sql`);
    return { id: item.id, ...(item.sql ? { sql: item.sql } : { up: item.up }), checksum: sha(item.sql || String(item.up)) };
  });
}

/** Merges folder and inline migrations, sorted by id; the same id twice is an error. */
export function mergeMigrations(...lists) {
  const byId = new Map();
  for (const item of lists.flat()) {
    if (byId.has(item.id)) throw new Error(`migration ${item.id} is defined twice`);
    const number = item.id.slice(0, 3);
    for (const other of byId.keys()) if (other.slice(0, 3) === number) throw new Error(`migrations ${other} and ${item.id} share the number ${number}`);
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function upOf(migration) {
  if (migration.up) return migration.up;
  if (migration.sql != null) return (db) => db.query(migration.sql);
  installSdkResolver();
  const mod = await import(pathToFileURL(migration.file).href);
  const up = mod.up || mod.default?.up || (typeof mod.default === 'function' ? mod.default : null);
  if (typeof up !== 'function') throw new Error(`migration ${migration.id} does not export up(db)`);
  return up;
}

// Tables whose catalog row this transaction wrote: created (or altered) by it. A table another
// connection committed meanwhile has a different xmin, so it is never taken for the module's.
const XACT_TABLES = `SELECT c.relname FROM pg_class c
  WHERE c.relnamespace = current_schema()::regnamespace AND c.relkind IN ('r', 'p')
    AND c.xmin::text = (pg_current_xact_id()::text::bigint % 4294967296)::text`;
const tablesIn = async (client) => new Set((await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename));
const tablesOfThisTransaction = async (client) => (await client.query(XACT_TABLES)).rows.map((row) => row.relname);
/** Prefixes a module's tables always have ("<id>_" and the legacy ones the core declares, e.g. mp_). */
const ownPrefixes = (moduleId) => [`${moduleId}_`, ...(MODULE_TABLES[moduleId] || []).filter((entry) => entry.endsWith('_'))];

const migrationError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

/**
 * Applied migrations of the module that this set of migrations contradicts:
 * ones it does not have (the database is newer than this version: SCHEMA_NEWER)
 * and SQL migrations whose text changed since they ran (MIGRATION_CHANGED).
 * JS migrations are bundled by the build, so their text may change between
 * builds without a change of meaning: their checksum is recorded, not compared.
 */
export function migrationConflicts(moduleId, migrations, applied) {
  const known = new Set(migrations.map((item) => item.id));
  const newer = [...applied.keys()].filter((id) => !known.has(id)).sort();
  if (newer.length) {
    return migrationError('SCHEMA_NEWER', `the database of ${moduleId} already has migrations ${newer.join(', ')} that this version does not have (it is older than the database)`, { migrations: newer });
  }
  for (const migration of migrations) {
    const was = applied.get(migration.id);
    if (migration.sql != null && was && migration.checksum && was !== migration.checksum) {
      return migrationError('MIGRATION_CHANGED', `migration ${moduleId}/${migration.id} was changed after it ran (an applied migration must never be edited)`, { migration: migration.id });
    }
  }
  return null;
}

/**
 * Applies the pending migrations of `moduleId`. `transaction(fn)` runs fn(client)
 * in a transaction (config/database.js withTransaction). Returns { applied: [ids], tables: [names] }.
 * `strict` (install / update): a version older than the database, or an applied
 * SQL migration whose text changed, is refused (migrationConflicts); at boot it is
 * only reported (a rollback deliberately runs the previous code).
 * A migration that cannot be loaded or fails throws with err.migration set (MIGRATION_FAILED).
 */
export async function runMigrations({ moduleId, version, migrations, transaction, strict = false }) {
  if (!migrations.length) return { applied: [], tables: [] };
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`module-migrations:${moduleId}`]);
    const done = new Map((await client.query(`SELECT migration_id, checksum FROM module_migrations WHERE module_id = $1`, [moduleId])).rows.map((row) => [row.migration_id, row.checksum]));
    const conflict = migrationConflicts(moduleId, migrations, done);
    if (conflict && strict) throw conflict;
    if (conflict) console.warn(`Module ${moduleId}: ${conflict.message}`);
    if (migrations.every((migration) => done.has(migration.id))) return { applied: [], tables: [] };
    // Tables that existed when the transaction began (an ALTER makes them «written by» it too).
    const existing = await tablesIn(client);
    const applied = [];
    const created = [];
    const prefixes = ownPrefixes(moduleId);
    for (const migration of migrations) {
      if (done.has(migration.id)) continue;
      // Per-migration snapshot (under the advisory lock): a table created in a subtransaction
      // (DO … EXCEPTION, SAVEPOINT) has the subtransaction's xmin, not this transaction's, so XACT_TABLES
      // misses it; new tables with the module's own prefixes are taken from the snapshot difference.
      const before = await tablesIn(client);
      try {
        const up = await upOf(migration);
        await up({ query: (text, params) => client.query(text, params), client, moduleId, version });
      } catch (err) {
        err.message = `migration ${moduleId}/${migration.id} failed: ${err.message}`;
        err.migration = migration.id;
        throw err;
      }
      const appeared = [...(await tablesIn(client))].filter((table) => !before.has(table) && prefixes.some((prefix) => table.startsWith(prefix)));
      for (const table of new Set([...(await tablesOfThisTransaction(client)), ...appeared])) {
        if (existing.has(table) || created.includes(table)) continue;
        created.push(table);
        await client.query(`INSERT INTO module_tables (module_id, table_name, migration_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [moduleId, table, migration.id]);
      }
      await client.query(`INSERT INTO module_migrations (module_id, migration_id, version, checksum) VALUES ($1, $2, $3, $4)`, [moduleId, migration.id, version || null, migration.checksum || null]);
      applied.push(migration.id);
    }
    return { applied, tables: created };
  });
}
