import { useCallback, useEffect, useState } from 'react';
import { getAdminSettings, saveAdminSettings } from '../services/api';
import { useSettings } from '../context/SettingsContext';

/**
 * Admin view of settings (secrets masked) plus a `save(patch)` that persists,
 * updates local state and refreshes the public settings the whole UI reads.
 */
export function useAdminSettings() {
  const { refresh: refreshPublic } = useSettings();
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getAdminSettings();
      const next = res.data?.settings || null;
      setSettings(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch) => {
      const res = await saveAdminSettings(patch);
      const next = res.data?.settings || null;
      if (next) setSettings(next);
      await refreshPublic();
      return next;
    },
    [refreshPublic]
  );

  return { settings, ready, error, refresh, save, setSettings };
}
