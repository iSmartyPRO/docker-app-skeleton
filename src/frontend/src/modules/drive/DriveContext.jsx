import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { driveApi } from './api';

const DriveContext = createContext(null);

/** Drive home (folders with their state, connections, config), shared by the app's pages. */
export function DriveProvider({ children }) {
  const [state, setState] = useState({ drive: null, shares: null, connections: [], config: null, error: null });
  const refresh = useCallback(async () => {
    try {
      const { data } = await driveApi.home();
      setState({ drive: data.drive, shares: data.shares, connections: data.connections, config: data.config, error: null });
      return data;
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
      return null;
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <DriveContext.Provider value={{ ...state, refresh }}>{children}</DriveContext.Provider>;
}

export const useDrive = () => useContext(DriveContext);
