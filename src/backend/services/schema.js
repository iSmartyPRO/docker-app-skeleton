import { ensureSettingsTable } from './settings.js';
import { ensureUsersTable } from './users.js';
import { ensureSecurityTables } from './security.js';
import { seedRbac } from './rbac.js';
import { ensureAuthTables } from './signin.js';

export async function bootstrapSchema() {
  await ensureSettingsTable();
  await ensureUsersTable();
  await ensureSecurityTables();
  await seedRbac();
  await ensureAuthTables();
}
