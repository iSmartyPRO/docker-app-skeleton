/*
 * Guided tours — the pure part of the engine: the registry, step planning
 * (permissions), skipping steps whose anchor is not on the page, progress,
 * popover placement and the auto-start rules. No React and no DOM access
 * here, so the backend unit tests import it (src/backend/test/tours.test.js).
 *
 * A tour:
 *   registerTour({
 *     id: 'tasks',              // unique; progress is remembered per id on the server
 *     module: 'tasks',          // module id (auto-starts on the first visit); 'portal' for the portal tour
 *     version: 1,               // bump to show a changed tour once more to everyone
 *     route: '/app/tasks',      // optional: opened first when the tour is started from elsewhere
 *     title: 'tour.tasks.title',
 *     steps: [
 *       { id: 'intro', title: 'tour.tasks.intro.title', text: 'tour.tasks.intro.text' },  // no target: centred
 *       { id: 'create', target: 'tasks.create', title: …, text: …,
 *         placement: 'right',                 // preferred side: top | bottom | left | right | auto
 *         route: '/app/tasks/projects',       // optional: open this page for the step
 *         when: ({ can, settings, user }) => can('tasks.create') },  // optional: shown only when true
 *     ],
 *   })
 *
 * `target` names an element marked with data-tour="…". A step whose target
 * is not rendered (no permission, module switched off, phone layout) is
 * skipped — that is how a tour stays «в рамках доступа» without listing
 * permissions twice; `when` is for steps whose anchor exists for everyone.
 */

const tours = new Map();
const listeners = new Set();

const TOUR_ID = /^[a-z][a-z0-9_.-]{0,63}$/;

/** Adds (or replaces) a tour. Returns a function that removes it again. */
export function registerTour(definition) {
  const tour = normalizeTour(definition);
  tours.set(tour.id, tour);
  listeners.forEach((listener) => listener());
  return () => {
    if (tours.get(tour.id) === tour) {
      tours.delete(tour.id);
      listeners.forEach((listener) => listener());
    }
  };
}

/** Validates a definition; throws on mistakes a developer should see at once. */
export function normalizeTour(definition) {
  const def = definition || {};
  if (!TOUR_ID.test(String(def.id || ''))) throw new Error(`Tour id "${def.id}" must match ${TOUR_ID}`);
  if (!Array.isArray(def.steps) || !def.steps.length) throw new Error(`Tour "${def.id}" has no steps`);
  const ids = new Set();
  const steps = def.steps.map((step, index) => {
    const id = step.id || `step${index + 1}`;
    if (ids.has(id)) throw new Error(`Tour "${def.id}": duplicate step id "${id}"`);
    ids.add(id);
    if (!step.title && !step.text) throw new Error(`Tour "${def.id}" step "${id}" has neither title nor text`);
    return { placement: 'auto', ...step, id };
  });
  return {
    module: def.module || def.id,
    version: Math.max(1, Math.round(Number(def.version) || 1)),
    route: def.route || null,
    title: def.title || null,
    ...def,
    steps,
  };
}

export const getTour = (id) => tours.get(id) || null;
export const listTours = () => [...tours.values()];
/** The tour of a module (its own id or the first one that names the module). */
export const tourForModule = (moduleId) => tours.get(moduleId) || listTours().find((tour) => tour.module === moduleId) || null;
export const hasTour = (moduleId) => Boolean(tourForModule(moduleId));

