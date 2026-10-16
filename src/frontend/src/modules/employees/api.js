import api from '../../services/api';

const base = '/app/employees';

/** The Employees API (docs/employees.md → HTTP API). */
export const empApi = {
  meta: () => api.get(`${base}/meta`),
  counters: () => api.get(`${base}/counters`),
  celebrations: (days) => api.get(`${base}/widget/celebrations`, { params: days ? { days } : {} }),
  list: (params) => api.get(`${base}/employees`, { params }),
  exportUrl: (params) => `/api${base}/employees/export.csv?${new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()}`,
  get: (id) => api.get(`${base}/employees/${id}`),
  create: (payload) => api.post(`${base}/employees`, payload),
  update: (id, payload) => api.put(`${base}/employees/${id}`, payload),
  terminate: (id, payload) => api.post(`${base}/employees/${id}/terminate`, payload),
  remove: (id) => api.delete(`${base}/employees/${id}`),
  importRows: (payload) => api.post(`${base}/employees/import`, payload),

  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return api.post(`${base}/employees/${id}/photo`, form);
  },
  removePhoto: (id) => api.delete(`${base}/employees/${id}/photo`),
  uploadDocuments: (id, files, note) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    if (note) form.append('note', note);
    return api.post(`${base}/employees/${id}/documents`, form);
  },
  documentUrl: (fileId, download = false) => `/api${base}/files/${fileId}${download ? '?download=1' : ''}`,
  removeDocument: (fileId) => api.delete(`${base}/files/${fileId}`),

  addSkill: (id, payload) => api.post(`${base}/employees/${id}/skills`, payload),
  updateSkill: (id, skillId, payload) => api.put(`${base}/employees/${id}/skills/${skillId}`, payload),
  removeSkill: (id, skillId) => api.delete(`${base}/employees/${id}/skills/${skillId}`),

  unlinkedAccounts: (q) => api.get(`${base}/accounts/unlinked`, { params: q ? { q } : {} }),
  suggestUsername: (id) => api.get(`${base}/employees/${id}/account/suggest`),
  createAccount: (id, payload) => api.post(`${base}/employees/${id}/account`, payload),
  linkAccount: (id, userId) => api.put(`${base}/employees/${id}/account`, { userId }),
  unlinkAccount: (id) => api.delete(`${base}/employees/${id}/account`),
  blockAccount: (id, blocked = true) => api.post(`${base}/employees/${id}/account/block`, { blocked }),

  positions: (archived = false) => api.get(`${base}/positions`, { params: archived ? { archived: 1 } : {} }),
  createPosition: (payload) => api.post(`${base}/positions`, payload),
  updatePosition: (id, payload) => api.put(`${base}/positions/${id}`, payload),
  removePosition: (id) => api.delete(`${base}/positions/${id}`),

  settings: () => api.get(`${base}/settings`),
  saveSettings: (payload) => api.put(`${base}/settings`, payload),
};
