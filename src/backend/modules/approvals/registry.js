import { cleanFields, cleanRoute } from './logic.js';

/*
 * Document types that go through approvals. Modules register theirs at import
 * time (see docs/approvals.md#module-api):
 *
 *   registerApprovalType({
 *     key: 'procurement.request',     // unique, '<module>.<doc>'
 *     module: 'procurement',          // module id: enabled check, '<module>.admin' manages the route
 *     title: { ru: 'Заявка на закупку', en: 'Purchase request' },
 *     fields: [{ key: 'amount', type: 'money', label: { ru, en } }, …],
 *     canView: async (ctx, docId) => boolean,
 *     load: async (docId) => ({ title, number, amount, currency, urgency, author, dueAt, url, fields }),
 *     onStatus: async (docId, status, info) => {},
 *     defaultRoute: { stages: [...] },   // optional: used until an administrator saves a route
 *   });
 */

const types = new Map();

export function registerApprovalType(definition = {}) {
  const key = String(definition.key || '');
  if (!/^[a-z][a-z0-9_]*\.[a-z0-9_.-]+$/.test(key)) throw new Error(`registerApprovalType: bad key "${key}" (use "<module>.<doc>")`);
  if (typeof definition.load !== 'function') throw new Error(`registerApprovalType(${key}): load(docId) is required`);
  const module = String(definition.module || key.split('.')[0]);
  const fields = cleanFields(definition.fields);
  const type = {
    key,
    module,
    title: definition.title || key,
    fields,
    canView: typeof definition.canView === 'function' ? definition.canView : async () => false,
    load: definition.load,
    onStatus: typeof definition.onStatus === 'function' ? definition.onStatus : null,
    defaultRoute: definition.defaultRoute ? cleanRoute(definition.defaultRoute, fields) : null,
    adminPermission: definition.adminPermission || `${module}.admin`,
    hidden: Boolean(definition.hidden),
  };
  types.set(key, type);
  return () => {
    if (types.get(key) === type) types.delete(key);
  };
}

export function getApprovalType(key) {
  return types.get(String(key)) || null;
}

export function requireApprovalType(key) {
  const type = getApprovalType(key);
  if (!type) {
    const error = new Error(`Unknown approval type ${key}`);
    error.statusCode = 404;
    error.code = 'UNKNOWN_TYPE';
    throw error;
  }
  return type;
}

export function listApprovalTypes() {
  return [...types.values()];
}
