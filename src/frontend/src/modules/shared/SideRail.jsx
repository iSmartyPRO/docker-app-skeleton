import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import TourButton from '../../tour/TourButton';
import { useTour } from '../../tour/TourContext';

/**
 * Collapsible desktop sidebar for module shells (`.mod-shell`).
 *
 * Replaces `<aside className="mod-shell__side">…</aside>` with
 * `<SideRail moduleKey="crm">…</SideRail>`. Collapsed, the sidebar becomes a
 * narrow icon rail: link labels are visually hidden (still read by screen
 * readers), counts turn into badges and hovering an item shows its label.
 * The state is remembered per module. Mobile keeps the Drawer: below 900px the
 * aside is hidden by module.css and the Drawer copy of the sidebar has no rail
 * context, so it always renders expanded.
 */

const SideRailContext = createContext({ collapsed: false });

/** `{ collapsed }` of the enclosing SideRail (false outside of it, e.g. in the mobile Drawer). */
export const useSideRail = () => useContext(SideRailContext);

const storageKey = (moduleKey) => `da_side_collapsed:${moduleKey}`;
const DESKTOP = '(min-width: 901px)';

/** Per-module collapsed flag persisted in localStorage (storage failures are ignored). */
export function useSideCollapsed(moduleKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey(moduleKey)) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(moduleKey), collapsed ? '1' : '0');
    } catch {
      /* private mode / blocked storage: keep the in-memory state only */
    }
  }, [moduleKey, collapsed]);
  // Widgets that size themselves on window resize (FullCalendar, charts) re-measure
  // during and after the width transition.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timers = [120, 260, 420].map((ms) => setTimeout(() => window.dispatchEvent(new Event('resize')), ms));
    return () => timers.forEach(clearTimeout);
  }, [collapsed]);
  return [collapsed, setCollapsed];
}

const isEditable = (el) =>
  !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('[contenteditable="true"], [role="textbox"], [role="combobox"]'));

const dialogOpen = () => [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0);

/** Label for a hovered rail item: explicit data-tip, aria-label, or the visible text of the link. */
function tipFor(el) {
  if (el.dataset.tip) return { label: el.dataset.tip };
  const text = el.querySelector('.mod-nav__text, .mod-side__brand > span:not(.da-icon)');
  const label = (text?.textContent || el.getAttribute('aria-label') || el.textContent || '').trim();
  const count = el.querySelector('.mod-nav__count')?.textContent?.trim();
  return label ? { label, count } : null;
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SideRail({ moduleKey, className = '', children }) {
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useSideCollapsed(moduleKey);
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const toggle = useCallback(() => {
    setTip(null);
    setCollapsed((value) => !value);
  }, [setCollapsed]);

  // The grid lives on the parent `.mod-shell`: mirror the state there. Width
  // transitions are enabled only after the first frame so a remembered
  // collapsed state does not animate on page load.
  useLayoutEffect(() => {
    const shell = ref.current?.parentElement;
    if (!shell) return undefined;
    shell.classList.toggle('is-side-collapsed', collapsed);
    return () => shell.classList.remove('is-side-collapsed');
  }, [collapsed]);
  useEffect(() => {
    const shell = ref.current?.parentElement;
    if (!shell) return undefined;
    const frame = requestAnimationFrame(() => shell.classList.add('is-rail-ready'));
    return () => {
      cancelAnimationFrame(frame);
      shell.classList.remove('is-rail-ready');
    };
  }, []);

  // "[" toggles the rail (desktop only, never while typing or inside a dialog).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '[' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isEditable(event.target) || event.target?.closest?.('[role="dialog"]') || dialogOpen()) return;
      if (!window.matchMedia(DESKTOP).matches) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Hide the hover label when anything scrolls (its position is fixed).
  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  const showTip = (event) => {
    if (!collapsed) return;
    const el = event.target.closest?.('a, button, [data-tip]');
    if (!el || !ref.current?.contains(el) || el.closest('.mod-rail-anchor')) {
      setTip(null);
      return;
    }
    const data = tipFor(el);
    if (!data) return;
    const rect = el.getBoundingClientRect();
    setTip({ ...data, top: rect.top + rect.height / 2, left: rect.right + 12 });
  };
  const hideTip = () => setTip(null);

  const label = collapsed ? t('common.sideExpand') : t('common.sideCollapse');
  // Modules with a guided tour get a «Тур» button next to their name (tour/tour.css).
  const { hasTour } = useTour();
  const withTour = hasTour(moduleKey);
  return (
    <aside
      ref={ref}
      className={`mod-shell__side${collapsed ? ' is-collapsed' : ''}${withTour ? ' has-tour' : ''}${className ? ` ${className}` : ''}`}
      onPointerOver={showTip}
      onPointerLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
      onClick={() => setTip(null)}
    >
      <div className="mod-rail-anchor">
        <Tooltip
          title={
            <span className="mod-rail-hint">
              {label} <kbd>[</kbd>
            </span>
          }
          placement="right"
          mouseEnterDelay={0.35}
        >
          <button type="button" className="mod-rail-toggle" aria-label={label} aria-expanded={!collapsed} onClick={toggle}>
            <Chevron />
          </button>
        </Tooltip>
      </div>
      {withTour && (
        <div className="mod-tour-slot">
          <TourButton module={moduleKey} iconOnly />
        </div>
      )}
      <SideRailContext.Provider value={{ collapsed }}>{children}</SideRailContext.Provider>
      {tip &&
        createPortal(
          <div className="mod-rail-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
            <span>{tip.label}</span>
            {tip.count && <span className="mod-rail-tip__count">{tip.count}</span>}
          </div>,
          document.body,
        )}
    </aside>
  );
}
