import api from '../../services/api';

const base = '/app/remote';

export const remoteApi = {
  bootstrap: () => api.get(base),
  subjects: () => api.get(`${base}/subjects`),
  hosts: () => api.get(`${base}/hosts`),
  saveHost: (payload) => api.post(`${base}/hosts`, payload),
  updateHost: (id, payload) => api.put(`${base}/hosts/${id}`, payload),
  deleteHost: (id) => api.delete(`${base}/hosts/${id}`),
  start: (payload) => api.post(`${base}/sessions`, payload),
  end: (id, payload = {}) => api.post(`${base}/sessions/${id}/end`, payload),
  sessions: (scope = 'mine') => api.get(`${base}/sessions`, { params: { scope } }),

  // RemoteApp (published applications)
  apps: () => api.get(`${base}/apps`),
  adminApps: (hostId) => api.get(`${base}/admin/apps`, { params: hostId ? { hostId } : {} }),
  saveApp: (payload) => api.post(`${base}/admin/apps`, payload),
  updateApp: (id, payload) => api.put(`${base}/admin/apps/${id}`, payload),
  deleteApp: (id) => api.delete(`${base}/admin/apps/${id}`),
  importRdp: (rdp) => api.post(`${base}/admin/apps/import`, { rdp }),

  // Password manager
  credentials: () => api.get(`${base}/credentials`),
  saveCredential: (payload) => api.post(`${base}/credentials`, payload),
  updateCredential: (id, payload) => api.put(`${base}/credentials/${id}`, payload),
  deleteCredential: (id) => api.delete(`${base}/credentials/${id}`),

  // Passbolt
  passbolt: () => api.get(`${base}/passbolt`),
  savePassbolt: (payload) => api.put(`${base}/passbolt`, payload),
  testPassbolt: () => api.post(`${base}/passbolt/test`),
  deletePassbolt: () => api.delete(`${base}/passbolt`),
  passboltResources: () => api.get(`${base}/passbolt/resources`),
};
