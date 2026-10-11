import api from '../../services/api';

const base = '/app/chat';

export const chatApi = {
  home: () => api.get(base),
  unread: () => api.get(`${base}/unread`),
  rooms: (params) => api.get(`${base}/rooms`, { params }),
  room: (id) => api.get(`${base}/rooms/${id}`),
  entity: (type, id) => api.get(`${base}/entity/${type}/${id}`),
  direct: (userId) => api.post(`${base}/direct/${userId}`),
  createGroup: (payload) => api.post(`${base}/rooms`, payload),
  updateRoom: (id, payload) => api.put(`${base}/rooms/${id}`, payload),
  prefs: (id, payload) => api.put(`${base}/rooms/${id}/prefs`, payload),
  members: (id) => api.get(`${base}/rooms/${id}/members`),
  addMembers: (id, userIds) => api.post(`${base}/rooms/${id}/members`, { userIds }),
  removeMember: (id, userId) => api.delete(`${base}/rooms/${id}/members/${userId}`),
  files: (id) => api.get(`${base}/rooms/${id}/files`),
  messages: (id, params) => api.get(`${base}/rooms/${id}/messages`, { params }),
  send: (id, payload) => api.post(`${base}/rooms/${id}/messages`, payload),
  edit: (messageId, body) => api.put(`${base}/messages/${messageId}`, { body }),
  remove: (messageId) => api.delete(`${base}/messages/${messageId}`),
  react: (messageId, emoji) => api.post(`${base}/messages/${messageId}/reactions`, { emoji }),
  read: (id, messageId) => api.post(`${base}/rooms/${id}/read`, { messageId }),
  typing: (id) => api.post(`${base}/rooms/${id}/typing`),
  call: (id) => api.post(`${base}/rooms/${id}/call`),
  focus: (payload) => api.post(`${base}/focus`, payload),
  directory: (q) => api.get(`${base}/directory`, { params: { q } }),
  search: (q) => api.get(`${base}/search`, { params: { q } }),
  upload: (id, files, onProgress) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(`${base}/rooms/${id}/files`, form, {
      timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
};

export const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
};
