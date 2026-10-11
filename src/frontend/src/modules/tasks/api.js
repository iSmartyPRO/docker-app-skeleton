import api from '../../services/api';

const base = '/app/tasks';

export const tasksApi = {
  home: () => api.get(base),
  projects: (archived) => api.get(`${base}/projects`, { params: archived ? { archived: '1' } : {} }),
  suggestKey: (from) => api.get(`${base}/projects/key`, { params: { from } }),
  checkKey: (key) => api.get(`${base}/projects/key`, { params: { key } }),
  createProject: (payload) => api.post(`${base}/projects`, payload),
  project: (ref) => api.get(`${base}/projects/${encodeURIComponent(ref)}`),
  updateProject: (ref, payload) => api.put(`${base}/projects/${encodeURIComponent(ref)}`, payload),
  deleteProject: (ref) => api.delete(`${base}/projects/${encodeURIComponent(ref)}`),
  saveStatuses: (ref, statuses) => api.put(`${base}/projects/${encodeURIComponent(ref)}/statuses`, { statuses }),
  access: (ref) => api.get(`${base}/projects/${encodeURIComponent(ref)}/access`),
  saveAccess: (ref, entries) => api.put(`${base}/projects/${encodeURIComponent(ref)}/access`, { entries }),
  subjects: () => api.get(`${base}/subjects`),

  tasks: (params) => api.get(`${base}/tasks`, { params }),
  task: (ref) => api.get(`${base}/tasks/${encodeURIComponent(ref)}`),
  createTask: (payload) => api.post(`${base}/tasks`, payload),
  updateTask: (ref, payload) => api.put(`${base}/tasks/${encodeURIComponent(ref)}`, payload),
  deleteTask: (ref) => api.delete(`${base}/tasks/${encodeURIComponent(ref)}`),
  watch: (ref, on) => api.put(`${base}/tasks/${encodeURIComponent(ref)}/watch`, { on }),

  addChecklist: (ref, text) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/checklist`, { text }),
  updateChecklist: (id, payload) => api.put(`${base}/checklist/${id}`, payload),
  deleteChecklist: (id) => api.delete(`${base}/checklist/${id}`),
  orderChecklist: (ref, ids) => api.put(`${base}/tasks/${encodeURIComponent(ref)}/checklist/order`, { ids }),

  addComment: (ref, body) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/comments`, { body }),
  updateComment: (id, body) => api.put(`${base}/comments/${id}`, { body }),
  deleteComment: (id) => api.delete(`${base}/comments/${id}`),

  calendar: (params) => api.get(`${base}/calendar`, { params }),
};

export const TASK_REF = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/;
