import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { helpForPath } from './registry';

const HelpDrawer = lazy(() => import('./HelpDrawer'));
const HelpContext = createContext({ openHelp: () => {}, closeHelp: () => {} });

/**
 * Contextual help: openHelp() shows the short guide of a module in a side
 * panel (the page stays where it is); "?" on the keyboard does the same for
 * the current page.
 */
export function HelpProvider({ children }) {
  const location = useLocation();
  const [state, setState] = useState(null); // { id, section }

  const openHelp = useCallback((id, section) => setState({ id: id || helpForPath(window.location.pathname), section: section || null }), []);
  const closeHelp = useCallback(() => setState(null), []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      setState((prev) => (prev ? null : { id: helpForPath(window.location.pathname), section: null }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Navigating away closes the panel.
  useEffect(() => {
    setState(null);
  }, [location.pathname]);

  const value = useMemo(() => ({ openHelp, closeHelp }), [openHelp, closeHelp]);
  return (
    <HelpContext.Provider value={value}>
      {children}
      {state && (
        <Suspense fallback={null}>
          <HelpDrawer id={state.id} section={state.section} onClose={closeHelp} onOpen={openHelp} />
        </Suspense>
      )}
    </HelpContext.Provider>
  );
}

export const useHelp = () => useContext(HelpContext);
