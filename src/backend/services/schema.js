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

export async function bootstrapSchema() {
  await ensureSettingsTable();
  await ensureUsersTable();
  await ensureSecurityTables();
  await seedRbac();
  await ensureAuthTables();
  await ensureGoogleTables();
  await ensurePushTables();
  await ensureNotificationTables();
  await ensureModuleSchemas();
  await ensureApiTables();
  // Reminders and housekeeping start once the database is ready.
  startScheduler();
}
