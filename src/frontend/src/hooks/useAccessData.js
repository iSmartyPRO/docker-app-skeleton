import { useCallback, useEffect, useState } from 'react';
import { listGroups, listRoles } from '../services/api';

/** Roles and groups for pickers and access pages. */
export function useAccessData() {
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([listRoles(), listGroups()]);
      setRoles(r.data.roles || []);
      setGroups(g.data.groups || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { roles, groups, ready, error, refresh };
}
