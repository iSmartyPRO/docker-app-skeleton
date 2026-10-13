import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { mpApi } from './api';
import { indexTree } from './lib';

const MpContext = createContext(null);

/** Module-wide state: settings, directories, projects, my roles, staff for pickers. */
export function MpProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const res = await mpApi.meta();
    setMeta(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    refresh().catch(setError);
    mpApi
      .users()
      .then((res) => setUsers(res.data.users || []))
      .catch(() => {});
  }, [refresh]);

  const value = useMemo(() => {
    const settings = meta?.settings || {};
    const types = meta?.types || [];
    return {
      meta,
      error,
      settings,
      types,
      stages: meta?.stages || {},
      projects: meta?.projects || [],
      me: meta?.me || {},
      isAdmin: Boolean(meta?.me?.isAdmin),
      crmEnabled: Boolean(meta?.crmEnabled),
      users,
      refresh,
      typeById: (id) => types.find((type) => type.id === Number(id)) || null,
      userById: (id) => users.find((user) => user.id === Number(id)) || null,
      projectById: (id) => (meta?.projects || []).find((project) => project.id === Number(id)) || null,
    };
  }, [meta, error, users, refresh]);

  return <MpContext.Provider value={value}>{children}</MpContext.Provider>;
}

export const useMp = () => useContext(MpContext);

const ProjectContext = createContext(null);

/**
 * One project's data (GET /projects/:id/map) kept live: the server's stream
 * says which units changed and the page fetches them (field hiding stays on
 * the server); structure changes reload the whole map. Without the stream it
 * polls every minute.
 */
export function ProjectProvider({ projectId, presentation = false, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await mpApi.map(projectId, presentation);
      setData(res.data);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err);
      return null;
    }
  }, [projectId, presentation]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 400);
  }, [load]);

  /** Fresh sales data of some units, merged into the map (readiness stays inherited). */
  const refreshUnits = useCallback(
    async (ids) => {
      if (!ids?.length) return;
      try {
        // Same field hiding as the map: presentation mode never gets the hidden fields back.
        const res = await mpApi.units({ project: projectId, ids: ids.join(','), pageSize: 500, presentation: presentation ? 1 : undefined });
        const fresh = new Map(res.data.items.map((node) => [node.id, node]));
        setData((prev) => (prev ? { ...prev, nodes: prev.nodes.map((node) => (fresh.has(node.id) ? { ...node, unit: fresh.get(node.id).unit, updatedAt: fresh.get(node.id).updatedAt } : node)) } : prev));
      } catch {
        reloadSoon();
      }
    },
    [projectId, presentation, reloadSoon]
  );

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return undefined;
    let source = null;
    let failures = 0;
    let poll = null;
    let closed = false;
    const open = () => {
      source = new EventSource(mpApi.streamUrl(projectId), { withCredentials: true });
      source.addEventListener('hello', () => {
        failures = 0;
        setLive(true);
      });
      source.addEventListener('units', (event) => {
        try {
          refreshUnits(JSON.parse(event.data).ids || []);
        } catch {
          /* ignore malformed */
        }
      });
      source.addEventListener('tree', () => reloadSoon());
      source.onerror = () => {
        setLive(false);
        failures += 1;
        if (failures >= 3 && !poll && !closed) {
          source.close();
          // Polling fallback when the stream cannot be kept open (proxies, old browsers).
          poll = setInterval(load, 60000);
        }
      };
    };
    open();
    return () => {
      closed = true;
      source?.close();
      clearInterval(poll);
      clearTimeout(reloadTimer.current);
    };
  }, [projectId, refreshUnits, reloadSoon, load]);

  const value = useMemo(() => {
    const nodes = data?.nodes || [];
    const tree = indexTree(nodes);
    return {
      projectId: Number(projectId),
      data,
      error,
      live,
      presentation,
      project: data?.project || null,
      nodes,
      tree,
      units: nodes.filter((node) => node.unit),
      caps: data?.caps || [],
      plans: data?.plans || [],
      contours: data?.contours || [],
      markers: data?.markers || [],
      reload: load,
      refreshUnits,
      /** A node changed locally (after an action): merge it right away. */
      patchNode: (node) => setData((prev) => (prev ? { ...prev, nodes: prev.nodes.map((item) => (item.id === node.id ? { ...item, ...node, readiness: item.readiness } : item)) } : prev)),
    };
  }, [data, error, live, presentation, projectId, load, refreshUnits]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => useContext(ProjectContext);
