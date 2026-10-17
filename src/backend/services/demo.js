import { getPool, query } from '../config/database.js';
import { runDemoSeed } from './demoScope.js';
import { getSetting, setSetting } from './settings.js';
import { NO_PASSWORD } from './rbac.js';
import { MODULE_MANIFEST, dependencyOrder } from '../modules/manifest.js';
import { localeOrDefault, pick } from './i18n/index.js';

/*
 * Demo data (spec §8, docs/extending.md «Demo data»).
 *
 * A module registers what it can fill:
 *
 *   registerDemo({
 *     module: 'tasks',
 *     describe: { en: 'A project with eight tasks…', ru: '…' },
 *     after: ['companies'],            // optional: seed after these (when they are seeded too)
 *     async seed(ctx) {                // create records, track each one
 *       const project = await createProject(ctx.as('tasks.admin'), {...}, {...});
 *       await ctx.track('task_projects', project.id);
 *     },
 *     async purge(ctx) { … },          // optional: clean up what a plain DELETE would miss
 *   });
 *
 * `seedable: false` registers only the explanation (`describe`) for a module
 * that cannot have demo data (Drive needs a real SMB server): the Modules
 * page shows the text without a «fill» button and «Демо всего портала»
 * passes over it.
 *
 * Every demo row is listed in `demo_records (module, table_name, record_key)`.
 * The registry works with any existing table and with foreign keys: nothing
 * is added to module tables, and «Удалить демо-данные» deletes exactly the
 * tracked rows, newest first (children before parents; ON DELETE CASCADE
 * children go with their parent). A row that real data still points at with
 * a restricting foreign key is kept (and stays tracked), never forced.
 * Note: records people add *inside* a demo container (a real task in a demo
 * project) go with it when the container cascades — purge before real use.
 *
 * Demo users (ctx.demoUser) are shared by the modules: they are tracked under
 * the pseudo-module `_users` and removed with the last module's demo data.
 */

const USERS = '_users';
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const STATE_KEY = 'demo_state';
const registry = new Map();

export function registerDemo(definition) {
  const { module, seed } = definition || {};
  if (!module || typeof seed !== 'function') throw new Error('registerDemo needs { module, seed }');
  registry.set(module, { after: [], describe: null, purge: null, ...definition });
}

export const demoRegistry = () => registry;

export async function ensureDemoSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS demo_records (
      seq BIGSERIAL PRIMARY KEY,
      module VARCHAR(40) NOT NULL,
      table_name VARCHAR(63) NOT NULL,
      record_key TEXT NOT NULL,
      key_column VARCHAR(63) NOT NULL DEFAULT 'id',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (module, table_name, record_key)
    )
  `);
}

const httpError = (status, message, code) => Object.assign(new Error(message), { statusCode: status, code });

/** { module: { table: count } } of everything tracked. */
export async function demoCounts() {
  const { rows } = await query(`SELECT module, table_name, COUNT(*)::int AS n FROM demo_records GROUP BY module, table_name ORDER BY module, table_name`);
  const out = {};
  for (const row of rows) (out[row.module] ||= {})[row.table_name] = row.n;
  return out;
}

async function refreshState() {
  const counts = await demoCounts();
  const modules = Object.keys(counts).filter((id) => id !== USERS);
  const state = { active: modules.length > 0 || Boolean(counts[USERS]), modules, updatedAt: new Date().toISOString() };
  await setSetting(STATE_KEY, JSON.stringify(state));
  return state;
}

export async function demoState() {
  try {
    return JSON.parse((await getSetting(STATE_KEY, '')) || '{}');
  } catch {
    return {};
  }
}

async function track(module, table, key, keyColumn = 'id') {
  if (!IDENT.test(table) || !IDENT.test(keyColumn)) throw new Error(`Bad demo table "${table}"`);
  if (key === null || key === undefined || key === '') throw new Error(`Demo record of ${table} without a key`);
  await query(
    `INSERT INTO demo_records (module, table_name, record_key, key_column) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [module, table, String(key), keyColumn]
  );
}

async function recordsOf(module, table) {
  const { rows } = await query(`SELECT record_key FROM demo_records WHERE module = $1 AND table_name = $2 ORDER BY seq`, [module, table]);
  return rows.map((row) => (/^\d+$/.test(row.record_key) ? Number(row.record_key) : row.record_key));
}

