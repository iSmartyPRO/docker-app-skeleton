import api from '../../../services/api';
import { folderUrl as driveFolderUrl } from '../api';

const base = '/app/drive/access';
export const ACCESS_ROOT = '/app/drive/access';

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** File server «Доступ» API (/api/app/drive/access). Changes run as the signed-in administrator's AD account. */
export const faApi = {
  overview: () => api.get(base),
  folders: (params) => api.get(`${base}/folders`, { params, timeout: 30000 }),
  folder: (key) => api.get(`${base}/folders/${encodeURIComponent(key)}`, { timeout: 30000 }),
  // The «Доступ» panel of a File server folder: its group pairs with members, inherited ones above.
  at: (shareId, path) => api.get(`${base}/at`, { params: { shareId, path }, timeout: 30000 }),
  people: (q, kind) => api.get(`${base}/people`, { params: { q, kind } }),
  person: (dn) => api.get(`${base}/person`, { params: { dn } }),
  savePassword: (password) => api.put(`${base}/password`, { password }, { timeout: 30000 }),

  members: (groupDn, members, action) => api.post(`${base}/members`, { groupDn, members, action }, { timeout: 60000 }),
  move: (fromDn, toDn, members) => api.post(`${base}/members/move`, { fromDn, toDn, members }, { timeout: 60000 }),
  copy: (fromDn, toDn) => api.post(`${base}/members/copy`, { fromDn, toDn }, { timeout: 60000 }),
  revokeAll: (memberDn) => api.post(`${base}/members/revoke-all`, { memberDn, confirm: true }, { timeout: 60000 }),

  createPair: (body) => api.post(`${base}/groups`, body, { timeout: 60000 }),
  describe: (dn, description) => api.put(`${base}/groups/description`, { dn, description }),
  deleteGroup: (dn, confirm) => api.post(`${base}/groups/delete`, { dn, confirm }),

  journal: (params) => api.get(`${base}/journal`, { params, timeout: 30000 }),
  journalPeople: () => api.get(`${base}/journal/people`),
  journalExportUrl: (params) => `/api${base}/journal/export.csv${qs(params)}`,
  undo: (id, confirm = false) => api.post(`${base}/journal/${id}/undo`, confirm ? { confirm: true } : {}, { timeout: 60000 }),

  // NTFS mode (superadministrators); every call runs with the administrator's own AD account.
  ntfsAcl: (shareId, path) => api.get(`${base}/ntfs/acl`, { params: { shareId, path }, timeout: 60000 }),
  ntfsSubjects: (q) => api.get(`${base}/ntfs/subjects`, { params: { q } }),
  ntfsPreview: (body) => api.post(`${base}/ntfs/preview`, body, { timeout: 60000 }),
  ntfsApply: (body) => api.post(`${base}/ntfs/apply`, body, { timeout: 60000 }),
  ntfsUndo: (id, body = {}) => api.post(`${base}/ntfs/journal/${id}/undo`, body, { timeout: 60000 }),
  ntfsPropagate: (body) => api.post(`${base}/ntfs/propagate`, body, { timeout: 60000 }),
  ntfsJob: (id) => api.get(`${base}/ntfs/jobs/${encodeURIComponent(id)}`),
  ntfsJobs: () => api.get(`${base}/ntfs/jobs`),
  ntfsCancelJob: (id) => api.post(`${base}/ntfs/jobs/${encodeURIComponent(id)}/cancel`, {}),
  ntfsReportStart: () => api.post(`${base}/ntfs/report`, {}, { timeout: 60000 }),
  ntfsReport: (id) => api.get(`${base}/ntfs/report`, { params: { id } }),
  ntfsReportCancel: (id) => api.post(`${base}/ntfs/report/${encodeURIComponent(id)}/cancel`, {}),
};

export const CREDENTIAL_CODES = ['FA_CREDENTIALS_REQUIRED', 'FA_CREDENTIALS_FAILED'];

export const errorCode = (err) => err?.response?.data?.code || err?.code || null;

/** An error in words: the module's texts by code, else the server message. */
export function faError(err, t) {
  const code = errorCode(err);
  if (code) {
    const key = `folderAccess.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return err?.response?.data?.error || err?.message || t('folderAccess.errors.generic');
}

export const folderUrl = (key) => `${ACCESS_ROOT}/f/${encodeURIComponent(key)}`;

/**
 * A File server folder with its «Доступ» panel open: `tab` = 'groups' | 'ntfs'; `fix` (a report
 * row's draft step) is applied to the NTFS draft on open.
 */
export function panelUrl(shareId, path, tab = 'groups', fix = null) {
  const search = new URLSearchParams({ access: tab });
  if (fix) search.set('fix', JSON.stringify(fix));
  return `${driveFolderUrl(shareId, path || '')}?${search.toString()}`;
}

/** The NTFS editor on a folder (the File server folder with the panel's NTFS tab). */
export const ntfsUrl = (shareId, path, fix) => panelUrl(shareId, path, 'ntfs', fix);

export const personUrl = (dn) => `${ACCESS_ROOT}/person?dn=${encodeURIComponent(dn)}`;
