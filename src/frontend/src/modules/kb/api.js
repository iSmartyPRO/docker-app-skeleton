import api from '../../services/api';

const base = '/app/kb';

export const kbApi = {
  home: () => api.get(base),
  tree: () => api.get(`${base}/tree`),
  search: (q) => api.get(`${base}/search`, { params: { q } }),
  folder: (id) => api.get(`${base}/folders/${id}`),
  createFolder: (payload) => api.post(`${base}/folders`, payload),
  updateFolder: (id, payload) => api.put(`${base}/folders/${id}`, payload),
  deleteFolder: (id) => api.delete(`${base}/folders/${id}`),
  upload: (folderId, files, onProgress) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(`${base}/folders/${folderId}/files`, form, {
      timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  // Pictures and files for the visual editor: `place` is { itemId } or { folderId }.
  media: (place, files) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    const path = place.itemId ? `items/${place.itemId}` : `folders/${place.folderId}`;
    return api.post(`${base}/${path}/media`, form, { timeout: 0 });
  },
  item: (id) => api.get(`${base}/items/${id}`),
  createItem: (payload) => api.post(`${base}/items`, payload),
  updateItem: (id, payload) => api.put(`${base}/items/${id}`, payload),
  deleteItem: (id) => api.delete(`${base}/items/${id}`),
  subjects: () => api.get(`${base}/subjects`),
  access: (type, id) => api.get(`${base}/access/${type}/${id || 0}`),
  saveAccess: (type, id, payload) => api.put(`${base}/access/${type}/${id || 0}`, payload),
  shares: (folderId) => api.get(`${base}/folders/${folderId}/shares`),
  createShare: (folderId, payload) => api.post(`${base}/folders/${folderId}/shares`, payload),
  updateShare: (id, payload) => api.put(`${base}/shares/${id}`, payload),
  deleteShare: (id) => api.delete(`${base}/shares/${id}`),
  checkSlug: (params) => api.get(`${base}/shares/check`, { params }),
  fromFiles: (folderId, nodeIds) => api.post(`${base}/folders/${folderId}/from-files`, { nodeIds }),
};

export const publicApi = {
  open: (slug, { folder, token } = {}) =>
    api.get(`/s/${encodeURIComponent(slug)}`, { params: folder ? { folder } : {}, headers: token ? { 'X-Share-Token': token } : {} }),
  unlock: (slug, password) => api.post(`/s/${encodeURIComponent(slug)}/unlock`, { password }),
  item: (slug, id, token) =>
    api.get(`/s/${encodeURIComponent(slug)}/items/${id}`, { headers: token ? { 'X-Share-Token': token } : {} }),
};

/**
 * Where a viewer loads bytes from. Signed-in users use cookie-authenticated
 * URLs; public visitors carry the share token in the query string because
 * <img>, <video> and pdf.js cannot send custom headers.
 */
export function privateSource() {
  return {
    file: (item, { download } = {}) => `/api${base}/items/${item.id}/file${download ? '?download=1' : ''}`,
    preview: (item) => `/api${base}/items/${item.id}/preview.pdf?v=${new Date(item.updatedAt).getTime()}`,
    itemPath: (item) => `/app/kb/d/${item.id}`,
    folderPath: (folderId) => `/app/kb/f/${folderId}`,
    attachment: (item, nodeId, { download } = {}) => `/api${base}/items/${item.id}/attachments/${nodeId}${download ? '?download=1' : ''}`,
    attachmentPreview: (item, nodeId) => `/api${base}/items/${item.id}/attachments/${nodeId}/preview.pdf`,
    canDownload: true,
  };
}

export function publicSource(slug, token, allowDownload) {
  const q = (extra) => {
    const params = new URLSearchParams();
    if (token) params.set('t', token);
    Object.entries(extra || {}).forEach(([key, value]) => params.set(key, value));
    const text = params.toString();
    return text ? `?${text}` : '';
  };
  return {
    file: (item, { download } = {}) => `/api/s/${slug}/items/${item.id}/file${q(download ? { download: 1 } : {})}`,
    preview: (item) => `/api/s/${slug}/items/${item.id}/preview.pdf${q()}`,
    itemPath: (item) => `/s/${slug}/d/${item.id}`,
    attachment: (item, nodeId, { download } = {}) => `/api/s/${slug}/items/${item.id}/attachments/${nodeId}${q(download ? { download: 1 } : {})}`,
    attachmentPreview: (item, nodeId) => `/api/s/${slug}/items/${item.id}/attachments/${nodeId}/preview.pdf${q()}`,
    folderPath: (folderId, rootId) => (folderId === rootId ? `/s/${slug}` : `/s/${slug}/f/${folderId}`),
    canDownload: allowDownload !== false,
  };
}
