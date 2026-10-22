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
};
