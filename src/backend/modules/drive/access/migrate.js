import { isDeepStrictEqual } from 'node:util';
import { query, withTransaction } from '../../../config/database.js';
import { invalidateSettings } from '../../../services/settings.js';
import { DRIVE_ACCESS_DEFAULTS, sanitizeDriveAccess } from '../settings.js';
import { cleanPrefixes } from './naming.js';

/*
 * From the separate «Доступ к папкам» module (≤ v1.4, id `folderaccess`) to the
 * File server's access block. Runs in the package's migration 001 (a portal upgraded
 * from ≤ v1.4 straight to the package still has the old data) and once a day after
 * that (the `drive:folderaccess` job: a step that failed is retried), is idempotent
 * and does not destroy anything the old version needs (a rollback to v1.4 keeps working):
 *
 *   0. the old block is copied once to its own settings key `legacy_folderaccess`
 *      (a save of Settings → Modules rewrites `modules` from the catalog and would
 *      drop modules.folderaccess; the copy survives it, so a failed step 2 is retried
 *      from the copy at the next start);
 *   1. journal: fa_journal → drive_access_journal with its indexes and sequence, in one
 *      transaction (rows, ids and links kept);
 *   2. settings: the old block → modules.drive.settings.access (enabled carried over;
 *      drive letters → path prefixes of the shares: W + share 2 → share 2 gets "W:";
 *      extra accepted org codes → aliases of the main one, e.g. { wh: 'co' }), in one
 *      transaction that reads `modules` FOR UPDATE; done once (the copy is marked
 *      migratedAt). modules.folderaccess itself is left in place;
 *   3. roles: drive.access is added wherever folderaccess.groups is (the old one stays).
 * Steps 0–2 hold one advisory lock, so two instances starting together take turns.
 */

