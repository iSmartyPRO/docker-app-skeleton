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

  // Version 2: roles, blocks, templates
  favorite: (ref, on) => api.put(`${base}/tasks/${encodeURIComponent(ref)}/favorite`, { on }),
  start: (ref) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/start`),
  accept: (ref, comment) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/accept`, comment ? { comment } : {}),
  delegate: (ref, userId) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/delegate`, { userId }),
  rate: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/rate`, payload),
  copy: (ref, payload = {}) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/copy`, payload),
  formOf: (ref) => api.get(`${base}/tasks/${encodeURIComponent(ref)}/form`),
  timer: (ref, action) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/timer`, { action }),
  addChecklistList: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/checklists`, payload),
  updateChecklistList: (id, payload) => api.put(`${base}/checklists/${id}`, payload),
  deleteChecklistList: (id) => api.delete(`${base}/checklists/${id}`),
  orderChecklistList: (id, ids) => api.put(`${base}/checklists/${id}/order`, { ids }),
  addChecklistItem: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/checklist`, payload),
  bulkChecklist: (payload) => api.post(`${base}/checklist/bulk`, payload),
  uploadFiles: (ref, files, onProgress) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(ref ? `${base}/tasks/${encodeURIComponent(ref)}/files` : `${base}/files`, form, {
      timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  linkFile: (ref, payload) => api.post(ref ? `${base}/tasks/${encodeURIComponent(ref)}/files/link` : `${base}/files/link`, payload),
  removeFile: (id) => api.delete(`${base}/files/${id}`),
  addResult: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/results`, payload),
  removeResult: (id) => api.delete(`${base}/results/${id}`),
  addLink: (ref, other) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/links`, { ref: other }),
  removeLink: (ref, otherId) => api.delete(`${base}/tasks/${encodeURIComponent(ref)}/links/${otherId}`),
  addDep: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/deps`, payload),
  removeDep: (id) => api.delete(`${base}/deps/${id}`),
  addReminder: (ref, payload) => api.post(`${base}/tasks/${encodeURIComponent(ref)}/reminders`, payload),
  removeReminder: (id) => api.delete(`${base}/reminders/${id}`),
  templates: () => api.get(`${base}/templates`),
  saveTemplate: (payload, id) => (id ? api.put(`${base}/templates/${id}`, payload) : api.post(`${base}/templates`, payload)),
  deleteTemplate: (id) => api.delete(`${base}/templates/${id}`),
  flows: () => api.get(`${base}/flows`),
  saveFlow: (payload, id) => (id ? api.put(`${base}/flows/${id}`, payload) : api.post(`${base}/flows`, payload)),
  deleteFlow: (id) => api.delete(`${base}/flows/${id}`),
  fields: () => api.get(`${base}/fields`),
  addField: (payload) => api.post(`${base}/fields`, payload),
  deleteField: (id) => api.delete(`${base}/fields/${id}`),
};

export const fileUrl = (file, download) => `/api/app/tasks/files/${file.id}${download ? '?download=1' : ''}`;

export const TASK_REF = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/;