/**
 * A clearly marked demo user: username demo.<key>, e-mail demo.<key>@example.com,
 * no password (cannot sign in). Reused while tracked; a real account that
 * happens to have the name is never touched (a suffix is added instead).
 */
async function demoUser(key, { displayName } = {}) {
  const base = `demo.${String(key).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) || 'user'}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = attempt ? `${base}${attempt + 1}` : base;
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (existing.rows[0]) {
      const tracked = await query(`SELECT 1 FROM demo_records WHERE module = $1 AND table_name = 'users' AND record_key = $2`, [USERS, String(existing.rows[0].id)]);
      if (tracked.rows.length) return existing.rows[0].id;
      continue;
    }
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
      [username, `${username}@example.com`, NO_PASSWORD, String(displayName || username).slice(0, 120)]
    );
    await track(USERS, 'users', rows[0].id);
    return rows[0].id;
  }
  throw new Error(`No free demo user name for ${base}`);
}

/**
 * The context a seed / purge gets. `request`: the superadministrator's
 * request (req.user, req.access, req.locale) — module services take their
 * context from it. `as()` returns it (kept as a hook for narrower identities).
 */
function contextFor(module, req) {
  const locale = localeOrDefault(req?.locale);
  return {
    module,
    locale,
    userId: req?.user?.id || null,
    request: req,
    query,
    /**
     * Picks the text in the portal language: ctx.t({ ru, en, ky, … }), English
     * when the language has none. A string passes as is.
     */
    t: (value) => (value && typeof value === 'object' && !Array.isArray(value) ? pick(value, locale) : value),
    track: (table, key, keyColumn) => track(module, table, key, keyColumn),
    /** Stops tracking a row (it stays): e.g. an administrator has made it their own since. */
    untrack: (table, key) => query(`DELETE FROM demo_records WHERE module = $1 AND table_name = $2 AND record_key = $3`, [module, table, String(key)]),
    records: (table, of = module) => recordsOf(of, table),
    demoUser,
    /** Days from today as a Date (time of day kept from `at`, "HH:MM", in the server zone). */
    day: (offset, at = '10:00') => {
      const date = new Date();
      const [h, m] = at.split(':').map(Number);
      date.setDate(date.getDate() + offset);
      date.setHours(h, m || 0, 0, 0);
      return date;
    },
  };
}

/** Deletes tracked rows newest first; returns { deleted, kept }. */
async function deleteTracked(module) {
  const { rows } = await query(`SELECT seq, table_name, record_key, key_column FROM demo_records WHERE module = $1 ORDER BY seq DESC`, [module]);
  let deleted = 0;
  let kept = 0;
  const exists = new Map();
  const tableExists = async (table) => {
    if (!exists.has(table)) exists.set(table, Boolean((await query(`SELECT to_regclass($1) AS t`, [table])).rows[0]?.t));
    return exists.get(table);
  };
  // Consecutive rows of one table go in one statement.
  const batches = [];
  for (const row of rows) {
    const last = batches[batches.length - 1];
    if (last && last.table === row.table_name && last.column === row.key_column) last.rows.push(row);
    else batches.push({ table: row.table_name, column: row.key_column, rows: [row] });
  }
  for (const batch of batches) {
    if (!IDENT.test(batch.table) || !IDENT.test(batch.column)) continue;
    const forget = async (list) => query(`DELETE FROM demo_records WHERE seq = ANY($1::bigint[])`, [list.map((row) => row.seq)]);
    if (!(await tableExists(batch.table))) {
      await forget(batch.rows);
      continue;
    }
    const keys = batch.rows.map((row) => row.record_key);
    const sql = `DELETE FROM "${batch.table}" WHERE "${batch.column}"::text = ANY($1::text[])`;
    try {
      const result = await query(sql, [keys]);
      deleted += result.rowCount;
      await forget(batch.rows);
    } catch (err) {
      if (err.code !== '23503') throw err;
      // Something real points at some of them: delete one by one, keep the rest.
      for (const row of batch.rows) {
        try {
          const result = await query(sql, [[row.record_key]]);
          deleted += result.rowCount;
          await forget([row]);
        } catch (inner) {
          if (inner.code !== '23503') throw inner;
          kept += 1;
        }
      }
    }
  }
  return { deleted, kept };
}

async function hasRecords(module) {
  const { rows } = await query(`SELECT 1 FROM demo_records WHERE module = $1 LIMIT 1`, [module]);
  return rows.length > 0;
}

async function purgeUsersIfAlone() {
  const { rows } = await query(`SELECT 1 FROM demo_records WHERE module <> $1 LIMIT 1`, [USERS]);
  if (rows.length) return { deleted: 0, kept: 0 };
  return deleteTracked(USERS);
}

/*
 * One seed or purge of a module at a time (two administrators pressing
 * «Заполнить» together, two app instances): a session advisory lock per
 * module, held on its own connection while the work runs on the pool.
 */
async function withModuleLock(module, fn) {
  const client = await getPool().connect();
  const key = `demo:${module}`;
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [key]);
    try {
      return await fn();
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** Fills one module. Already filled → nothing happens ({ already: true }). */
export async function seedModule(module, req) {
  const definition = registry.get(module);
  if (!definition) throw httpError(404, 'This module has no demo data', 'NO_DEMO');
  if (definition.seedable === false) return { module, already: false, skipped: true, counts: {} };
  return withModuleLock(module, async () => {
    if (await hasRecords(module)) return { module, already: true, counts: (await demoCounts())[module] || {} };
    const ctx = contextFor(module, req);
    try {
      // Real people are not notified about demo documents while it runs (services/demoScope.js).
      await runDemoSeed(module, () => definition.seed(ctx));
    } catch (err) {
      // A half-made demo is taken back: everything tracked so far is removed.
      await purgeUnlocked(module, req).catch(() => {});
      throw err;
    }
    await refreshState();
    return { module, already: false, counts: (await demoCounts())[module] || {} };
  });
}

/** Removes one module's demo rows (and the demo users once no module has any). */
export async function purgeModule(module, req) {
  return withModuleLock(module, () => purgeUnlocked(module, req));
}

async function purgeUnlocked(module, req) {
  const definition = registry.get(module);
  const ctx = contextFor(module, req);
  const tracked = async (id) => Number((await query(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = $1`, [id])).rows[0].n);
  const before = await tracked(module);
  if (definition?.purge && before) await definition.purge(ctx);
  // A module's own purge may delete rows itself: what is gone counts as removed.
  const result = await deleteTracked(module);
  const usersBefore = module === USERS ? 0 : await tracked(USERS);
  const users = await purgeUsersIfAlone();
  await refreshState();
  return { module, removed: before - result.kept, users: users.deleted ? usersBefore - users.kept : 0, kept: result.kept + users.kept };
}

