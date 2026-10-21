import api from '../../services/api';

const base = '/app/qr';

export const qrApi = {
  bootstrap: () => api.get(base),
  codes: () => api.get(`${base}/codes`),
  code: (id) => api.get(`${base}/codes/${id}`),
  create: (payload) => api.post(`${base}/codes`, payload),
  update: (id, payload) => api.put(`${base}/codes/${id}`, payload),
  remove: (id) => api.delete(`${base}/codes/${id}`),
  stats: (id, days = 30) => api.get(`${base}/codes/${id}/stats`, { params: { days } }),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api.post(`${base}/assets`, form);
  },

  templates: () => api.get(`${base}/admin/templates`),
  createTemplate: (payload) => api.post(`${base}/admin/templates`, payload),
  updateTemplate: (id, payload) => api.put(`${base}/admin/templates/${id}`, payload),
  deleteTemplate: (id) => api.delete(`${base}/admin/templates/${id}`),
  setDefault: (id) => api.post(`${base}/admin/templates/${id}/default`),
  reorder: (ids) => api.put(`${base}/admin/templates-order`, { ids }),
  restore: () => api.post(`${base}/admin/templates/restore`),
};

/** A template's name and description in the reader's language. */
export function templateText(template, locale) {
  const own = template?.i18n?.[locale] || {};
  const en = template?.i18n?.en || {};
  return {
    name: own.name || template?.name || en.name || '',
    description: own.description || (own.name ? '' : template?.description) || en.description || '',
  };
}
