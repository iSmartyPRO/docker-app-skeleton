import api from '../../services/api';

const base = '/app/files';

export const filesApi = {
  home: () => api.get(base),
  my: () => api.get(`${base}/my`),
  folder: (id) => api.get(`${base}/folders/${id}`),
  space: (id) => api.get(`${base}/spaces/${id}/files`),
  shared: () => api.get(`${base}/shared`),
  recent: () => api.get(`${base}/recent`),
  search: (q) => api.get(`${base}/search`, { params: { q } }),
  trash: () => api.get(`${base}/trash`),
  emptyTrash: () => api.delete(`${base}/trash`),

  createSpace: (payload) => api.post(`${base}/spaces`, payload),
  updateSpace: (id, payload) => api.put(`${base}/spaces/${id}`, payload),
  deleteSpace: (id) => api.delete(`${base}/spaces/${id}`),
  spaceAccess: (id) => api.get(`${base}/spaces/${id}/access`),
  saveSpaceAccess: (id, entries) => api.put(`${base}/spaces/${id}/access`, { entries }),
  subjects: () => api.get(`${base}/subjects`),

  createFolder: (payload) => api.post(`${base}/folders`, payload),
  upload: (place, files, onProgress) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(`${base}/upload`, form, {
      params: place,
      timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  node: (id) => api.get(`${base}/nodes/${id}`),
  rename: (id, name) => api.put(`${base}/nodes/${id}`, { name }),
  move: (id, move) => api.put(`${base}/nodes/${id}`, { move }),
  trashNode: (id) => api.delete(`${base}/nodes/${id}`),
  restore: (id) => api.post(`${base}/nodes/${id}/restore`),
  purge: (id) => api.delete(`${base}/nodes/${id}/forever`),

  shares: (id) => api.get(`${base}/nodes/${id}/shares`),
  saveShares: (id, entries) => api.put(`${base}/nodes/${id}/shares`, { entries }),
  links: (id) => api.get(`${base}/nodes/${id}/links`),
  createLink: (id, payload) => api.post(`${base}/nodes/${id}/links`, payload),
  updateLink: (id, payload) => api.put(`${base}/links/${id}`, payload),
  deleteLink: (id) => api.delete(`${base}/links/${id}`),
};

export const linkApi = {
  open: (token, { folder, visitor } = {}) =>
    api.get(`/l/${encodeURIComponent(token)}`, { params: folder ? { folder } : {}, headers: visitor ? { 'X-Link-Token': visitor } : {} }),
  unlock: (token, password) => api.post(`/l/${encodeURIComponent(token)}/unlock`, { password }),
};

/** Viewer sources (same shape as the knowledge base's) for Files nodes. */
export function nodeSource() {
  return {
    file: (node, { download } = {}) => `/api${base}/nodes/${node.id}/file${download ? '?download=1' : ''}`,
    preview: (node) => `/api${base}/nodes/${node.id}/preview.pdf?v=${new Date(node.updatedAt).getTime()}`,
    canDownload: true,
  };
}

export function linkSource(token, visitor, allowDownload) {
  const q = (extra) => {
    const params = new URLSearchParams();
    if (visitor) params.set('t', visitor);
    Object.entries(extra || {}).forEach(([key, value]) => params.set(key, value));
    const text = params.toString();
    return text ? `?${text}` : '';
  };
  return {
    file: (node, { download } = {}) => `/api/l/${token}/nodes/${node.id}/file${q(download ? { download: 1 } : {})}`,
    preview: (node) => `/api/l/${token}/nodes/${node.id}/preview.pdf${q()}`,
    canDownload: allowDownload !== false,
  };
}

/** Nodes look like knowledge-base items to the shared viewers. */
export function asViewerItem(node) {
  return { ...node, title: node.name, kind: node.kind === 'file' ? 'file' : node.kind };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[index]}`;
}