/** Re-render hook support: called whenever the registry changes. */
export function subscribeTours(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Steps of the tour the person may see (`when` evaluated against `ctx`); a failing predicate hides its step. */
export function planSteps(tour, ctx = {}) {
  return (tour?.steps || []).filter((step) => {
    if (typeof step.when !== 'function') return true;
    try {
      return Boolean(step.when(ctx));
    } catch {
      return false;
    }
  });
}

/**
 * Index of the next step to show from `from` in `direction` (+1 / -1),
 * skipping the indices in `missing` (anchors that never appeared). -1 when
 * there is none left that way.
 */
export function nextIndex(steps, from, direction, missing = new Set()) {
  for (let index = from + direction; index >= 0 && index < steps.length; index += direction) {
    if (!missing.has(index)) return index;
  }
  return -1;
}

/** { current, total } for «2 из 7»: counted over the steps that are (or may still be) shown. */
export function progressOf(steps, index, missing = new Set()) {
  let current = 0;
  let total = 0;
  steps.forEach((_, i) => {
    if (missing.has(i)) return;
    total += 1;
    if (i <= index) current += 1;
  });
  return { current: Math.max(1, current), total: Math.max(1, total) };
}

/** Whether a step's anchor must be found on the page (a step without target is centred). */
export const needsAnchor = (step) => Boolean(step?.target);

/** CSS selector of a step's anchor. */
export const anchorSelector = (target) => `[data-tour="${String(target).replace(/["\\]/g, '')}"]`;

/** Route match for `route` steps: the step's page is open when the path starts with it. */
export function onRoute(pathname, route) {
  if (!route) return true;
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  const want = String(route).replace(/\/+$/, '') || '/';
  return path === want || path.startsWith(`${want}/`);
}

/**
 * Popover position next to `target` (a DOMRect-like box) inside `viewport`
 * ({ width, height }). Tries the preferred side, then the others, and clamps
 * into the screen with `margin`. A missing target centres the popover.
 * Returns { top, left, placement, arrow } — `arrow` is the offset of the
 * pointer along the edge that faces the target.
 */
export function placePopover({ target, popover, viewport, placement = 'auto', gap = 14, margin = 12 }) {
  const { width: vw, height: vh } = viewport;
  const { width: pw, height: ph } = popover;
  if (!target) {
    return { top: Math.max(margin, (vh - ph) / 2), left: Math.max(margin, (vw - pw) / 2), placement: 'center', arrow: null };
  }
  const space = {
    bottom: vh - (target.top + target.height) - gap,
    top: target.top - gap,
    right: vw - (target.left + target.width) - gap,
    left: target.left - gap,
  };
  const fits = {
    bottom: space.bottom >= ph + margin,
    top: space.top >= ph + margin,
    right: space.right >= pw + margin,
    left: space.left >= pw + margin,
  };
  const order = placement && placement !== 'auto' ? [placement, opposite(placement), 'bottom', 'top', 'right', 'left'] : ['bottom', 'top', 'right', 'left'];
  let side = order.find((name) => fits[name]);
  if (!side) side = Object.entries(space).sort((a, b) => b[1] - a[1])[0][0];
  const clampX = (x) => Math.min(Math.max(margin, x), Math.max(margin, vw - pw - margin));
  const clampY = (y) => Math.min(Math.max(margin, y), Math.max(margin, vh - ph - margin));
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  let top;
  let left;
  if (side === 'bottom' || side === 'top') {
    left = clampX(cx - pw / 2);
    top = side === 'bottom' ? target.top + target.height + gap : target.top - gap - ph;
    top = clampY(top);
    return { top, left, placement: side, arrow: Math.min(Math.max(18, cx - left), pw - 18) };
  }
  top = clampY(cy - ph / 2);
  left = side === 'right' ? target.left + target.width + gap : target.left - gap - pw;
  left = clampX(left);
  return { top, left, placement: side, arrow: Math.min(Math.max(18, cy - top), ph - 18) };
}

function opposite(side) {
  return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side] || 'bottom';
}

/** Seen = a mark exists whose version is at least the tour's. */
export function isSeen(tour, seen = {}) {
  const mark = seen?.[tour?.id];
  return Boolean(mark) && Number(mark.version || 1) >= Number(tour?.version || 1);
}

// Pages without the portal header, or not the person's own portal.
const NO_TOUR_PATHS = [/^\/login\b/, /^\/setup\b/, /^\/auth\//, /^\/s\//, /^\/l\//, /^\/d\//, /^\/install\b/, /^\/developers\b/];

/**
 * Which tour (if any) starts by itself now. Rules: signed in, not acting as
 * someone else, tours not switched off, nothing running, a page of the
 * portal itself; the portal tour first, a module's tour on the first visit
 * to it — never both on one page view.
 */
export function autoStartCandidate({ pathname, user, state, running, portalTour, moduleTourOf, justRan = false }) {
  if (!user || user.impersonator || running || !state || state.disabled) return null;
  if (NO_TOUR_PATHS.some((re) => re.test(pathname || ''))) return null;
  if (portalTour && !isSeen(portalTour, state.seen)) return portalTour;
  if (justRan) return null;
  const match = String(pathname || '').match(/^\/app\/([a-z][a-z0-9-]*)/);
  if (!match) return null;
  const tour = moduleTourOf(match[1]);
  return tour && !isSeen(tour, state.seen) ? tour : null;
}
