import { ensureSettingsTable } from './settings.js';
import { ensureUsersTable } from './users.js';
import { ensureSecurityTables } from './security.js';
import { seedRbac } from './rbac.js';
import { ensureAuthTables } from './signin.js';
import { ensureModuleSchemas } from '../modules/index.js';
import { ensureGoogleTables } from './google.js';
import { ensureNotificationTables } from './notifications.js';
import { ensurePushTables } from './push.js';
import { startScheduler } from './scheduler.js';
import { ensureApiTables } from '../api/schema.js';
import { ensureLegalEntitiesTable } from './legalEntities.js';
import { ensureOfficeSchema } from './office/locks.js';
import { ensureTourTables } from './tours.js';

let bootstrapped = false;

/** True once bootstrapSchema has completed in this process (boot, setup wizard or a delayed retry). */
export function schemaBootstrapped() {
  return bootstrapped;
}

export async function bootstrapSchema() {
  await ensureSettingsTable();
  await ensureUsersTable();
  await ensureTourTables();
  await ensureSecurityTables();
  await seedRbac();
  await ensureAuthTables();
  await ensureGoogleTables();
  await ensurePushTables();
  await ensureNotificationTables();
  await ensureLegalEntitiesTable();
  await ensureModuleSchemas();
  await ensureApiTables();
  // Online editing (WOPI locks); after the modules (Drive's editor file ids live in its schema).
  await ensureOfficeSchema();
  // Reminders and housekeeping start once the database is ready.
  startScheduler();
  bootstrapped = true;
}
