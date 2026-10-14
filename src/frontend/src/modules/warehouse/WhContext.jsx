import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { whApi } from './api';

const WhContext = createContext(null);

/** Module meta (settings, warehouses, categories, rights, linked modules) and a change counter for lists. */
export function WhProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [people, setPeople] = useState(null);
  const load = useCallback(() => {
    whApi
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
    return whApi.people().then((res) => {
      setPeople(res.data.people);
      return res.data.people;
    });
  }, [people]);
  const value = useMemo(() => {
    const warehouses = meta?.warehouses || [];
    /** Rights of the person on one warehouse (as the server computed them). */
    const rightsOn = (id) => new Set(warehouses.find((w) => w.id === Number(id))?.rights || meta?.rights?.global || []);
    return { meta, error, reload: load, version, touch: () => setVersion((n) => n + 1), people, loadPeople, warehouses, rightsOn, can: (right, id) => rightsOn(id).has(right) };
  }, [meta, error, load, version, people, loadPeople]);
  return <WhContext.Provider value={value}>{children}</WhContext.Provider>;
}

export function useWh() {
  return useContext(WhContext);
}
