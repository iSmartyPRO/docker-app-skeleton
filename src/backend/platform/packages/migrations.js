import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIGRATION_FILE } from './archive.js';
import { installSdkResolver } from '../sdkLoader.mjs';

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

const tablesIn = async (client) => new Set((await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename));

/**
 * Applies the pending migrations of `moduleId`. `transaction(fn)` runs fn(client)
 * in a transaction (config/database.js withTransaction). Returns { applied: [ids], tables: [names] }.
 */
export async function runMigrations({ moduleId, version, migrations, transaction }) {
  if (!migrations.length) return { applied: [], tables: [] };
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`module-migrations:${moduleId}`]);
    const done = new Set((await client.query(`SELECT migration_id FROM module_migrations WHERE module_id = $1`, [moduleId])).rows.map((row) => row.migration_id));
    const applied = [];
    const created = [];
    for (const migration of migrations) {
      if (done.has(migration.id)) continue;
      const before = await tablesIn(client);
      const up = await upOf(migration);
      try {
        await up({ query: (text, params) => client.query(text, params), client, moduleId, version });
      } catch (err) {
        err.message = `migration ${moduleId}/${migration.id} failed: ${err.message}`;
        err.migration = migration.id;
        throw err;
      }
      const after = await tablesIn(client);
      for (const table of after) {
        if (before.has(table)) continue;
        created.push(table);
        await client.query(`INSERT INTO module_tables (module_id, table_name, migration_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [moduleId, table, migration.id]);
      }
      await client.query(`INSERT INTO module_migrations (module_id, migration_id, version, checksum) VALUES ($1, $2, $3, $4)`, [moduleId, migration.id, version || null, migration.checksum || null]);
      applied.push(migration.id);
    }
    return { applied, tables: created };
  });
}
