import api from '../../services/api';

const base = '/app/procurement';

/** The Procurement API (docs/procurement.md → HTTP API). */
export const procApi = {
  meta: () => api.get(`${base}/meta`),
  people: () => api.get(`${base}/people`),
  list: (params) => api.get(`${base}/requests`, { params }),
  counters: (params) => api.get(`${base}/counters`, { params }),
  board: (params) => api.get(`${base}/board`, { params }),
  get: (id) => api.get(`${base}/requests/${id}`),
  create: (payload) => api.post(`${base}/requests`, payload),
  update: (id, payload) => api.put(`${base}/requests/${id}`, payload),
  remove: (id) => api.delete(`${base}/requests/${id}`),
  history: (id) => api.get(`${base}/requests/${id}/history`),
  action: (id, action, payload) => api.post(`${base}/requests/${id}/${action}`, payload || {}),
  upload: (id, files, kind, onUploadProgress) => {
    const form = new FormData();
    form.append('kind', kind || 'other');
    for (const file of files) form.append('files', file);
    return api.post(`${base}/requests/${id}/documents`, form, { timeout: 0, onUploadProgress });
  },
  linkFile: (id, nodeId, kind) => api.post(`${base}/requests/${id}/documents/link`, { nodeId, kind }),
  setDocKind: (docId, kind) => api.put(`${base}/documents/${docId}`, { kind }),
  removeDoc: (docId) => api.delete(`${base}/documents/${docId}`),
  pay: (id, fields, files = []) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null && value !== '') form.append(key, value);
    for (const file of files) form.append('files', file);
    return api.post(`${base}/requests/${id}/payments`, form, { timeout: 0 });
  },
  removePayment: (paymentId) => api.delete(`${base}/payments/${paymentId}`),
  deliver: (id, fields, files = []) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null && value !== '') form.append(key, value);
    for (const file of files) form.append('files', file);
    return api.post(`${base}/requests/${id}/deliveries`, form, { timeout: 0 });
  },
  removeDelivery: (deliveryId) => api.delete(`${base}/deliveries/${deliveryId}`),
  registry: (params) => api.get(`${base}/registry`, { params }),
  summary: (params) => api.get(`${base}/summary`, { params }),
  widget: () => api.get(`${base}/widget`),
  lookup: (kind, params) => api.get(`${base}/lookup/${kind}`, { params }),
  views: () => api.get(`${base}/views`),
  saveView: (name, filter) => api.post(`${base}/views`, { name, filter }),
  removeView: (id) => api.delete(`${base}/views/${id}`),
  settings: () => api.get(`${base}/settings`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),
  legalEntities: (archived) => api.get(`${base}/legal-entities`, { params: archived ? { archived: 1 } : {} }),
  createLegalEntity: (payload) => api.post(`${base}/legal-entities`, payload),
  updateLegalEntity: (id, payload) => api.put(`${base}/legal-entities/${id}`, payload),
  archiveLegalEntity: (id) => api.delete(`${base}/legal-entities/${id}`),
  // Contracts module (built separately): tolerated when missing or off.
  contracts: (search) => api.get('/app/contracts/contracts', { params: search ? { search } : {} }),
};

/** Address of a document's file (inline preview, or a download). */
export const docUrl = (doc, download = false) => `/api/app/procurement/documents/${doc.id}/file${download ? '?download=1' : ''}`;

/** Download address of a CSV export with the given query. */
export const csvUrl = (path, params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString();
  return `/api/app/procurement/${path}${query ? `?${query}` : ''}`;
};
