import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { getRegional } from '../../lib/datetime';

const base = '/app/dashboard';

/** The person's time zone: widgets count "today" and day series in it (backend `tz`). */
export const currentTZ = () => getRegional().timeZone;

export const dashboardApi = {
  load: () => api.get(base),
  save: (widgets) => api.put(`${base}/layout`, { widgets }),
  reset: () => api.delete(`${base}/layout`),
  saveDefault: (widgets) => api.put(`${base}/default`, { widgets }),
  resetDefault: () => api.delete(`${base}/default`),
  options: () => api.get(`${base}/options`),
  data: (type, settings, extra = {}) => api.get(`${base}/data/${type}`, { params: { settings: JSON.stringify(settings || {}), tz: currentTZ(), ...extra } }),
};

/**
 * Data of one widget: loads with its settings, refreshes every few minutes and
 * when the tab comes back, keeps the last good data while reloading.
 */
export function useWidgetData(type, settings, { extra, every = 5 * 60 * 1000, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const key = JSON.stringify([type, settings || {}, extra || {}]);
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    setState((prev) => ({ ...prev, loading: true }));
    dashboardApi
      .data(type, settings, extra)
      .then((res) => mine === seq.current && setState({ data: res.data, error: null, loading: false }))
      .catch((error) => mine === seq.current && setState((prev) => ({ data: prev.data, error, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    load();
    if (!every) return undefined;
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), every);
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load, every]);

  return { ...state, reload: load };
}

export const uid = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
