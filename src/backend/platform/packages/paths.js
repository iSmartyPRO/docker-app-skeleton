import { resolve } from 'node:path';

/*
 * Where installed packages live (docs/module-packages.md «Layout»):
 *
 *   $MODULES_DIR/<id>/<version>/…   unpacked package (manifest.json, server/, web/, …)
 *   $MODULES_DIR/<id>/current       the active version (one line)
 *   $MODULES_DIR/<id>/previous      the version before the last update (rollback)
 *   $MODULES_DIR/.staging/          uploaded files waiting for «Установить»
 *   $MODULES_DIR/.backups/<id>/     table backups made before updates and data removal
 *
 * MODULES_DIR defaults to /app/data/modules (docker-compose maps ./data/modules there).
 * Read on every call so tests can point it at a temporary folder.
 */

export const modulesDir = () => resolve(process.env.MODULES_DIR || '/app/data/modules');
export const stagingDir = () => resolve(modulesDir(), '.staging');
export const backupsDir = () => resolve(process.env.MODULE_BACKUP_DIR || resolve(modulesDir(), '.backups'));
export const moduleRoot = (id) => resolve(modulesDir(), id);
export const versionDir = (id, version) => resolve(modulesDir(), id, version);

/** Unsigned packages are accepted only in development mode (spec §3.2). */
export const devMode = () => process.env.MODULES_DEV === '1';

export const ID_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
export const VERSION_PATTERN = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
