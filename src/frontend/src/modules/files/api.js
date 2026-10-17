import api from '../../services/api';
import { formatBytes } from '../../lib/format';

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
  /** Folder uploads: makes (or reuses) these folder paths under the place; ids come back in the same order. */
  folderTree: (place, paths, bytes, signal) => api.post(`${base}/folders/tree`, { ...place, paths, bytes }, { timeout: 120000, signal }),
  upload: (place, files, onProgress, signal) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(`${base}/upload`, form, {
      params: place,
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  node: (id) => api.get(`${base}/nodes/${id}`),
  openEditor: (id, options) => api.post(`${base}/nodes/${id}/editor`, options),
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
  linkActivity: (id) => api.get(`${base}/links/${id}/activity`),
  checkSlug: (slug, linkId) => api.get(`${base}/link-slugs/check`, { params: { slug, ...(linkId ? { linkId } : {}) } }),
};

const enc = encodeURIComponent;
const visitorHeaders = (visitor) => (visitor ? { 'X-Link-Token': visitor } : {});

/** /api/l/<token>: what visitors of a public link may read and (per its permissions) change. */
export const linkApi = {
  /** `preview`: the author looking (not a view); `repeat`: a reload of a page already counted. */
  open: (token, { folder, visitor, preview, repeat } = {}) =>
    api.get(`/l/${enc(token)}`, { params: { ...(folder ? { folder } : {}), ...(preview ? { preview: 1 } : {}), ...(repeat ? { repeat: 1 } : {}) }, headers: visitorHeaders(visitor) }),
  unlock: (token, password) => api.post(`/l/${enc(token)}/unlock`, { password }),
  session: (token, visitor, payload = {}) => api.post(`/l/${enc(token)}/session`, payload, { headers: visitorHeaders(visitor) }),
  upload: (token, visitor, folder, files, onProgress, signal) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return api.post(`/l/${enc(token)}/upload`, form, {
      params: folder ? { folder } : {},
      headers: visitorHeaders(visitor),
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  replace: (token, visitor, id, file, onProgress, signal) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api.post(`/l/${enc(token)}/nodes/${id}/replace`, form, {
      headers: visitorHeaders(visitor),
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });
  },
  mkdir: (token, visitor, parentId, name) => api.post(`/l/${enc(token)}/folders`, { parentId, name }, { headers: visitorHeaders(visitor) }),
  folderTree: (token, visitor, parentId, paths, bytes, signal) =>
    api.post(`/l/${enc(token)}/folders/tree`, { parentId, paths, bytes }, { headers: visitorHeaders(visitor), timeout: 120000, signal }),
  rename: (token, visitor, id, name) => api.put(`/l/${enc(token)}/nodes/${id}`, { name }, { headers: visitorHeaders(visitor) }),
  move: (token, visitor, id, parentId) => api.put(`/l/${enc(token)}/nodes/${id}`, { move: { parentId } }, { headers: visitorHeaders(visitor) }),
  remove: (token, visitor, id) => api.delete(`/l/${enc(token)}/nodes/${id}`, { headers: visitorHeaders(visitor) }),
};

/** Viewer sources (same shape as the knowledge base's) for Files nodes. */
export function nodeSource() {
  return {
    file: (node, { download } = {}) => `/api${base}/nodes/${node.id}/file${download ? '?download=1' : ''}`,
    preview: (node) => `/api${base}/nodes/${node.id}/preview.pdf?v=${new Date(node.updatedAt).getTime()}`,
    canDownload: true,
  };
}

/**
 * File addresses of a public link. `reader` is the read token the page got
 * from the server (never the visitor session, which stays in the header):
 * addresses end up in history and logs.
 */
export function linkSource(token, reader, allowDownload) {
  const q = (extra) => {
    const params = new URLSearchParams();
    if (reader) params.set('t', reader);
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

/** File size in the interface language (lib/format.js). */
export { formatBytes };
