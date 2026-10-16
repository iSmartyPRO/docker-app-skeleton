import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useHelp } from '../help/HelpContext';
import { anchorSelector, autoStartCandidate, getTour, isSeen, listTours, needsAnchor, nextIndex, onRoute, planSteps, progressOf, registerTour, subscribeTours, tourForModule } from './engine';
import { MODULE_UI, setTourRunner } from '../modules/manifest';
import TourOverlay from './TourOverlay';
import './content';
import './tour.css';

/*
 * Runs guided tours (see engine.js for the definition format and
 * docs/extending.md → «Guided tours»). One tour at a time; progress is
 * remembered on the server (/api/account/tours).
 *
 *   const { startTour, hasTour } = useTour();
 *   startTour('tasks');                      // from a button
 *   import { startTour } from './tour';      // outside React (module manifests, the command palette)
 */

const TourContext = createContext({
  startTour: () => {},
  stopTour: () => {},
  hasTour: () => false,
  running: null,
  state: null,
  setDisabled: async () => {},
});

// Imperative bridge for code outside the provider's subtree.
let controller = null;
/** Starts a tour by id (or a module's tour by module id). Returns false when there is none. */
export function startTour(id) {
  return controller ? controller(id) : false;
}

const FIRST_WAIT = 6000; // a lazy page may still be loading
const STEP_WAIT = 2200;
const AUTO_DELAY = 1100;

/** Resolves when `[data-tour=target]` is rendered and visible, or with null after `timeout`. */
function waitForAnchor(target, timeout, signal) {
  const find = () => {
    const nodes = document.querySelectorAll(anchorSelector(target));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden') return node;
    }
    return null;
  };
  return new Promise((resolve) => {
    const found = find();
    if (found) return resolve(found);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);
      resolve(value);
    };
    const check = () => {
      if (signal.aborted) return finish(null);
      const node = find();
      if (node) finish(node);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    // Layout-only changes (a CSS transition) do not mutate the DOM.
    const poll = setInterval(check, 250);
    const timer = setTimeout(() => finish(null), timeout);
  });
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function inView(rect) {
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--da-header-h')) || 60;
  return rect.top >= header * 0.5 && rect.bottom <= window.innerHeight - 8 && rect.left >= 0 && rect.right <= window.innerWidth;
}

/** Scrolls the anchor into view (smoothly unless reduced motion) and resolves once it settles. */
function bringIntoView(node) {
  const rect = node.getBoundingClientRect();
  if (inView(rect)) return Promise.resolve();
  const smooth = !reducedMotion();
  node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  return new Promise((resolve) => setTimeout(resolve, smooth ? 420 : 30));
}

