/*
 * Child process of the installer: loads an unpacked package version the way
 * the portal will after the restart, checks its module contract and (with
 * --migrate) applies its pending migrations — all in one transaction, so a
 * failed migration changes nothing. Running this outside the portal process
 * keeps import side effects of the new code (jobs, hooks) out of the running
 * portal. Prints one JSON line: { ok, applied, tables, migrations } or { ok: false, error }.
 *
 *   node platform/packages/prepare.mjs <id> <version> [--migrate]
 */
import '../../config/app.js';
import { installSdkResolver } from '../sdkLoader.mjs';

installSdkResolver();

const [id, version, mode] = process.argv.slice(2);
const out = (value) => process.stdout.write(`\n@@prepare ${JSON.stringify(value)}\n`);

try {
  const { readManifestAt } = await import('./disk.js');
  const { versionDir } = await import('./paths.js');
  const { importServerEntry, migrationsOf } = await import('./loader.js');
  const { runMigrations } = await import('./migrations.js');
  const { withTransaction, closePool } = await import('../../config/database.js');
  const dir = versionDir(id, version);
  const manifest = readManifestAt(id, version);
  const module = await importServerEntry(dir, manifest);
  const migrations = migrationsOf(dir, module);
  let result = { applied: [], tables: [] };
  if (mode === '--migrate') {
    if (migrations.length) result = await runMigrations({ moduleId: id, version, migrations, transaction: withTransaction });
    else if (typeof module.schema === 'function') await module.schema();
  }
  await closePool();
  out({ ok: true, ...result, migrations: migrations.map((item) => item.id), exports: Object.keys(module) });
  process.exit(0);
} catch (err) {
  out({ ok: false, error: err.message, migration: err.migration || null });
  process.exit(1);
}
