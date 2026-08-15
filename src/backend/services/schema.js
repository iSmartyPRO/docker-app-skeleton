import { query } from '../config/database.js';
import { ensureSettingsTable } from './settings.js';
import { ensureUsersTable } from './users.js';
import { ensureSecurityTables } from './security.js';

export async function bootstrapSchema() {
  await ensureSettingsTable();
  await ensureUsersTable();
  await ensureSecurityTables();
}
