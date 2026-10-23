/*
 * Databases of the package kit (wh-test-pg only — assertTestDatabase): throw-away databases it
 * creates and drops itself, and snapshots of a module's data.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checksumSql, isKitDatabaseName, matchesPatterns, quoteIdent, tablePatterns } from './pure.mjs';

export function backendRequire(backendDir) {
  return createRequire(join(backendDir, 'package.json'));
}

export class Db {
  constructor(backendDir, creds) {
    this.pg = backendRequire(backendDir)('pg');
    this.creds = creds;
    this.created = new Set();
    this.backendDir = backendDir;
  }

  client(database = this.creds.database) {
    const { host, port, user, password } = this.creds;
    return new this.pg.Client({ host, port, user, password, database, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 });
  }

  async with(database, fn) {
    const client = this.client(database);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }

  /** The server is the test container: it must answer and not be a production database name. */
  async probe() {
    return this.with(this.creds.database, async (c) => (await c.query(`SELECT version() AS v, current_user AS u`)).rows[0]);
  }

  async createDatabase(name) {
    if (!isKitDatabaseName(name)) throw new Error(`not a kit database name: ${name}`);
    await this.with(this.creds.database, (c) => c.query(`CREATE DATABASE ${quoteIdent(name)}`));
    this.created.add(name);
    return name;
  }

  /** Drops a database this run created (never another one). */
  async dropDatabase(name) {
    if (!this.created.has(name) || !isKitDatabaseName(name)) return false;
    await this.with(this.creds.database, async (c) => {
      await c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [name]);
      await c.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
    });
    this.created.delete(name);
    return true;
  }

  async dropAll() {
    const errors = [];
    for (const name of [...this.created]) await this.dropDatabase(name).catch((err) => errors.push(`${name}: ${err.message}`));
    return errors;
  }
}

let ownership = null;
async function tableOwnership(backendDir) {
  ownership ||= await import(pathToFileURL(join(backendDir, 'platform/packages/tableOwnership.js')).href);
  return ownership;
}

/** Tables of the module that exist now, by the platform's own rules (backup.js moduleTables). */
export async function moduleTableNames(client, backendDir, id, manifestTables = []) {
  const { MODULE_TABLES, mayOwnTable } = await tableOwnership(backendDir);
  const patterns = tablePatterns(id, manifestTables, MODULE_TABLES[id] || []);
  const existing = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).rows.map((row) => row.tablename);
  const recorded = await client.query(`SELECT table_name FROM module_tables WHERE module_id = $1`, [id]).then((r) => r.rows.map((row) => row.table_name)).catch(() => []);
  const names = new Set(existing.filter((table) => matchesPatterns(table, patterns)));
  for (const table of recorded) if (existing.includes(table)) names.add(table);
  return [...names].filter((table) => mayOwnTable(id, table)).sort();
}

export async function allTables(client) {
  return (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`)).rows.map((row) => row.tablename);
}

const json = (value) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return value;
  }
};

/**
 * Everything of the module that must survive conversions, updates and removals:
 *   tables      { name: { rows, sum } } of its tables
 *   settings    the stored settings.modules.<id> block
 *   appSettings app_settings keys "<id>_…" (flags the module writes itself)
 *   roles       { roleKey: [its <id>.* permissions] }
 *   layouts     personal dashboards and the starting layout, as stored (widgets of the module included)
 *   files       count + digest of its upload folders (UPLOAD_DIR/<id>)
 * `ignoreTables` are left out (e.g. the kit's probe table).
 */
/** Files of the module's upload folders: { count, bytes, digest } of every path + size + sha256. */
export function filesDigest(uploadDir, folders) {
  const lines = [];
  let bytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else if (info.isFile()) {
        bytes += info.size;
        lines.push(`${relative(uploadDir, path)} ${info.size} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
      }
    }
  };
  for (const folder of folders) if (uploadDir && existsSync(join(uploadDir, folder))) walk(join(uploadDir, folder));
  return { count: lines.length, bytes, digest: createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16) };
}

export async function snapshot(client, backendDir, id, { manifestTables = [], ignoreTables = [], uploadDir = null, uploadFolders = [id] } = {}) {
  const names = (await moduleTableNames(client, backendDir, id, manifestTables)).filter((name) => !ignoreTables.includes(name));
  const tables = {};
  for (const name of names) tables[name] = (await client.query(checksumSql(name))).rows[0];
  const modulesRow = (await client.query(`SELECT value FROM app_settings WHERE key = 'modules'`).catch(() => ({ rows: [] }))).rows[0];
  const settings = modulesRow ? json(modulesRow.value)?.[id] ?? null : null;
  const appSettings = Object.fromEntries((await client.query(`SELECT key, value FROM app_settings WHERE key LIKE $1 ORDER BY key`, [`${id.replace(/_/g, '\\_')}\\_%`]).catch(() => ({ rows: [] }))).rows.map((row) => [row.key, row.value]));
  const roles = {};
  for (const row of (await client.query(`SELECT key, permissions FROM app_roles ORDER BY key`).catch(() => ({ rows: [] }))).rows) {
    const own = (row.permissions || []).filter((perm) => perm.startsWith(`${id}.`)).sort();
    if (own.length) roles[row.key] = own;
  }
  // Widgets by id: a save may append parked widgets after the visible ones (mergeParked); the set is what must survive.
  const byId = (list) => (Array.isArray(list) ? [...list].sort((a, b) => String(a?.id).localeCompare(String(b?.id))) : list);
  const layouts = {};
  for (const row of (await client.query(`SELECT u.username, l.widgets FROM dash_layouts l JOIN users u ON u.id = l.user_id ORDER BY u.username`).catch(() => ({ rows: [] }))).rows) layouts[row.username] = byId(json(row.widgets));
  const def = (await client.query(`SELECT widgets FROM dash_default WHERE id = 1`).catch(() => ({ rows: [] }))).rows[0];
  if (def) layouts['(starting layout)'] = byId(json(def.widgets));
  const files = filesDigest(uploadDir, uploadFolders);
  return { meta: { at: new Date().toISOString(), tableCount: names.length, rows: Object.values(tables).reduce((n, t) => n + t.rows, 0) }, tables, settings, appSettings, roles, layouts, files };
}

export async function packageRow(client, id) {
  return (await client.query(`SELECT id, version, state, source, error, previous_version, pending_check, last_rollback FROM installed_modules WHERE id = $1`, [id]).catch(() => ({ rows: [] }))).rows[0] || null;
}

export async function appliedMigrations(client, id) {
  return (await client.query(`SELECT migration_id FROM module_migrations WHERE module_id = $1 ORDER BY migration_id`, [id]).catch(() => ({ rows: [] }))).rows.map((row) => row.migration_id);
}