export const LEGACY_KEY = 'legacy_folderaccess';
const LOCK = 'drive-access-migration';
const lock = (client) => client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [LOCK]);
const UPSERT = `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;

export const OLD_PERMISSION = 'folderaccess.groups';
export const NEW_PERMISSION = 'drive.access';

/**
 * Pure: the old module's state ({ enabled, settings }) → { access, prefixes: [{ shareId, prefix }] }.
 * orgCodes become the project allow-list, orgCode the default project, {org} → {project}.
 */
export function convertFolderAccess(old = {}) {
  const settings = old && typeof old.settings === 'object' && old.settings ? old.settings : {};
  const access = sanitizeDriveAccess(DRIVE_ACCESS_DEFAULTS, {
    enabled: old?.enabled === true,
    prefix: settings.prefix,
    projects: Array.isArray(settings.orgCodes) ? settings.orgCodes : undefined,
    defaultProject: settings.orgCode,
    projectAliases: aliasesOf(settings),
    nameTemplate: typeof settings.nameTemplate === 'string' ? settings.nameTemplate.replace('{org}', '{project}') : undefined,
    groupsBase: settings.groupsBase,
    newGroupOu: settings.newGroupOu,
    subjectsBase: settings.subjectsBase,
    typeMap: settings.typeMap,
    protectedGroups: settings.protectedGroups,
    otherGroups: settings.otherGroups,
  });
  const prefixes = [];
  for (const row of Array.isArray(settings.driveMap) ? settings.driveMap : []) {
    const letter = String(row?.letter || '').replace(':', '').trim().toUpperCase();
    const shareId = Number(row?.shareId);
    if (/^[A-Z]$/.test(letter) && Number.isInteger(shareId) && shareId > 0) prefixes.push({ shareId, prefix: `${letter}:` });
  }
  return { access, prefixes };
}

/** The old module created every pair with orgCode; its other accepted codes now point there ({ wh: 'co' }). */
function aliasesOf(settings) {
  const main = String(settings.orgCode || '').trim().toLowerCase();
  if (!main) return undefined;
  const codes = Array.isArray(settings.orgCodes) ? settings.orgCodes : [];
  return Object.fromEntries(codes.map((code) => String(code || '').trim().toLowerCase()).filter((code) => code && code !== main).map((code) => [code, main]));
}

const parse = (value) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}') || {};
  } catch {
    return {};
  }
};

/** 0. A copy of the old block in its own key, written once. `transaction(fn)` gives fn a client. → true when written. */
export async function saveLegacyCopy(transaction = withTransaction) {
  return transaction(async (client) => {
    await lock(client);
    const row = (await client.query(`SELECT value FROM app_settings WHERE key = 'modules' FOR UPDATE`)).rows[0];
    const modules = row ? parse(row.value) : {};
    if (!Object.hasOwn(modules, 'folderaccess')) return false;
    const copy = { savedAt: new Date().toISOString(), migratedAt: null, folderaccess: modules.folderaccess };
    const { rowCount } = await client.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [LEGACY_KEY, JSON.stringify(copy)]);
    return rowCount > 0;
  });
}

/** 1. The journal table: renamed once with its indexes and sequence, all or nothing. */
export async function migrateJournal(transaction = withTransaction) {
  return transaction(async (client) => {
    await lock(client);
    const { rows } = await client.query(`SELECT to_regclass('public.fa_journal') AS old, to_regclass('public.drive_access_journal') AS new`);
    const { old, new: current } = rows[0] || {};
    if (!old) return 'none';
    if (current) {
      // Both exist (a start of the new version created an empty table before the old one was renamed?):
      // the old one wins only when the new one is still empty.
      const count = Number((await client.query(`SELECT COUNT(*)::int AS n FROM drive_access_journal`)).rows[0]?.n || 0);
      if (count) {
        console.warn('Drive access: both fa_journal and drive_access_journal exist; fa_journal is left as it is');
        return 'kept';
      }
      await client.query(`DROP TABLE drive_access_journal`);
    }
    await client.query(`ALTER TABLE fa_journal RENAME TO drive_access_journal`);
    for (const suffix of ['at_idx', 'user_idx', 'member_idx', 'pkey']) {
      await client.query(`ALTER INDEX IF EXISTS fa_journal_${suffix} RENAME TO drive_access_journal_${suffix}`);
    }
    await client.query(`ALTER SEQUENCE IF EXISTS fa_journal_id_seq RENAME TO drive_access_journal_id_seq`);
    return 'renamed';
  });
}

/** 2. Settings, once. → { migrated, carried, enabled, prefixes } (prefixes added to shares). */
export async function migrateSettings(transaction = withTransaction) {
  return transaction(async (client) => {
    await lock(client);
    const modulesRow = (await client.query(`SELECT value FROM app_settings WHERE key = 'modules' FOR UPDATE`)).rows[0];
    const legacyRow = (await client.query(`SELECT value FROM app_settings WHERE key = $1 FOR UPDATE`, [LEGACY_KEY])).rows[0];
    const modules = modulesRow ? parse(modulesRow.value) : {};
    const legacy = legacyRow ? parse(legacyRow.value) : null;
    if (legacy?.migratedAt) return { migrated: false };
    // The live block first; the copy when a save of the modules settings has dropped it since.
    const source = Object.hasOwn(modules, 'folderaccess') ? modules.folderaccess : legacy && Object.hasOwn(legacy, 'folderaccess') ? legacy.folderaccess : undefined;
    if (source === undefined) return { migrated: false };
    const { access, prefixes } = convertFolderAccess(source);
    const drive = modules.drive && typeof modules.drive === 'object' ? modules.drive : {};
    const driveSettings = drive.settings && typeof drive.settings === 'object' ? drive.settings : {};
    // An access block set up in the new version is never overwritten. One that only holds the defaults
    // (written by a save of Settings → Modules before this step succeeded) is not set up.
    const fresh = !driveSettings.access || isDeepStrictEqual(sanitizeDriveAccess(DRIVE_ACCESS_DEFAULTS, driveSettings.access), { ...DRIVE_ACCESS_DEFAULTS });
    const added = [];
    if (fresh) {
      for (const { shareId, prefix } of prefixes) {
        const share = (await client.query(`SELECT path_prefixes FROM drive_shares WHERE id = $1`, [shareId])).rows[0];
        if (!share) continue;
        const list = cleanPrefixes([...(share.path_prefixes || []), prefix]);
        if (list.length === (share.path_prefixes || []).length) continue;
        await client.query(`UPDATE drive_shares SET path_prefixes = $2 WHERE id = $1`, [shareId, list]);
        added.push({ shareId, prefix });
      }
      const next = { ...modules, drive: { ...drive, settings: { ...driveSettings, access } } };
      await client.query(UPSERT, ['modules', JSON.stringify(next)]);
    }
    const mark = { savedAt: legacy?.savedAt || new Date().toISOString(), folderaccess: source, migratedAt: new Date().toISOString() };
    await client.query(UPSERT, [LEGACY_KEY, JSON.stringify(mark)]);
    return { migrated: true, carried: fresh, enabled: fresh ? access.enabled : undefined, prefixes: added };
  });
}

/** 3. Roles: drive.access is added where folderaccess.groups is (kept, for a rollback). → number of roles changed. */
export async function migratePermission(run = query) {
  const { rowCount } = await run(
    `UPDATE app_roles
        SET permissions = array_append(permissions, $2), updated_at = NOW()
      WHERE $1 = ANY(permissions) AND NOT ($2 = ANY(permissions))`,
    [OLD_PERMISSION, NEW_PERMISSION]
  );
  return rowCount || 0;
}

/**
 * Everything: in migration 001 of the package (on the migration's transaction, each step in a
 * savepoint: `transaction(fn)` gives fn a client, `run` runs one statement) and again by the
 * daily job (own transactions). Never stops either: a failure is logged and retried next time.
 */
export async function migrateFolderAccess({ transaction = withTransaction, run = query } = {}) {
  const out = {};
  try {
    out.copied = await saveLegacyCopy(transaction);
  } catch (err) {
    console.warn('Drive access: copying the folder access settings failed:', err.message);
  }
  try {
    out.journal = await migrateJournal(transaction);
  } catch (err) {
    console.warn('Drive access: moving the folder access journal failed:', err.message);
  }
  try {
    out.settings = await migrateSettings(transaction);
    if (out.settings.migrated) {
      invalidateSettings();
      console.log(`Drive access: folder access settings moved to the File server (enabled: ${out.settings.enabled ?? 'kept'}, prefixes: ${out.settings.prefixes?.map((row) => `#${row.shareId} ${row.prefix}`).join(', ') || 'none'})`);
    }
  } catch (err) {
    console.warn('Drive access: moving the folder access settings failed:', err.message);
  }
  try {
    out.roles = await migratePermission(run);
    if (out.roles) console.log(`Drive access: ${out.roles} role(s) got ${NEW_PERMISSION} (from ${OLD_PERMISSION})`);
  } catch (err) {
    console.warn('Drive access: moving the folder access permission failed:', err.message);
  }
  return out;
}
