import axios from 'axios';
import { clientSessionId, reportFailure } from '../lib/outage';

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
  withCredentials: true,
});

// Every request names this tab's session; outages switch on the "technical works" screen.
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['X-Client-Session'] = clientSessionId();
  return config;
});
api.interceptors.response.use(undefined, (error) => {
  reportFailure(error);
  return Promise.reject(error);
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
export const requestSignInCode = (payload) => api.post('/auth/code/request', payload);
export const verifySignInCode = (payload) => api.post('/auth/code/verify', payload);
export const signInWithMagicLink = (token) => api.post('/auth/magic', { token });
export const signInWithTelegram = (payload) => api.post('/auth/telegram', payload);
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
export const listWazzupChannels = (payload) =>
  api.post('/admin/integrations/wazzup/channels', payload || {});

export const getAdminOverview = () => api.get('/admin/overview');
export const getAdminSystem = () => api.get('/admin/system');

export const listAdminUsers = () => api.get('/admin/users');
export const createAdminUser = (payload) => api.post('/admin/users', payload);
export const getAdminUser = (id) => api.get(`/admin/users/${id}`);
export const updateAdminUser = (id, payload) => api.put(`/admin/users/${id}`, payload);
export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}`);
export const revokeAdminUserSessions = (id) => api.post(`/admin/users/${id}/revoke-sessions`);
export const unlinkAdminUserTelegram = (id) => api.delete(`/admin/users/${id}/telegram`);

export const getPermissionCatalog = () => api.get('/admin/permissions');
export const listRoles = () => api.get('/admin/roles');
export const createRole = (payload) => api.post('/admin/roles', payload);
export const updateRole = (id, payload) => api.put(`/admin/roles/${id}`, payload);
export const deleteRole = (id) => api.delete(`/admin/roles/${id}`);
export const listGroups = () => api.get('/admin/groups');
export const createGroup = (payload) => api.post('/admin/groups', payload);
export const updateGroup = (id, payload) => api.put(`/admin/groups/${id}`, payload);
export const deleteGroup = (id) => api.delete(`/admin/groups/${id}`);
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
export const linkAccountTelegram = (payload) => api.post('/account/telegram', payload);
export const unlinkAccountTelegram = () => api.delete('/account/telegram');
export const revokeOtherSessions = () => api.post('/account/sessions/revoke');
export const uploadAccountAvatar = (form) =>
  api.post('/account/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// Google (account connection, Calendar access) and the admin side of the integration
export const getAccountGoogle = () => api.get('/account/google');
export const getAccountGoogleCalendars = () => api.get('/account/google/calendars');
export const saveAccountGoogleCalendars = (selected) => api.put('/account/google/calendars', { selected });
export const disconnectAccountGoogle = () => api.delete('/account/google');
export const getAdminGoogleInfo = () => api.get('/admin/integrations/google/info');
export const disconnectAdminGmail = () => api.delete('/admin/integrations/google/gmail');
/** Full-page navigation: the OAuth flow leaves the app and comes back. */
export function startGoogle(purpose = 'signin', returnTo) {
  const params = new URLSearchParams({ purpose });
  if (returnTo) params.set('returnTo', returnTo);
  window.location.assign(`/api/auth/google/start?${params}`);
}

// Notification center
export const listNotifications = (params) => api.get('/notifications', { params });
export const getUnreadNotifications = () => api.get('/notifications/unread');
export const markNotificationsRead = (payload) => api.post('/notifications/read', payload);
export const getNotificationPrefs = () => api.get('/account/notifications');
export const saveNotificationPrefs = (payload) => api.put('/account/notifications', payload);

export default api;