/** Seeding order: requirements first, then `after` hints, then the given order. */
export function seedOrder(modules) {
  const base = dependencyOrder(modules, MODULE_MANIFEST);
  const out = [];
  const place = (id, seen = new Set()) => {
    if (out.includes(id) || seen.has(id)) return;
    seen.add(id);
    for (const before of registry.get(id)?.after || []) if (modules.includes(before)) place(before, seen);
    out.push(id);
  };
  base.forEach((id) => place(id));
  return out;
}

/** «Демо всего портала»: every enabled module that has demo data, in dependency order. */
export async function seedAll(enabledIds, req) {
  const modules = seedOrder(enabledIds.filter((id) => registry.has(id) && registry.get(id).seedable !== false));
  const results = [];
  for (const module of modules) results.push(await seedModule(module, req));
  return results;
}

export async function purgeAll(req) {
  const counts = await demoCounts();
  const modules = Object.keys(counts).filter((id) => id !== USERS);
  // Dependents first: the reverse of the seeding order.
  const results = [];
  for (const module of seedOrder(modules).reverse()) results.push(await purgeModule(module, req));
  if (!modules.length) await purgeModule(USERS, req);
  await refreshState();
  return results;
}

/** For GET /api/admin/demo and the Modules page. */
export async function demoOverview(modules = Object.keys(MODULE_MANIFEST)) {
  const counts = await demoCounts();
  const state = await demoState();
  return {
    active: Boolean(state.active),
    users: Object.values(counts[USERS] || {}).reduce((sum, n) => sum + n, 0),
    modules: modules
      .filter((id) => registry.has(id) || counts[id])
      .map((id) => ({
        module: id,
        available: registry.has(id),
        seedable: registry.has(id) && registry.get(id).seedable !== false,
        describe: registry.get(id)?.describe || null,
        seeded: Boolean(counts[id]),
        counts: counts[id] || {},
        total: Object.values(counts[id] || {}).reduce((sum, n) => sum + n, 0),
      })),
  };
}
