import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { cmpApi } from './api';

const Ctx = createContext(null);

/** Country profiles, module settings and the staff list, loaded once for the app. */
export function CompaniesProvider({ children }) {
  const [state, setState] = useState({ meta: null, staff: [], error: null });
  const refresh = useCallback(async () => {
    try {
      const [meta, staff] = await Promise.all([cmpApi.meta(), cmpApi.staff()]);
      setState({ meta: meta.data, staff: staff.data.users, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useCompanies = () => useContext(Ctx);
