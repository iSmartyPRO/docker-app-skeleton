/*
 * Database tests that load modules one by one (not through bootstrapSchema)
 * activate every built-in module with the core registry, as the server does
 * at start: modules reach optional modules at run time (modules.loaded('crm'),
 * Masterplan following contract.* events, chat entities…). Without a
 * *_DB_TEST flag (plain `npm test`) it does nothing, so skipped files stay fast.
 */
export async function activateAll() {
  if (!Object.entries(process.env).some(([key, value]) => key.endsWith('_DB_TEST') && value === '1')) return;
  const { MODULES } = await import('../../modules/index.js');
  const { activateModules } = await import('../../platform/registry.js');
  await activateModules(MODULES);
}
