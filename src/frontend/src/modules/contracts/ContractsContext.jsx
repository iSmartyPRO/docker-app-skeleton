import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { contractsApi } from './api';

const ContractsContext = createContext(null);

/**
 * Module-wide state: settings and my rights (meta), the staff for pickers,
 * the chip counters for the sidebar and `version`, bumped after any change
 * so lists reload.
 */
export function ContractsProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    const res = await contractsApi.meta();
    setMeta(res.data);
    return res.data;
  }, []);

  const refreshCounts = useCallback(() => {
    contractsApi
      .counters()
      .then((res) => setCounts(res.data.counts))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(setError);
    contractsApi
      .users()
      .then((res) => setUsers(res.data.users || []))
      .catch(() => {});
    refreshCounts();
  }, [refresh, refreshCounts]);

  // A decision taken in the card or the inbox changes statuses here too.
  useEffect(() => {
    const onChange = () => {
      setVersion((n) => n + 1);
      refreshCounts();
    };
    window.addEventListener('approvals:changed', onChange);
    return () => window.removeEventListener('approvals:changed', onChange);
  }, [refreshCounts]);

  const touch = useCallback(() => {
    setVersion((n) => n + 1);
    refreshCounts();
  }, [refreshCounts]);

  const value = useMemo(
    () => ({
      meta,
      settings: meta?.settings || {},
      me: meta?.me || {},
      modules: meta?.modules || {},
      legalEntities: meta?.legalEntities || [],
      users,
      counts,
      error,
      version,
      refresh,
      refreshCounts,
      touch,
      userById: (id) => users.find((user) => user.id === Number(id)) || null,
    }),
    [meta, users, counts, error, version, refresh, refreshCounts, touch]
  );
  return <ContractsContext.Provider value={value}>{children}</ContractsContext.Provider>;
}

export function useContracts() {
  return useContext(ContractsContext);
}
