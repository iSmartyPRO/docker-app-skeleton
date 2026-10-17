import api from '../../services/api';
import { formatBytes } from '../../lib/format';

const base = '/app/drive';

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const driveApi = {
  home: () => api.get(base),
  list: (shareId, path, hidden) => api.get(`${base}/shares/${shareId}/list`, { params: { path, hidden: hidden ? 1 : undefined } }),
  stat: (shareId, path) => api.get(`${base}/shares/${shareId}/stat`, { params: { path } }),
  openEditor: (shareId, path, options) => api.post(`${base}/shares/${shareId}/editor`, { path, ...options }),
  search: (shareId, path, q) => api.get(`${base}/shares/${shareId}/search`, { params: { path, q }, timeout: 30000 }),
  mkdir: (shareId, path, name) => api.post(`${base}/shares/${shareId}/folders`, { path, name }),
  /** Folder uploads: makes (or reuses) these folder paths under `path`; [{ path, error }] in the same order. */
  folderTree: (shareId, path, paths, signal) => api.post(`${base}/shares/${shareId}/folders/tree`, { path, paths }, { timeout: 120000, signal }),
  rename: (shareId, path, name) => api.put(`${base}/shares/${shareId}/rename`, { path, name }),
  remove: (shareId, paths) => api.post(`${base}/shares/${shareId}/delete`, { paths }, { timeout: 0 }),
  move: (shareId, payload) => api.post(`${base}/shares/${shareId}/move`, payload, { timeout: 0 }),
  saveText: (shareId, path, text, mtime) =>
    api.put(`${base}/shares/${shareId}/text`, text, { params: { path, mtime }, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
  upload: (shareId, path, file, { conflict = 'rename', onProgress, signal } = {}) =>
    api.put(`${base}/shares/${shareId}/upload`, file, {
      params: { path, name: file.name, conflict },
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    }),

  recent: () => api.get(`${base}/recent`),
  touchRecent: (payload) => api.post(`${base}/recent`, payload),
  favorites: () => api.get(`${base}/favorites`),
  addFavorite: (payload) => api.post(`${base}/favorites`, payload),
  removeFavorite: (shareId, path) => api.delete(`${base}/favorites`, { params: { shareId, path } }),

  connections: () => api.get(`${base}/connections`),
  connect: (serverId, payload) => api.put(`${base}/connections/${serverId}`, payload, { timeout: 30000 }),
  disconnect: (serverId) => api.delete(`${base}/connections/${serverId}`),

  links: (params) => api.get(`${base}/links`, { params }),
  createLink: (shareId, payload) => api.post(`${base}/shares/${shareId}/links`, payload),
  updateLink: (id, payload) => api.put(`${base}/links/${id}`, payload),
  deleteLink: (id) => api.delete(`${base}/links/${id}`),
  checkSlug: (slug, linkId) => api.get(`${base}/link-slugs/check`, { params: { slug, ...(linkId ? { linkId } : {}) } }),

  admin: () => api.get(`${base}/admin`),
  adminLinks: () => api.get(`${base}/admin/links`),
  testServer: (payload) => api.post(`${base}/admin/test`, payload, { timeout: 30000 }),
  createServer: (payload) => api.post(`${base}/admin/servers`, payload),
  updateServer: (id, payload) => api.put(`${base}/admin/servers/${id}`, payload),
  deleteServer: (id) => api.delete(`${base}/admin/servers/${id}`),
  createShare: (serverId, payload) => api.post(`${base}/admin/servers/${serverId}/shares`, payload),
  updateShare: (serverId, id, payload) => api.put(`${base}/admin/servers/${serverId}/shares/${id}`, payload),
  deleteShare: (id) => api.delete(`${base}/admin/shares/${id}`),
  reorder: (ids) => api.put(`${base}/admin/order`, { ids }),

  activity: (params) => api.get(`${base}/admin/activity`, { params, timeout: 30000 }),
  activityPeople: (q) => api.get(`${base}/admin/activity/people`, { params: { q } }),
  activityExportUrl: (params) => `/api${base}/admin/activity/export.csv${qs(params)}`,
};

const linkHeaders = (visitor) => (visitor ? { 'X-Link-Token': visitor } : {});
const linkBase = (token) => `/d/${encodeURIComponent(token)}`;

/**
 * Visitors of a public link. Changes carry the visitor session in the
 * X-Link-Token header (never in the address): `visitor` is the token from
 * unlock().
 */
export const publicDriveApi = {
  /** `preview`: the author looking (not a view); `repeat`: a reload of a page already counted. */
  open: (token, { path, visitor, preview, repeat } = {}) =>
    api.get(linkBase(token), { params: { ...(path ? { path } : {}), ...(preview ? { preview: 1 } : {}), ...(repeat ? { repeat: 1 } : {}) }, headers: linkHeaders(visitor) }),
  /** Opens a visitor session: { password?, name?, email? } → { token, visitor }. */
  unlock: (token, body = {}, visitor) => api.post(`${linkBase(token)}/unlock`, body, { headers: linkHeaders(visitor) }),
  mine: (token, visitor) => api.get(`${linkBase(token)}/mine`, { headers: linkHeaders(visitor) }),
  upload: (token, visitor, path, file, { conflict = 'fail', onProgress, signal } = {}) =>
    api.put(`${linkBase(token)}/upload`, file, {
      params: { path, name: file.name, conflict },
      headers: { 'Content-Type': 'application/octet-stream', ...linkHeaders(visitor) },
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    }),
  replace: (token, visitor, path, file, { onProgress, signal } = {}) =>
    api.put(`${linkBase(token)}/replace`, file, {
      params: { path },
      headers: { 'Content-Type': 'application/octet-stream', ...linkHeaders(visitor) },
      timeout: 0,
      signal,
      onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
    }),
  mkdir: (token, visitor, path, name) => api.post(`${linkBase(token)}/folders`, { path, name }, { headers: linkHeaders(visitor) }),
  folderTree: (token, visitor, path, paths, signal) => api.post(`${linkBase(token)}/folders/tree`, { path, paths }, { headers: linkHeaders(visitor), timeout: 120000, signal }),
  rename: (token, visitor, path, name) => api.put(`${linkBase(token)}/rename`, { path, name }, { headers: linkHeaders(visitor) }),
  remove: (token, visitor, paths) => api.post(`${linkBase(token)}/delete`, { paths }, { headers: linkHeaders(visitor), timeout: 0 }),
};

/**
 * Viewer sources: the same shape the knowledge-base viewers use
 * (file, preview, canDownload) plus thumb, cad and zip.
 */
export function shareSource(shareId) {
  const root = `/api${base}/shares/${shareId}`;
  const v = (entry) => (entry.mtime ? new Date(entry.mtime).getTime() : '');
  return {
    file: (entry, { download } = {}) => `${root}/file${qs({ path: entry.path, download: download ? 1 : undefined, v: v(entry) })}`,
    preview: (entry) => `${root}/preview.pdf${qs({ path: entry.path, v: v(entry) })}`,
    thumb: (entry, size = 320) => `${root}/thumb${qs({ path: entry.path, size, v: v(entry) })}`,
    cad: (entry) => `${root}/cad${qs({ path: entry.path, v: v(entry) })}`,
    zip: (paths) => `${root}/zip${qs({ p: paths })}`,
    canDownload: true,
  };
}

/**
 * File addresses of a public link. `reader` is the read token the page got
 * from the server (never the visitor session, which stays in the header):
 * addresses end up in history and logs.
 */
export function linkSource(token, reader, allowDownload) {
  const root = `/api/d/${encodeURIComponent(token)}`;
  const auth = reader ? { t: reader } : {};
  return {
    file: (entry, { download } = {}) => `${root}/file${qs({ path: entry.path, download: download ? 1 : undefined, ...auth })}`,
    preview: (entry) => `${root}/preview.pdf${qs({ path: entry.path, ...auth })}`,
    thumb: (entry, size = 320) => `${root}/thumb${qs({ path: entry.path, size, ...auth })}`,
    cad: (entry) => `${root}/cad${qs({ path: entry.path, ...auth })}`,
    zip: (path) => `${root}/zip${qs({ path, ...auth })}`,
    canDownload: allowDownload !== false,
  };
}

/** Drive entries in the shape the shared viewers expect. */
export function asViewerItem(entry) {
  return {
    ...entry,
    id: entry.path,
    kind: 'file',
    title: entry.name,
    file: { ext: entry.ext, size: entry.size, name: entry.name },
  };
}

export const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
export const CAD = new Set(['dwg', 'dxf']);
export const EDITABLE = new Set(['md', 'txt', 'csv', 'json', 'xml', 'log']);

/** File size in the interface language (lib/format.js). */
export { formatBytes };

/** Folder path → URL under /app/drive/s/:shareId/… */
export function folderUrl(shareId, path = '') {
  return `/app/drive/s/${shareId}${path ? `/${path.split('/').map(encodeURIComponent).join('/')}` : ''}`;
}

/** File path → the online editor page under /app/drive/e/:shareId/… */
export function editUrl(shareId, path) {
  return `/app/drive/e/${shareId}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** File path → its own viewer page under /app/drive/v/:shareId/… */
export function fileUrl(shareId, path) {
  return `/app/drive/v/${shareId}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Drive errors in the UI language (`drive.errors.<CODE>`), else the server text. */
export function driveError(err, t, fallback) {
  const code = err?.response?.data?.code || err?.code;
  if (code) {
    const key = `drive.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return err?.response?.data?.error || fallback || err?.message || 'Error';
}

export function tOr(t, key, fallbackKey) {
  const text = t(key);
  return text === key ? t(fallbackKey) : text;
}
