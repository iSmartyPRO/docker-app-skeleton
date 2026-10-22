import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { remoteApi } from './api';

const RemoteContext = createContext(null);

export function RemoteProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await remoteApi.bootstrap();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({
    ready: Boolean(data),
    error,
    refresh,
    hosts: data?.hosts || [],
    apps: data?.apps || [],
    folders: data?.folders || [],
    gateways: data?.gateways || [],
    settings: data?.settings || { guacdConfigured: false, requireConsentForControl: true, recording: false, monitoringReady: false, passbolt: false },
    can: data?.can || { connect: false, monitor: false, admin: false },
  }), [data, error, refresh]);

  return <RemoteContext.Provider value={value}>{children}</RemoteContext.Provider>;
}

export const useRemote = () => useContext(RemoteContext);
