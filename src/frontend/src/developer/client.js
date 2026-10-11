import api from '../services/api';

/* HTTP calls of the API console, personal tokens and the developer portal. */

export const consoleApi = {
  overview: () => api.get('/admin/api/'),
  meta: () => api.get('/admin/api/meta'),
  saveConfig: (patch) => api.put('/admin/api/config', patch),
  tokens: (params) => api.get('/admin/api/tokens', { params }),
  createToken: (body) => api.post('/admin/api/tokens', body),
  updateToken: (id, body) => api.put(`/admin/api/tokens/${id}`, body),
  revokeToken: (id) => api.post(`/admin/api/tokens/${id}/revoke`),
  rotateToken: (id) => api.post(`/admin/api/tokens/${id}/rotate`),
  deleteToken: (id) => api.delete(`/admin/api/tokens/${id}`),
  templates: () => api.get('/admin/api/templates'),
  createTemplate: (body) => api.post('/admin/api/templates', body),
  updateTemplate: (id, body) => api.put(`/admin/api/templates/${id}`, body),
  deleteTemplate: (id) => api.delete(`/admin/api/templates/${id}`),
  webhooks: () => api.get('/admin/api/webhooks'),
  createWebhook: (body) => api.post('/admin/api/webhooks', body),
  updateWebhook: (id, body) => api.put(`/admin/api/webhooks/${id}`, body),
  pingWebhook: (id) => api.post(`/admin/api/webhooks/${id}/ping`, null, { timeout: 30000 }),
  rotateWebhook: (id) => api.post(`/admin/api/webhooks/${id}/secret`),
  deleteWebhook: (id) => api.delete(`/admin/api/webhooks/${id}`),
  deliveries: (params) => api.get('/admin/api/deliveries', { params }),
  redeliver: (id) => api.post(`/admin/api/deliveries/${id}/redeliver`, null, { timeout: 30000 }),
  requests: (params) => api.get('/admin/api/requests', { params }),
  stats: (params) => api.get('/admin/api/stats', { params }),
};

export const personalApi = {
  load: () => api.get('/account/api/'),
  createToken: (body) => api.post('/account/api/tokens', body),
  updateToken: (id, body) => api.put(`/account/api/tokens/${id}`, body),
  revokeToken: (id) => api.post(`/account/api/tokens/${id}/revoke`),
  rotateToken: (id) => api.post(`/account/api/tokens/${id}/rotate`),
  deleteToken: (id) => api.delete(`/account/api/tokens/${id}`),
  requests: (params) => api.get('/account/api/requests', { params }),
};

export const developerApi = {
  reference: () => api.get('/developer/reference'),
};

/**
 * A raw call through /api/v1, as an integration would make it. With a token
 * the request carries `Authorization`; without one the session cookie is used.
 */
export async function rawCall({ method, path, token, body }) {
  const started = performance.now();
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && body !== null && method !== 'GET') headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: token ? 'omit' : 'include',
    body: body !== undefined && body !== null && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const picked = {};
  for (const name of ['x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'content-type']) {
    const value = response.headers.get(name);
    if (value) picked[name] = value;
  }
  return { status: response.status, ok: response.ok, ms: Math.round(performance.now() - started), json, text, headers: picked };
}
