import { httpError } from '../../shared/acl.js';
import { lookupKg } from './kg.js';
import { lookupRu } from './ru.js';

/** Which countries can be filled from a public register. */
export const REGISTRIES = {
  KG: { key: 'inn', run: (id) => lookupKg(id) },
  RU: { key: 'inn', run: (id, options) => lookupRu(id, options) },
};

export async function lookupRegistry(country, id, options = {}) {
  const registry = REGISTRIES[country];
  if (!registry) throw httpError(400, 'No public register is connected for this country', 'NO_REGISTRY');
  const result = await registry.run(id, options);
  return { ...result, checkedAt: new Date().toISOString() };
}
