/*
 * Which tables a module may call its own (docs/module-packages.md «manifest.json» → tables).
 *
 * A package's `tables` (names or prefix patterns like "hello_%") are what its
 * backups cover, what a rollback restores and what «Удалить данные» drops, so
 * they must never reach the core's tables or another module's:
 *
 *   - every entry starts with "<id>_" — or with a legacy prefix the core
 *     declares for that module below (Masterplan's tables were mp_* long before
 *     packages existed);
 *   - no entry may match a core table (CORE_TABLES) or overlap the tables of
 *     another module (MODULE_TABLES).
 *
 * The same rules filter the tables at run time (moduleTables in backup.js), so
 * a manifest stored before these rules cannot widen them either.
 *
 * No imports: manifestFile.js (and so modules/catalog.js) reads this file.
 * test/module-packages.test.js checks both lists against the CREATE TABLE
 * statements of the source tree.
 */

/** The package platform's own tables. */
export const PLATFORM_TABLES = Object.freeze(['installed_modules', 'module_migrations', 'module_tables']);

/** Tables of the core (services/, platform/, api/ and modules/shared). */
export const CORE_TABLES = Object.freeze([
  ...PLATFORM_TABLES,
  'api_deliveries',
  'api_requests',
  'api_templates',
  'api_tokens',
  'api_webhooks',
  'app_groups',
  'app_roles',
  'app_settings',
  'auth_codes',
  'demo_records',
  'google_accounts',
  'group_roles',
  'ip_rules',
  'legal_entities',
  'link_slug_holds',
  'login_attempts',
  'notification_deferred',
  'notification_subscriptions',
  'notifications',
  'office_locks',
  'portal_identity',
  'push_subscriptions',
  'revoked_sessions',
  'security_events',
  'user_group_members',
  'user_roles',
  'user_sessions',
  'user_tours',
  'users',
]);

/**
 * Tables of the modules (built in now or converted to packages): entries ending
 * in "_" are prefixes, others exact names. A module may use its own entries even
 * when they do not start with "<id>_" (legacy prefixes: masterplan → mp_).
 */
export const MODULE_TABLES = Object.freeze({
  approvals: ['approval_'],
  assistant: ['assistant_'],
  calendar: ['cal_'],
  chat: ['chat_'],
  companies: ['cmp_'],
  contracts: ['ctr_'],
  crm: ['crm_'],
  dashboard: ['dash_'],
  directory: ['ad_'],
  drive: ['drive_'],
  employees: ['emp_', 'employees'],
  files: ['fs_', 'kb_item_files'],
  kb: ['kb_'],
  masterplan: ['mp_'],
  org: ['org_'],
  procurement: ['proc_'],
  qr: ['qr_'],
  remote: ['remote_'],
  resources: ['res_'],
  tasks: ['task_', 'tasks'],
  warehouse: ['wh_'],
});

const isPrefix = (entry) => entry.endsWith('_');

/** Does a table name (or, with `prefix`, any table starting with it) fall under `entry`? */
function overlaps(entry, { name = null, prefix = null }) {
  if (isPrefix(entry)) return prefix != null ? prefix.startsWith(entry) || entry.startsWith(prefix) : name.startsWith(entry);
  return prefix != null ? entry.startsWith(prefix) : entry === name;
}

/** Why module `id` may not list `pattern` in its manifest `tables`, or null when it may. */
export function tablePatternProblem(id, pattern) {
  if (typeof id !== 'string' || typeof pattern !== 'string') return `table "${pattern}" is not valid`;
  const prefix = /[%*]$/.test(pattern) ? pattern.slice(0, -1) : null;
  const target = prefix != null ? { prefix } : { name: pattern };
  const own = MODULE_TABLES[id] || [];
  const explicitlyOwn = prefix == null && own.includes(pattern);
  if (!explicitlyOwn) {
    const starts = [`${id}_`, ...own.filter(isPrefix)];
    if (!starts.some((start) => (prefix ?? pattern).startsWith(start))) return `table "${pattern}" must start with "${id}_"`;
  }
  const core = CORE_TABLES.find((table) => overlaps(table, target));
  if (core) return `table "${pattern}" matches the core table "${core}"`;
  for (const [other, entries] of Object.entries(MODULE_TABLES)) {
    if (other === id) continue;
    const hit = entries.find((entry) => overlaps(entry, target));
    if (hit) return `table "${pattern}" overlaps the tables of module "${other}" (${isPrefix(hit) ? `${hit}*` : hit})`;
  }
  return null;
}

/** May module `id` own the existing table `table` (run-time filter for backups, restores and data removal)? */
export function mayOwnTable(id, table) {
  if (CORE_TABLES.includes(table)) return false;
  const own = MODULE_TABLES[id] || [];
  if (own.some((entry) => overlaps(entry, { name: table }))) return true;
  for (const [other, entries] of Object.entries(MODULE_TABLES)) {
    if (other !== id && entries.some((entry) => overlaps(entry, { name: table }))) return false;
  }
  return true;
}
