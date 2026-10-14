import api from '../../services/api';

const base = '/app/warehouse';

/** The Warehouse API (docs/warehouse.md → HTTP API). */
export const whApi = {
  meta: () => api.get(`${base}/meta`),
  people: () => api.get(`${base}/people`),
  groups: () => api.get(`${base}/groups`),
  resolve: (code, warehouse) => api.get(`${base}/resolve`, { params: { code, warehouse } }),
  // Nomenclature
  items: (params) => api.get(`${base}/items`, { params }),
  item: (id) => api.get(`${base}/items/${id}`),
  createItem: (payload) => api.post(`${base}/items`, payload),
  updateItem: (id, payload) => api.put(`${base}/items/${id}`, payload),
  archiveItem: (id, archived) => api.post(`${base}/items/${id}/${archived ? 'archive' : 'restore'}`),
  addBarcode: (id, payload) => api.post(`${base}/items/${id}/barcodes`, payload),
  removeBarcode: (id) => api.delete(`${base}/barcodes/${id}`),
  saveNorms: (id, norms) => api.put(`${base}/items/${id}/norms`, { norms }),
  categories: () => api.get(`${base}/categories`),
  saveCategory: (id, payload) => (id ? api.put(`${base}/categories/${id}`, payload) : api.post(`${base}/categories`, payload)),
  deleteCategory: (id) => api.delete(`${base}/categories/${id}`),
  // Warehouses
  warehouses: (archived) => api.get(`${base}/warehouses`, { params: archived ? { archived: 1 } : {} }),
  createWarehouse: (payload) => api.post(`${base}/warehouses`, payload),
  updateWarehouse: (id, payload) => api.put(`${base}/warehouses/${id}`, payload),
  bins: (id, archived) => api.get(`${base}/warehouses/${id}/bins`, { params: archived ? { archived: 1 } : {} }),
  createBins: (id, payload) => api.post(`${base}/warehouses/${id}/bins`, payload),
  updateBin: (id, payload) => api.put(`${base}/bins/${id}`, payload),
  access: (id) => api.get(`${base}/warehouses/${id}/access`),
  saveAccess: (id, entries) => api.put(`${base}/warehouses/${id}/access`, { entries }),
  // Stock
  stock: (params) => api.get(`${base}/stock`, { params }),
  hints: (params) => api.get(`${base}/stock/hints`, { params }),
  reserves: (params) => api.get(`${base}/reserves`, { params }),
  createReserve: (payload) => api.post(`${base}/reserves`, payload),
  releaseReserve: (id) => api.post(`${base}/reserves/${id}/release`),
  // Documents
  documents: (params) => api.get(`${base}/documents`, { params }),
  counters: (params) => api.get(`${base}/documents/counters`, { params }),
  document: (id) => api.get(`${base}/documents/${id}`),
  createDocument: (payload) => api.post(`${base}/documents`, payload),
  fromProcurement: (payload) => api.post(`${base}/documents/from-procurement`, payload),
  updateDocument: (id, payload) => api.put(`${base}/documents/${id}`, payload),
  deleteDocument: (id) => api.delete(`${base}/documents/${id}`),
  history: (id) => api.get(`${base}/documents/${id}/history`),
  addLine: (id, payload) => api.post(`${base}/documents/${id}/lines`, payload),
  updateLine: (id, lineId, payload) => api.put(`${base}/documents/${id}/lines/${lineId}`, payload),
  deleteLine: (id, lineId) => api.delete(`${base}/documents/${id}/lines/${lineId}`),
  action: (id, action, payload) => api.post(`${base}/documents/${id}/${action}`, payload || {}),
  sign: (id, image, name) => api.post(`${base}/documents/${id}/signature`, { image, name }),
  orderShortage: (id) => api.post(`${base}/documents/${id}/order-shortage`),
  orderForWarehouse: (payload) => api.post(`${base}/procurement/order`, payload),
  upload: (owner, id, files, kind) => {
    const form = new FormData();
    if (kind) form.append('kind', kind);
    for (const file of files) form.append('files', file);
    return api.post(`${base}/${owner}/${id}/files`, form, { timeout: 0 });
  },
  removeFile: (id) => api.delete(`${base}/files/${id}`),
  // Tools
  tools: (params) => api.get(`${base}/tools`, { params }),
  myTools: () => api.get(`${base}/tools/mine`),
  tool: (id) => api.get(`${base}/tools/${id}`),
  updateTool: (id, payload) => api.put(`${base}/tools/${id}`, payload),
  handover: (payload) => api.post(`${base}/tools/handover`, payload),
  // Reports
  report: (kind, params) => api.get(`${base}/reports/${kind}`, { params }),
  // Import
  importItems: (payload) => api.post(`${base}/import/items`, payload),
  importOpening: (payload) => api.post(`${base}/import/opening`, payload),
  // Inventory sessions
  inventories: (params) => api.get(`${base}/inventory`, { params }),
  inventoryActive: (warehouse) => api.get(`${base}/inventory/active`, { params: warehouse ? { warehouse } : {} }),
  inventory: (id) => api.get(`${base}/inventory/${id}`),
  createInventory: (payload) => api.post(`${base}/inventory`, payload),
  inventoryAction: (id, action, payload) => api.post(`${base}/inventory/${id}/${action}`, payload || {}),
  inventoryAssign: (id, payload) => api.put(`${base}/inventory/${id}/assign`, payload),
  inventoryPeople: (id, payload) => api.post(`${base}/inventory/${id}/people`, payload),
  inventoryArea: (id, bin) => api.get(`${base}/inventory/${id}/area`, { params: { bin: bin || 0 } }),
  inventorySync: (id, ops) => api.post(`${base}/inventory/${id}/sync`, { ops }, { timeout: 20000 }),
  inventoryReconcile: (id, params) => api.get(`${base}/inventory/${id}/reconcile`, { params }),
  inventoryFinal: (id, payload) => api.put(`${base}/inventory/${id}/final`, payload),
  inventorySchedules: (params) => api.get(`${base}/inventory/schedules`, { params }),
  saveInventorySchedule: (id, payload) => (id ? api.put(`${base}/inventory/schedules/${id}`, payload) : api.post(`${base}/inventory/schedules`, payload)),
  deleteInventorySchedule: (id) => api.delete(`${base}/inventory/schedules/${id}`),
  // Pickers, dashboard, settings
  lookup: (kind, params) => api.get(`${base}/lookup/${kind}`, { params }),
  widget: () => api.get(`${base}/widget`),
  settings: () => api.get(`${base}/settings`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),
};

/** Download address of a CSV report with the given query. */
export const csvUrl = (kind, params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString();
  return `/api/app/warehouse/reports/${kind}.csv${query ? `?${query}` : ''}`;
};
