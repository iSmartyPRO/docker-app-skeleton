import { contribute, contributions } from './extensions';

/*
 * Global search providers (frontend): a module adds what the shell's search
 * finds in it, without the shell importing the module.
 *
 *   registerSearchProvider({ id: 'kb', module: 'kb', order: 30, search: async (q, { signal }) => [{ id, title, url, hint, icon }] });
 *   const results = await searchEverywhere('отчёт', { settings });   // [{ provider, items }]
 *
 * Providers of switched-off modules are skipped; a failing provider is left
 * out. The server side is src/backend/platform/registry.js registerSearchProvider.
 */

export function registerSearchProvider(definition) {
  if (!definition?.id || typeof definition.search !== 'function') throw new Error('registerSearchProvider needs { id, search }');
  return contribute('search.providers', definition);
}

export const searchProviders = (settings) => contributions('search.providers').filter((provider) => !provider.module || !settings || settings.modules?.[provider.module]?.enabled);

export async function searchEverywhere(q, { settings, signal } = {}) {
  const out = [];
  for (const provider of searchProviders(settings)) {
    try {
      out.push({ provider: provider.id, module: provider.module || null, items: (await provider.search(q, { signal })) || [] });
    } catch {
      /* a provider that fails is left out */
    }
  }
  return out;
}
