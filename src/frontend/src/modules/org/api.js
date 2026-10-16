import { useEffect, useState, useSyncExternalStore } from 'react';
import api from '../../services/api';

const base = '/app/org';

/** The org structure API (docs/org-structure.md → HTTP API). */
export const orgApi = {
  meta: () => api.get(`${base}/meta`),
  units: (params) => api.get(`${base}/units`, { params }),
  chart: (params) => api.get(`${base}/chart`, { params }),
  unit: (id) => api.get(`${base}/units/${id}`),
  history: (id) => api.get(`${base}/units/${id}/history`),
  members: (id, subtree = false) => api.get(`${base}/units/${id}/members`, { params: subtree ? { subtree: 1 } : {} }),
  create: (payload) => api.post(`${base}/units`, payload),
  update: (id, payload) => api.put(`${base}/units/${id}`, payload),
  move: (id, payload) => api.post(`${base}/units/${id}/move`, payload),
  remove: (id) => api.delete(`${base}/units/${id}`),
  people: (q) => api.get(`${base}/people`, { params: q ? { q } : {} }),
  saveSettings: (payload) => api.put(`${base}/settings`, payload),
  placement: (userId) => api.get(`${base}/users/${userId}`),
  setPlacement: (userId, payload) => api.put(`${base}/users/${userId}`, payload),
  manager: (userId, level = 1) => api.get(`${base}/manager/${userId}`, { params: { level } }),
};

// ── A shared cache of units and meta for pickers (one request per page) ─────

let cache = { units: null, meta: null, at: 0, promise: null };
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export function loadOrg(force = false) {
  if (!force && cache.promise && Date.now() - cache.at < 60000) return cache.promise;
  cache.at = Date.now();
  cache.promise = Promise.all([orgApi.units(), orgApi.meta()])
    .then(([units, meta]) => {
      cache = { ...cache, units: units.data.units, meta: meta.data };
      emit();
      return cache;
    })
    .catch((err) => {
      cache.promise = null;
      throw err;
    });
  return cache.promise;
}

/** Call after a change so every picker re-reads. */
export function orgChanged() {
  loadOrg(true).catch(() => {});
  try {
    window.dispatchEvent(new Event('org:changed'));
  } catch {
    /* no window */
  }
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** { units, meta, loading } — units of the org structure for pickers and labels. */
export function useOrg() {
  const snapshot = useSyncExternalStore(subscribe, () => cache.units);
  const [error, setError] = useState(null);
  useEffect(() => {
    loadOrg().catch(setError);
  }, []);
  return { units: snapshot, meta: cache.meta, loading: !snapshot && !error, error };
}
