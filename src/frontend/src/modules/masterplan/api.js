import api from '../../services/api';

const base = '/app/masterplan';

/** The Masterplan API (docs/masterplan.md → API). */
export const mpApi = {
  meta: () => api.get(`${base}/meta`),
  settings: () => api.get(`${base}/settings`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),
  users: () => api.get(`${base}/users`),
  groups: () => api.get(`${base}/groups`),
  requestAccess: (note) => api.post(`${base}/access-request`, { note }),

  types: (archived) => api.get(`${base}/types`, { params: archived ? { archived: 1 } : {} }),
  saveTypes: (types) => api.put(`${base}/types`, { types }),
  stages: () => api.get(`${base}/stages`),
  saveStages: (set, stages) => api.put(`${base}/stages/${set}`, { stages }),

  projects: () => api.get(`${base}/projects`),
  createProject: (payload) => api.post(`${base}/projects`, payload),
  updateProject: (id, payload) => api.put(`${base}/projects/${id}`, payload),
  deleteProject: (id) => api.delete(`${base}/projects/${id}`),
  map: (id, presentation) => api.get(`${base}/projects/${id}/map`, { params: presentation ? { presentation: 1 } : {}, timeout: 60000 }),
  team: (id) => api.get(`${base}/projects/${id}/team`),
  saveTeam: (id, team) => api.put(`${base}/projects/${id}/team`, { team }),
  construction: (id, params) => api.get(`${base}/projects/${id}/construction`, { params }),
  dashboard: (id) => api.get(`${base}/projects/${id}/dashboard`),
  priceGrids: (id) => api.get(`${base}/projects/${id}/price-grids`),
  createPriceGrid: (id, payload) => api.post(`${base}/projects/${id}/price-grids`, payload),
  deletePriceGrid: (id) => api.delete(`${base}/price-grids/${id}`),
  createPlan: (id, payload) => api.post(`${base}/projects/${id}/plans`, payload),
  updatePlan: (id, payload) => api.put(`${base}/plans/${id}`, payload),
  deletePlan: (id) => api.delete(`${base}/plans/${id}`),
  saveContours: (id, contours) => api.put(`${base}/plans/${id}/contours`, { contours }),

  createNode: (payload) => api.post(`${base}/nodes`, payload),
  bulkNodes: (payload) => api.post(`${base}/nodes/bulk`, payload),
  node: (id, presentation) => api.get(`${base}/nodes/${id}`, { params: presentation ? { presentation: 1 } : {} }),
  updateNode: (id, payload) => api.put(`${base}/nodes/${id}`, payload),
  deleteNode: (id) => api.delete(`${base}/nodes/${id}`),
  moveNode: (id, payload) => api.post(`${base}/nodes/${id}/move`, payload),
  bulkMove: (payload) => api.post(`${base}/nodes/bulk-move`, payload),
  events: (id, before) => api.get(`${base}/nodes/${id}/events`, { params: before ? { before } : {} }),
  updateStage: (id, stageId, payload) => api.put(`${base}/nodes/${id}/stages/${stageId}`, payload),
  setReadiness: (id, readiness) => api.put(`${base}/nodes/${id}/readiness`, { readiness }),

  units: (params) => api.get(`${base}/units`, { params, timeout: 60000 }),
  exportUrl: (params) => `/api${base}/units/export.csv?${new URLSearchParams(params).toString()}`,
  importUnits: (payload) => api.post(`${base}/units/import`, payload, { timeout: 120000 }),
  bulkPrice: (payload) => api.post(`${base}/units/bulk-price`, payload),
  bulkStatus: (payload) => api.post(`${base}/units/bulk-status`, payload),
  setStatus: (id, payload) => api.post(`${base}/units/${id}/status`, payload),
  migrate: (id, payload) => api.post(`${base}/units/${id}/migrate`, payload),
  migrateMany: (payload) => api.post(`${base}/units/migrate`, payload, { timeout: 120000 }),
  extend: (id, payload) => api.post(`${base}/units/${id}/extend`, payload),
  assignManager: (id, payload) => api.post(`${base}/units/${id}/manager`, payload),
  bookings: (params) => api.get(`${base}/bookings`, { params }),
  dealUnits: (dealId) => api.get(`${base}/deals/${dealId}/units`),

  reports: (params) => api.get(`${base}/reports`, { params }),
  createReport: (payload) => api.post(`${base}/reports`, payload),
  reviewReport: (id, payload) => api.post(`${base}/reports/${id}/review`, payload),
  deleteReport: (id) => api.delete(`${base}/reports/${id}`),

  upload: (form, onUploadProgress) => api.post(`${base}/media`, form, { timeout: 300000, onUploadProgress }),
  deleteMedia: (id) => api.delete(`${base}/media/${id}`),
  streamUrl: (projectId) => `/api${base}/stream?project=${projectId}`,
};

export const errorCode = (err) => err?.response?.data?.code || null;
