import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
  withCredentials: true,
});

const SETUP_TOKEN_KEY = 'da_setup_token';

export function setSetupToken(token) {
  const value = String(token || '').trim();
  try {
    if (value) sessionStorage.setItem(SETUP_TOKEN_KEY, value);
    else sessionStorage.removeItem(SETUP_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function setupHeaders() {
  let token = '';
  try {
    token = sessionStorage.getItem(SETUP_TOKEN_KEY) || '';
  } catch {
    /* storage unavailable */
  }
  return token ? { 'X-Setup-Token': token } : {};
}

export const getStatus = () => api.get('/status');
export const getSettings = () => api.get('/settings');
export const getHealth = () => axios.get('/health');
export const getReady = () => axios.get('/ready');

export const getSetupStatus = () => api.get('/setup/status', { headers: setupHeaders() });
export const testSetupDatabase = (payload) =>
  api.post('/setup/test-db', payload, { headers: setupHeaders() });
export const saveSetupDatabase = (payload) =>
  api.post('/setup/database', payload, { headers: setupHeaders() });
export const completeSetup = (payload) =>
  api.post('/setup/complete', payload, { headers: setupHeaders() });
export const saveSetupAccess = (payload) =>
  api.post('/setup/access', payload, { headers: setupHeaders() });

export const login = (payload) => api.post('/auth/login', payload);
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');

export const getAdminSettings = () => api.get('/admin/settings');
export const saveAdminSettings = (payload) => api.put('/admin/settings', payload);
export const uploadProjectLogo = (form, variant = 'primary') =>
  api.post('/admin/settings/logo', form, {
    params: { variant },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const removeProjectLogo = (variant = 'primary') =>
  api.delete('/admin/settings/logo', { params: { variant } });
export const testAdminIntegration = (kind, payload) =>
  api.post(`/admin/integrations/${kind}/test`, payload || {});

export const getAdminOverview = () => api.get('/admin/overview');
export const getAdminSystem = () => api.get('/admin/system');

export const listAdminUsers = () => api.get('/admin/users');
export const createAdminUser = (payload) => api.post('/admin/users', payload);
export const getAdminUser = (id) => api.get(`/admin/users/${id}`);
export const updateAdminUser = (id, payload) => api.put(`/admin/users/${id}`, payload);
export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}`);
export const revokeAdminUserSessions = (id) => api.post(`/admin/users/${id}/revoke-sessions`);
export const uploadAdminUserAvatar = (id, form) =>
  api.post(`/admin/users/${id}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const listSecurityEvents = (params) =>
  api.get('/admin/security/events', { params });
export const listIpRules = () => api.get('/admin/security/ip-rules');
export const addIpRule = (payload) => api.post('/admin/security/ip-rules', payload);
export const deleteIpRule = (id) => api.delete(`/admin/security/ip-rules/${id}`);

export const updateAccountProfile = (payload) => api.put('/account/profile', payload);
export const changeAccountPassword = (payload) => api.put('/account/password', payload);
export const revokeOtherSessions = () => api.post('/account/sessions/revoke');
export const uploadAccountAvatar = (form) =>
  api.post('/account/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export default api;
