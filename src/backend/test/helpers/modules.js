/*
 * Database tests that load modules one by one (not through bootstrapSchema)
 * activate every built-in module with the core registry, as the server does
 * at start: modules reach optional modules at run time (modules.loaded('crm'),
 * Masterplan following contract.* events, chat entities…). Modules that are
 * distributed as packages but whose source is in the tree (PACKAGE_MODULE_IDS,
 * e.g. masterplan) are activated from that source as if they were installed.
 * Without a *_DB_TEST flag (plain `npm test`) it does nothing, so skipped
 * files stay fast.
 */
export async function activateAll() {
  if (!Object.entries(process.env).some(([key, value]) => key.endsWith('_DB_TEST') && value === '1')) return;
  const { MODULES } = await import('../../modules/index.js');
  const { activateModules } = await import('../../platform/registry.js');
  const { PACKAGE_MODULE_IDS } = await import('../../modules/manifest.js');
  await activateModules(MODULES);
  const sources = [];
  for (const id of PACKAGE_MODULE_IDS) sources.push(await sourcePackage(id));
  await activateModules(sources.filter(Boolean));
}

/**
 * A package module from its source in the tree (src/backend/modules/<id>):
 * its catalog and manifest entries as an installed package would add them
 * (module.json + settings.js, like scripts/build-module.mjs), then the module.
 * The caller creates its tables (schema / migrations) itself.
 */
export async function sourcePackage(id) {
  const { existsSync, readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL(`../../modules/${id}/`, import.meta.url));
  if (!existsSync(`${dir}module.json`)) return null;
  const { MODULE_CATALOG } = await import('../../modules/catalog.js');
  const { MODULE_MANIFEST, CATEGORIES, INTEGRATIONS } = await import('../../modules/manifest.js');
  const { normalizeManifest, platformCatalogEntry, platformManifestEntry } = await import('../../platform/packages/manifestFile.js');
  const { APP_VERSION } = await import('../../config/version.js');
  const { invalidateSettings } = await import('../../services/settings.js');
  const config = JSON.parse(readFileSync(`${dir}module.json`, 'utf8'));
  const settings = existsSync(`${dir}settings.js`) ? await import(`${dir}settings.js`) : {};
  const { manifest, problems } = normalizeManifest(
    {
      ...config,
      core: config.core || APP_VERSION,
      settings: { defaultEnabled: settings.defaultEnabled ?? false, defaults: settings.defaults ?? config.settings?.defaults ?? {}, public: settings.publicSettings ?? config.settings?.public ?? [] },
    },
    { categories: CATEGORIES, integrations: INTEGRATIONS }
  );
  if (problems.length) throw new Error(`${id}/module.json: ${problems.join('; ')}`);
  const module = (await import(`${dir}index.js`)).default;
  if (!MODULE_CATALOG.some((entry) => entry.id === id)) {
    MODULE_CATALOG.push({ ...platformCatalogEntry(manifest), ...(module.sanitizeSettings ? { sanitize: module.sanitizeSettings } : {}) });
  }
  MODULE_MANIFEST[id] ||= platformManifestEntry(manifest);
  invalidateSettings();
  return { ...module, version: manifest.version };
}
