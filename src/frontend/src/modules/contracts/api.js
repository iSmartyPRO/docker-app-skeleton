import api from '../../services/api';

const base = '/app/contracts';

/** The Contracts API (docs/contracts.md → API). */
export const contractsApi = {
  meta: () => api.get(`${base}/meta`),
  users: () => api.get(`${base}/users`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),

  list: (params) => api.get(`${base}/contracts`, { params }),
  counters: (params) => api.get(`${base}/counters`, { params }),
  calendar: (params) => api.get(`${base}/calendar`, { params }),
  exportUrl: (params) => `/api${base}/export.csv?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()}`,

  get: (id) => api.get(`${base}/contracts/${id}`),
  create: (payload) => api.post(`${base}/contracts`, payload),
  update: (id, payload) => api.put(`${base}/contracts/${id}`, payload),
  remove: (id) => api.delete(`${base}/contracts/${id}`),
  status: (id, payload) => api.post(`${base}/contracts/${id}/status`, payload),
  events: (id, params) => api.get(`${base}/contracts/${id}/events`, { params }),

  upload: (id, file, { comment, signed } = {}, onProgress) => {
    const form = new FormData();
    form.append('file', file, file.name);
    if (comment) form.append('comment', comment);
    if (signed) form.append('signed', '1');
    return api.post(`${base}/contracts/${id}/versions`, form, {
      timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  updateVersion: (id, payload) => api.put(`${base}/versions/${id}`, payload),
  fileUrl: (id, download) => `/api${base}/versions/${id}/file${download ? '?download=1' : ''}`,
  previewUrl: (id) => `/api${base}/versions/${id}/preview.pdf`,

  addRisk: (id, payload) => api.post(`${base}/contracts/${id}/risks`, payload),
  updateRisk: (id, payload) => api.put(`${base}/risks/${id}`, payload),
  removeRisk: (id) => api.delete(`${base}/risks/${id}`),

  dealOptions: (search) => api.get(`${base}/link-options/deals`, { params: { search } }),
  masterplanOptions: (search) => api.get(`${base}/link-options/masterplan`, { params: { search } }),
  /** Purchase requests that point at the contract (Procurement module; 404 while it is off). */
  procurementRequests: (id) => api.get('/app/procurement/requests', { params: { contract: id } }),
  companies: (q) => api.get('/app/companies/search', { params: { q } }),
};
