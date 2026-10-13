import api from '../../services/api';

const base = '/app/approvals';
const enc = encodeURIComponent;

/** The approvals API (docs/approvals.md → HTTP API). */
export const approvalsApi = {
  meta: () => api.get(`${base}/meta`),
  inbox: (params) => api.get(`${base}/inbox`, { params }),
  count: (fresh = false) => api.get(`${base}/inbox/count`, fresh ? { params: { fresh: 1 } } : undefined),
  act: (payload) => api.post(`${base}/inbox/act`, payload),
  bulk: (items) => api.post(`${base}/inbox/bulk`, { items }),
  mine: (params) => api.get(`${base}/mine`, { params }),
  decided: (params) => api.get(`${base}/decided`, { params }),

  processById: (id) => api.get(`${base}/processes/${id}`),
  decide: (id, payload) => api.post(`${base}/processes/${id}/decide`, payload),
  answer: (id, comment) => api.post(`${base}/processes/${id}/answer`, { comment }),
  process: (type, docId) => api.get(`${base}/process/${enc(type)}/${enc(docId)}`),
  start: (type, docId, payload) => api.post(`${base}/process/${enc(type)}/${enc(docId)}/start`, payload || {}),
  withdraw: (type, docId, payload) => api.post(`${base}/process/${enc(type)}/${enc(docId)}/withdraw`, payload || {}),
  restart: (type, docId, payload) => api.post(`${base}/process/${enc(type)}/${enc(docId)}/restart`, payload || {}),

  subjects: () => api.get(`${base}/subjects`),
  routes: () => api.get(`${base}/routes`),
  route: (type) => api.get(`${base}/routes/${enc(type)}`),
  saveRoute: (type, route) => api.put(`${base}/routes/${enc(type)}`, route),
  resetRoute: (type) => api.delete(`${base}/routes/${enc(type)}`),
  preview: (type, values, draft) => api.post(`${base}/routes/${enc(type)}/preview`, { values, draft }),
  fieldOptions: (type, field) => api.get(`${base}/routes/${enc(type)}/fields/${enc(field)}/options`),
  saveSettings: (settings) => api.put(`${base}/settings`, settings),

  substitutes: (all) => api.get(`${base}/substitutes`, { params: all ? { all: 1 } : {} }),
  addSubstitute: (payload) => api.post(`${base}/substitutes`, payload),
  removeSubstitute: (id) => api.delete(`${base}/substitutes/${id}`),
};

/** Tells the header badge and widgets that the inbox changed (after a decision). */
export function inboxChanged() {
  try {
    window.dispatchEvent(new Event('approvals:changed'));
  } catch {
    /* no window */
  }
}
