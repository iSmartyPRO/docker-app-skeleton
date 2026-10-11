import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { filesApi } from './api';

const FilesContext = createContext(null);

/** Spaces, storage usage and module config for the Files app. */
export function FilesProvider({ children }) {
  const [spaces, setSpaces] = useState([]);
  const [usage, setUsage] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const res = await filesApi.home();
    setSpaces(res.data.spaces);
    setUsage(res.data.usage);
    setConfig(res.data.config);
  }, []);

  useEffect(() => {
    refresh().catch(setError);
  }, [refresh]);

  const value = useMemo(() => ({ spaces, usage, config, refresh, error }), [spaces, usage, config, refresh, error]);
  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>;
}

export function useFiles() {
  return useContext(FilesContext);
}
