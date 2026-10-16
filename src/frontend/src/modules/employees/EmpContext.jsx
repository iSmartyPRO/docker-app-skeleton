import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { empApi } from './api';

const EmpContext = createContext(null);

/** Module state shared by the pages: rights, settings, positions, counters; `touch()` re-reads. */
export function EmpProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [positions, setPositions] = useState([]);
  const [counters, setCounters] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([empApi.meta(), empApi.positions()]);
      setMeta(m.data);
      setPositions(p.data.positions);
      empApi
        .counters()
        .then((res) => setCounters(res.data.counters))
        .catch(() => {});
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);
  const value = useMemo(() => ({ meta, positions, counters, error, version, touch: () => setVersion((v) => v + 1) }), [meta, positions, counters, error, version]);
  return <EmpContext.Provider value={value}>{children}</EmpContext.Provider>;
}

export const useEmp = () => useContext(EmpContext);
