import { useCallback, useEffect, useState } from 'react';
import { getAdminSettings } from '../services/api';

export function useAdminSettings() {
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getAdminSettings();
    const next = res.data?.settings || null;
    setSettings(next);
    setReady(true);
    return next;
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setSettings(null);
      setReady(true);
    });
  }, [refresh]);

  return { settings, ready, refresh, setSettings };
}
