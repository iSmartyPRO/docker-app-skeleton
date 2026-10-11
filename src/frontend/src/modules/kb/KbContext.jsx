import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { kbApi } from './api';

const KbContext = createContext(null);

/** Module config (default icon/colour, limits, conversion) and the folder tree. */
export function KbProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [tree, setTree] = useState([]);
  const [rootLevel, setRootLevel] = useState('none');
  const [error, setError] = useState(null);

  const refreshTree = useCallback(async () => {
    const res = await kbApi.tree();
    setTree(res.data.folders);
    setRootLevel(res.data.rootLevel);
  }, []);

  useEffect(() => {
    kbApi
      .home()
      .then((res) => {
        setConfig(res.data.config);
        setRootLevel(res.data.rootLevel);
      })
      .then(refreshTree)
      .catch(setError);
  }, [refreshTree]);

  const value = useMemo(() => ({ config, tree, rootLevel, refreshTree, error }), [config, tree, rootLevel, refreshTree, error]);
  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}

export function useKb() {
  return useContext(KbContext);
}

const RANK = { none: 0, view: 1, edit: 2, manage: 3 };
export function atLeast(level, needed) {
  return (RANK[level] || 0) >= RANK[needed];
}
