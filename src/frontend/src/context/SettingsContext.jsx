import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSettings } from '../services/api';
import { outageOf, reportFailure } from '../lib/outage';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await getSettings();
      setSettings(res.data?.settings || null);
    } catch (error) {
      // Without settings the app would pretend to be a bare skeleton (default
      // name, no logo, password only). An outage shows "technical works" instead.
      if (outageOf(error)) reportFailure(error, { immediate: true });
      else setSettings(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // The server is back: load the real settings again.
    window.addEventListener('outage:recovered', refresh);
    return () => window.removeEventListener('outage:recovered', refresh);
  }, [refresh]);

  const value = useMemo(
    () => ({ settings, ready, refresh, setSettings }),
    [settings, ready, refresh]
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
