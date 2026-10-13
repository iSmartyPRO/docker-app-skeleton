import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { crmApi, listOf } from './api';
import { getRegional } from '../../lib/datetime';
import { crmZone } from './lib';

const CrmContext = createContext(null);

/**
 * Module-wide state: settings, pipelines (with counts), my rights, the staff
 * for pickers and my own activity counters for the sidebar.
 */
export function CrmProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [users, setUsers] = useState([]);
  const [mine, setMine] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    const res = await crmApi.meta();
    setMeta(res.data);
    return res.data;
  }, []);

  const refreshMine = useCallback(() => {
    crmApi
      .counters({ owners: 'me', group: 'open', tz: crmZone(), weekStart: getRegional().weekStart })
      .then((res) => setMine(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(setError);
    crmApi
      .users()
      .then((res) => setUsers(listOf(res.data, 'users')))
      .catch(() => {});
    refreshMine();
  }, [refresh, refreshMine]);

  /** Something about deals changed (panel edit, dialog): views reload, counters refresh. */
  const touch = useCallback(() => {
    setVersion((n) => n + 1);
    refresh().catch(() => {});
    refreshMine();
  }, [refresh, refreshMine]);

  const value = useMemo(() => {
    const settings = meta?.settings || {};
    const pipelines = meta?.pipelines || [];
    return {
      meta,
      settings,
      pipelines,
      canAdmin: Boolean(meta?.me?.canAdmin),
      canAll: Boolean(meta?.me?.canAdmin || meta?.me?.canAll),
      companiesEnabled: Boolean(meta?.companiesEnabled),
      chatEnabled: Boolean(meta?.chatEnabled),
      users,
      mine,
      error,
      version,
      refresh,
      touch,
      pipelineById: (id) => pipelines.find((item) => item.id === Number(id)) || null,
      defaultPipeline: pipelines.find((item) => item.isDefault) || pipelines[0] || null,
      stageById: (id) => {
        for (const pipeline of pipelines) {
          const stage = pipeline.stages.find((item) => item.id === Number(id));
          if (stage) return stage;
        }
        return null;
      },
      userById: (id) => users.find((user) => user.id === Number(id)) || null,
    };
  }, [meta, users, mine, error, version, refresh, touch]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  return useContext(CrmContext);
}
