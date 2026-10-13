import api from '../../services/api';

const base = '/app/crm';

/** The CRM API (docs/crm.md → API). Filters travel as query strings. */
export const crmApi = {
  meta: () => api.get(`${base}/meta`),
  settings: () => api.get(`${base}/settings`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),
  users: () => api.get(`${base}/users`),
  clients: (q) => api.get(`${base}/clients`, { params: { q } }),
  createClient: (payload) => api.post(`${base}/clients`, payload),
  counters: (params) => api.get(`${base}/counters`, { params }),

  board: (params) => api.get(`${base}/board`, { params }),
  boardStage: (stageId, params) => api.get(`${base}/board/stage/${stageId}`, { params }),
  deals: (params) => api.get(`${base}/deals`, { params }),
  deal: (id) => api.get(`${base}/deals/${id}`),
  createDeal: (payload) => api.post(`${base}/deals`, payload),
  updateDeal: (id, payload) => api.put(`${base}/deals/${id}`, payload),
  moveDeal: (id, payload) => api.post(`${base}/deals/${id}/move`, payload),
  changePipeline: (id, payload) => api.post(`${base}/deals/${id}/pipeline`, payload),
  deleteDeal: (id) => api.delete(`${base}/deals/${id}`),
  restoreDeal: (id) => api.post(`${base}/deals/${id}/restore`),
  copyDeal: (id) => api.post(`${base}/deals/${id}/copy`),
  trash: (params) => api.get(`${base}/trash`, { params }),
  bulk: (payload) => api.post(`${base}/deals/bulk`, payload),

  events: (id, before) => api.get(`${base}/deals/${id}/events`, { params: before ? { before } : {} }),
  comment: (id, body) => api.post(`${base}/deals/${id}/comments`, { body }),
  activities: (id) => api.get(`${base}/deals/${id}/activities`),
  addActivity: (id, payload) => api.post(`${base}/deals/${id}/activities`, payload),
  updateActivity: (id, payload) => api.put(`${base}/activities/${id}`, payload),
  deleteActivity: (id) => api.delete(`${base}/activities/${id}`),

  myActivities: (params) => api.get(`${base}/activities`, { params }),
  activityBoard: (params) => api.get(`${base}/activity-board`, { params }),
  calendar: (params) => api.get(`${base}/calendar`, { params }),
  exportUrl: (params) => `/api${base}/export.csv?${new URLSearchParams(params).toString()}`,

  presets: () => api.get(`${base}/presets`),
  createPreset: (payload) => api.post(`${base}/presets`, payload),
  updatePreset: (id, payload) => api.put(`${base}/presets/${id}`, payload),
  deletePreset: (id) => api.delete(`${base}/presets/${id}`),

  pipelines: () => api.get(`${base}/pipelines`),
  createPipeline: (payload) => api.post(`${base}/pipelines`, payload),
  updatePipeline: (id, payload) => api.put(`${base}/pipelines/${id}`, payload),
  deletePipeline: (id, moveTo) => api.delete(`${base}/pipelines/${id}`, { params: moveTo ? { moveTo } : {} }),
  orderPipelines: (ids) => api.put(`${base}/pipelines/order`, { ids }),
};

/** Lists may come bare or wrapped ({ presets: [] }); accept both. */
export function listOf(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}