export function TourProvider({ children }) {
  const { user, can, canAny } = useAuth();
  const { settings } = useSettings();
  const { closeHelp } = useHelp();
  const location = useLocation();
  const navigate = useNavigate();
  // Re-render when tours are (re)registered (module manifests may add them late).
  const version = useSyncExternalStore(subscribeTours, () => listTours().length);
  const [state, setState] = useState(null); // { seen, disabled }
  const [run, setRun] = useState(null); // { tour, steps, index, dir, missing:Set, node }
  const runRef = useRef(null);
  runRef.current = run;
  const returnFocus = useRef(null);
  const justRan = useRef(null);
  const abort = useRef(null);

  const impersonating = Boolean(user?.impersonator);

  // Progress of the signed-in person.
  useEffect(() => {
    setState(null);
    if (!user?.id) return undefined;
    if (impersonating) {
      // Acting as someone else: tours only on request, nothing is remembered.
      setState({ seen: {}, disabled: true, local: true });
      return undefined;
    }
    let alive = true;
    api
      .get('/account/tours')
      .then((res) => alive && setState({ seen: res.data.seen || {}, disabled: Boolean(res.data.disabled) }))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [user?.id, impersonating]);

  const remember = useCallback(
    (tour, status) => {
      setState((prev) => (prev ? { ...prev, seen: { ...prev.seen, [tour.id]: { status, version: tour.version, at: new Date().toISOString() } } } : prev));
      if (impersonating) return;
      api.put('/account/tours', { id: tour.id, status, version: tour.version }).catch(() => {});
    },
    [impersonating]
  );

  const finish = useCallback(
    (status) => {
      const current = runRef.current;
      if (!current) return;
      abort.current?.abort();
      remember(current.tour, status);
      justRan.current = window.location.pathname;
      setRun(null);
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && document.contains(back)) setTimeout(() => back.focus?.({ preventScroll: true }), 30);
    },
    [remember]
  );

  const ctx = useMemo(
    () => ({ user, settings, can, canAny, phone: Boolean(window.matchMedia?.('(max-width: 560px)').matches) }),
    [user, settings, can, canAny]
  );

  const start = useCallback(
    (id) => {
      const tour = getTour(id) || tourForModule(id);
      if (!tour || runRef.current) return false;
      const steps = planSteps(tour, ctx);
      if (!steps.length) return false;
      closeHelp?.();
      returnFocus.current = document.activeElement;
      setRun({ tour, steps, index: -1, dir: 1, missing: new Set(), node: null, ready: false, pending: 0 });
      return true;
    },
    [ctx, closeHelp]
  );

  useEffect(() => {
    controller = start;
    return () => {
      if (controller === start) controller = null;
    };
  }, [start]);

  // Module manifests (modules/manifest.js): a module with a registered tour shows its «Tour»
  // buttons on the Modules page; the manifest's `tour` may also be an id, an object or a loader.
  useEffect(() => {
    for (const tour of listTours()) {
      if (MODULE_UI[tour.module] && !MODULE_UI[tour.module].tour) MODULE_UI[tour.module].tour = tour.id;
    }
    setTourRunner(async (tour, { moduleId } = {}) => {
      let value = tour;
      if (typeof value === 'function') value = (await value())?.default ?? null;
      if (value && typeof value === 'object') {
        registerTour({ id: moduleId, module: moduleId, ...value });
        value = value.id || moduleId;
      }
      return start(typeof value === 'string' ? value : moduleId);
    });
    return () => setTourRunner(null);
  }, [start, version]);

  // Move to a step: open its page, wait for its anchor, skip it when it never shows.
  const go = useCallback((dir) => {
    setRun((prev) => {
      if (!prev) return prev;
      let index = nextIndex(prev.steps, prev.index, dir, prev.missing);
      let way = dir;
      // Stepping back onto steps that turned out to be missing: carry on forward instead.
      if (index < 0 && dir < 0) {
        index = nextIndex(prev.steps, prev.index, 1, prev.missing);
        way = 1;
      }
      if (index < 0) {
        setTimeout(() => finish('done'), 0);
        return prev;
      }
      return { ...prev, index, dir: way, node: null, ready: false, pending: prev.pending + 1 };
    });
  }, [finish]);

  // A new run starts at its first step.
  useEffect(() => {
    if (run && run.index === -1) go(1);
  }, [run, go]);

  const stepKey = run ? `${run.tour.id}:${run.index}:${run.pending}` : null;
  useEffect(() => {
    const current = runRef.current;
    if (!current || current.index < 0) return undefined;
    const step = current.steps[current.index];
    const controllerAbort = new AbortController();
    abort.current = controllerAbort;
    const { signal } = controllerAbort;
    (async () => {
      let waited = STEP_WAIT;
      const route = step.route || (current.index === nextIndex(current.steps, -1, 1, current.missing) ? current.tour.route : null);
      if (route && !onRoute(window.location.pathname, route)) {
        navigate(route);
        waited = FIRST_WAIT;
      } else if (current.index === 0) {
        waited = FIRST_WAIT;
      }
      if (!needsAnchor(step)) {
        if (!signal.aborted) setRun((prev) => (prev && prev.index === current.index ? { ...prev, node: null, ready: true } : prev));
        return;
      }
      const node = await waitForAnchor(step.target, waited, signal);
      if (signal.aborted) return;
      if (!node) {
        // Not on this page for this person (permissions, switched-off module, phone layout): skip it.
        setRun((prev) => {
          if (!prev || prev.index !== current.index) return prev;
          const missing = new Set(prev.missing);
          missing.add(prev.index);
          return { ...prev, missing };
        });
        go(current.dir || 1);
        return;
      }
      await bringIntoView(node);
      if (signal.aborted) return;
      setRun((prev) => (prev && prev.index === current.index ? { ...prev, node, ready: true } : prev));
    })();
    return () => controllerAbort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // While a tour runs: hide the robot assistant and mark the page (tour.css).
  useEffect(() => {
    const root = document.documentElement;
    if (run) root.dataset.tour = 'on';
    else delete root.dataset.tour;
    return () => {
      delete root.dataset.tour;
    };
  }, [Boolean(run)]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tour ends when the person signs out.
  useEffect(() => {
    if (!user && runRef.current) setRun(null);
  }, [user]);

  // Auto-start: the portal tour on the first sign-in, a module's tour on the first visit.
  useEffect(() => {
    if (justRan.current && justRan.current !== location.pathname) justRan.current = null;
    const candidate = autoStartCandidate({
      pathname: location.pathname,
      user,
      state,
      running: Boolean(run),
      portalTour: getTour('portal'),
      moduleTourOf: (moduleId) => (settings?.modules?.[moduleId]?.enabled ? tourForModule(moduleId) : null),
      justRan: Boolean(justRan.current),
    });
    if (!candidate) return undefined;
    // The app shell first: the header must be on screen (it is not on public pages).
    const controllerAbort = new AbortController();
    const timer = setTimeout(async () => {
      const shell = await waitForAnchor('header.user', 8000, controllerAbort.signal);
      if (!shell || controllerAbort.signal.aborted) return;
      // An open dialog wins: try again on the next page.
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal')) return;
      start(candidate.id);
    }, AUTO_DELAY);
    return () => {
      clearTimeout(timer);
      controllerAbort.abort();
    };
  }, [location.pathname, user, state, run, settings, start, version]);

  const setDisabled = useCallback(async (disabled) => {
    setState((prev) => (prev ? { ...prev, disabled } : prev));
    const res = await api.put('/account/tours', { disabled });
    setState({ seen: res.data.seen || {}, disabled: Boolean(res.data.disabled) });
  }, []);

  const value = useMemo(
    () => ({
      startTour: start,
      stopTour: () => finish('skipped'),
      hasTour: (moduleId) => Boolean(tourForModule(moduleId)),
      tourFor: (moduleId) => tourForModule(moduleId),
      isSeen: (id) => isSeen(getTour(id), state?.seen),
      running: run ? run.tour.id : null,
      state,
      setDisabled,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, finish, run?.tour?.id, state, setDisabled, version]
  );

  const step = run && run.index >= 0 ? run.steps[run.index] : null;
  const progress = run && run.index >= 0 ? progressOf(run.steps, run.index, run.missing) : null;
  const isLast = run ? nextIndex(run.steps, run.index, 1, run.missing) < 0 : false;
  const isFirst = run ? nextIndex(run.steps, run.index, -1, run.missing) < 0 : true;

  return (
    <TourContext.Provider value={value}>
      {children}
      {run && step && (
        <TourOverlay
          key={run.tour.id}
          tour={run.tour}
          step={step}
          node={run.node}
          ready={run.ready}
          progress={progress}
          isFirst={isFirst}
          isLast={isLast}
          onNext={() => (isLast ? finish('done') : go(1))}
          onBack={() => !isFirst && go(-1)}
          onSkip={() => finish('skipped')}
        />
      )}
    </TourContext.Provider>
  );
}

export const useTour = () => useContext(TourContext);
