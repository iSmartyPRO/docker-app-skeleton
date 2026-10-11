import api from '../../services/api';

const base = '/app/companies';

export const cmpApi = {
  meta: () => api.get(`${base}/meta`),
  staff: () => api.get(`${base}/staff`),
  search: (q) => api.get(`${base}/search`, { params: { q } }),
  lookup: (country, id) => api.post(`${base}/lookup`, { country, id }, { timeout: 60000 }),
  duplicates: (params) => api.get(`${base}/duplicates`, { params }),

  companies: (params) => api.get(`${base}/companies`, { params }),
  company: (id) => api.get(`${base}/companies/${id}`),
  createCompany: (payload) => api.post(`${base}/companies`, payload),
  updateCompany: (id, payload) => api.put(`${base}/companies/${id}`, payload),
  archiveCompany: (id, reason) => api.post(`${base}/companies/${id}/archive`, { reason }),
  restoreCompany: (id) => api.post(`${base}/companies/${id}/restore`),
  deleteCompany: (id) => api.delete(`${base}/companies/${id}`),
  verify: (id) => api.post(`${base}/companies/${id}/verify`, null, { timeout: 60000 }),
  apply: (id, payload) => api.post(`${base}/companies/${id}/apply`, payload),
  uploadFile: (id, file) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api.post(`${base}/companies/${id}/files`, form, { timeout: 0 });
  },
  deleteFile: (id) => api.delete(`${base}/files/${id}`),
  fileUrl: (id, download) => `/api${base}/files/${id}${download ? '?download=1' : ''}`,

  people: (params) => api.get(`${base}/people`, { params }),
  person: (id) => api.get(`${base}/people/${id}`),
  createPerson: (payload) => api.post(`${base}/people`, payload),
  updatePerson: (id, payload) => api.put(`${base}/people/${id}`, payload),
  archivePerson: (id, reason) => api.post(`${base}/people/${id}/archive`, { reason }),
  restorePerson: (id) => api.post(`${base}/people/${id}/restore`),
  deletePerson: (id) => api.delete(`${base}/people/${id}`),
  addPosition: (personId, payload) => api.post(`${base}/people/${personId}/positions`, payload),
  updatePosition: (id, payload) => api.put(`${base}/positions/${id}`, payload),
  endPosition: (id, payload) => api.post(`${base}/positions/${id}/end`, payload),
  deletePosition: (id) => api.delete(`${base}/positions/${id}`),

  timeline: (type, id, params) => api.get(`${base}/${type}/${id}/timeline`, { params }),
  addNote: (type, id, payload) => api.post(`${base}/${type}/${id}/notes`, payload),
  deleteEvent: (id) => api.delete(`${base}/events/${id}`),
  ratings: (type, id) => api.get(`${base}/${type}/${id}/ratings`),
  rate: (type, id, payload) => api.post(`${base}/${type}/${id}/ratings`, payload),

  setDadataKey: (key) => api.put(`${base}/admin/dadata`, { key }),
};

/** Field label in the UI language: built-in fields, identifiers of the country, custom fields. */
export function fieldLabel(t, field, meta, country, locale) {
  if (field.startsWith('ids.')) {
    const key = field.slice(4);
    const def = (meta?.countries?.[country]?.ids || []).find((item) => item.key === key) ||
      Object.values(meta?.countries || {}).flatMap((profile) => profile.ids).find((item) => item.key === key);
    return def ? def.label[locale] || def.label.en : key;
  }
  if (field.startsWith('custom.')) {
    const def = (meta?.settings?.customFields || []).find((item) => item.key === field.slice(7));
    return def?.label || field.slice(7);
  }
  if (field.startsWith('messengers.')) return t(`companies.messenger.${field.slice(11)}`);
  const key = `companies.f.${field}`;
  const text = t(key);
  return text === key ? field : text;
}

export function relationLabel(t, relation) {
  if (relation?.label) return relation.label;
  const key = `companies.relation.${relation?.key}`;
  const text = t(key);
  return text === key ? relation?.key : text;
}

export const personName = (person) => [person?.last_name, person?.first_name, person?.middle_name].filter(Boolean).join(' ') || person?.fullName || '';

export function initials(text) {
  const words = String(text || '')
    .replace(/[«»"']/g, '')
    .replace(/^(ОсОО|ООО|ОАО|ЗАО|ПАО|АО|ИП|ТОО|НАО|LLC|Ltd|JSC)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

/** Stable pleasant colour per name for avatars. */
export function colorFor(text) {
  const palette = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0891B2', '#4F46E5', '#CA8A04', '#DC2626', '#0D9488'];
  let hash = 0;
  for (const ch of String(text || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return palette[hash % palette.length];
}
