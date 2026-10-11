import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tasksApi } from './api';

const TasksContext = createContext(null);

/** Module config, the user's projects (with counters) and personal totals. */
export function TasksProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [projects, setProjects] = useState([]);
  const [mine, setMine] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const res = await tasksApi.home();
    setConfig(res.data.config);
    setProjects(res.data.projects);
    setMine(res.data.mine);
  }, []);

  useEffect(() => {
    refresh().catch(setError);
  }, [refresh]);

  const value = useMemo(() => ({ config, projects, mine, refresh, error }), [config, projects, mine, refresh, error]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  return useContext(TasksContext);
}

const RANK = { none: 0, view: 1, edit: 2, manage: 3 };
export function atLeast(level, needed) {
  return (RANK[level] || 0) >= RANK[needed];
}
