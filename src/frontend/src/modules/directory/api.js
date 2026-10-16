import api from '../../services/api';

const base = '/app/directory';
export const DIRECTORY_ROOT = '/app/directory';

/** AD directory API (/api/app/directory, docs/directory.md). Changes run as the signed-in administrator's own AD account. */
export const adApi = {
  overview: () => api.get(base),
  tree: (dn) => api.get(`${base}/tree`, { params: dn ? { dn } : {}, timeout: 30000 }),
  objects: (params) => api.get(`${base}/objects`, { params, timeout: 30000 }),
  object: (dn) => api.get(`${base}/object`, { params: { dn }, timeout: 30000 }),
  groups: (q) => api.get(`${base}/groups`, { params: { q } }),
  find: (q, kinds = 'user') => api.get(`${base}/find`, { params: { q, kinds } }),
  suggestLogin: (person) => api.get(`${base}/login`, { params: person }),
  checkLogin: (login, upn) => api.get(`${base}/login/check`, { params: { login, upn } }),
  journal: (params) => api.get(`${base}/journal`, { params, timeout: 30000 }),
  browse: (dn) => api.get(`${base}/browse`, { params: dn ? { dn } : {}, timeout: 30000 }),
  employees: (q) => api.get(`${base}/employees`, { params: { q } }),

  createUser: (body) => api.post(`${base}/users`, body, { timeout: 60000 }),
  attributes: (dn, changes) => api.put(`${base}/object/attributes`, { dn, changes }, { timeout: 30000 }),
  bulk: (body) => api.post(`${base}/bulk`, body, { timeout: 120000 }),
  unlock: (dn) => api.post(`${base}/unlock`, { dn }, { timeout: 30000 }),
  password: (body) => api.post(`${base}/password`, body, { timeout: 30000 }),
  members: (body) => api.post(`${base}/members`, body, { timeout: 60000 }),
  saveCredential: (password) => api.put(`${base}/credential`, { password }, { timeout: 30000 }),
  secureCheck: () => api.post(`${base}/secure-check`, {}, { timeout: 30000 }),

  portalUser: (dn, username) => api.post(`${base}/portal-user`, { dn, username }),
  portalLink: (dn, userId) => api.post(`${base}/portal-link`, { dn, userId }),
  portalUnlink: (dn) => api.post(`${base}/portal-unlink`, { dn }),
  employeeLink: (dn, employeeId) => api.post(`${base}/employee-link`, { dn, employeeId }),
  employeeUnlink: (employeeId) => api.post(`${base}/employee-unlink`, { employeeId }),
};

export const CREDENTIAL_CODES = ['FA_CREDENTIALS_REQUIRED', 'FA_CREDENTIALS_FAILED'];
export const errorCode = (err) => err?.response?.data?.code || err?.code || null;
export const errorInfo = (err) => err?.response?.data?.info || err?.response?.data?.details || null;

/** An error in words: this module's texts by code, else the server message. */
export function adError(err, t) {
  const code = errorCode(err);
  if (code) {
    const key = `directory.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return err?.response?.data?.error || err?.message || t('directory.errors.generic');
}

/** The directory page with an object open. */
export const objectUrl = (dn, ou) => `${DIRECTORY_ROOT}?${new URLSearchParams({ ...(ou ? { ou } : {}), open: dn }).toString()}`;
