import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { procApi } from './api';

const ProcContext = createContext(null);

/** Module meta (settings, rights, legal entities, linked modules) and a change counter for lists. */
export function ProcProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [people, setPeople] = useState(null);
  const load = useCallback(() => {
    procApi
      .meta()
      .then((res) => {
        setMeta(res.data);
        setError(null);
      })
      .catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const loadPeople = useCallback(() => {
    if (people) return Promise.resolve(people);
    return procApi.people().then((res) => {
      setPeople(res.data.people);
      return res.data.people;
    });
  }, [people]);
  const value = useMemo(() => ({ meta, error, reload: load, version, touch: () => setVersion((n) => n + 1), people, loadPeople }), [meta, error, load, version, people, loadPeople]);
  return <ProcContext.Provider value={value}>{children}</ProcContext.Provider>;
}

export function useProc() {
  return useContext(ProcContext);
}
