import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { anchorSelector, placePopover } from './engine';

/*
 * The tour on screen: a dimmed page with a spotlight cut out around the
 * step's anchor and a popover next to it (a bottom sheet on phones).
 * Keyboard: → / Enter next, ← back, Esc skip; Tab stays inside the popover.
 * The popover is a modal dialog for screen readers and every step is
 * announced. The page under the dim does not take clicks.
 */

const PAD = 8;
const PHONE = '(max-width: 560px)';

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return size;
}

const visibleBox = (node) => {
  if (!node?.isConnected) return null;
  const box = node.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? box : null;
};

/**
 * The anchor's box, followed while the page scrolls or re-lays out (one read
 * per frame at most). When the anchor leaves the page (re-rendered, a tab
 * switched, a drawer closed) the same `data-tour` element is looked up again;
 * while there is none the spotlight is hidden instead of pointing at the old place.
 */
function useAnchorRect(initial, target) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!initial) {
      setRect(null);
      return undefined;
    }
    let node = initial;
    let frame = 0;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null;
    const relocate = () => {
      if (!target) return null;
      for (const candidate of document.querySelectorAll(anchorSelector(target))) {
        if (visibleBox(candidate)) return candidate;
      }
      return null;
    };
    const read = () => {
      frame = 0;
      let box = visibleBox(node);
      if (!box) {
        const next = relocate();
        if (next && next !== node) {
          observer?.unobserve(node);
          node = next;
          observer?.observe(node);
          box = visibleBox(node);
        }
      }
      if (!box) {
        setRect(null);
        return;
      }
      setRect((prev) =>
        prev && Math.abs(prev.top - box.top) < 0.5 && Math.abs(prev.left - box.left) < 0.5 && Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5
          ? prev
          : { top: box.top, left: box.left, width: box.width, height: box.height }
      );
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(read);
    }
    read();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    observer?.observe(node);
    // The anchor removed or re-rendered: notice it at once.
    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    mutations?.observe(document.body, { childList: true, subtree: true });
    // Late layout shifts (images, fonts) without a resize of the anchor itself.
    const poll = setInterval(schedule, 600);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      mutations?.disconnect();
      clearInterval(poll);
    };
  }, [initial, target]);
  return rect;
}

export default function TourOverlay({ tour, step, node, ready, progress, isFirst, isLast, onNext, onBack, onSkip }) {
  const { t } = useLocale();
  const { settings } = useSettings();
  const viewport = useViewport();
  const rect = useAnchorRect(ready ? node : null, step?.target);
  const popRef = useRef(null);
  const nextRef = useRef(null);
  const [place, setPlace] = useState(null);
  const [nudge, setNudge] = useState(false);
  const titleId = useId();
  const textId = useId();
  const phone = Boolean(window.matchMedia?.(PHONE).matches);
  const params = { app: settings?.appName || t('brand') };

  const spot = rect
    ? {
        top: Math.max(4, rect.top - PAD),
        left: Math.max(4, rect.left - PAD),
        width: Math.min(viewport.width - 8, rect.width + PAD * 2),
        height: rect.height + PAD * 2,
      }
    : null;

  useLayoutEffect(() => {
    if (!ready || !popRef.current) return;
    const box = popRef.current.getBoundingClientRect();
    if (phone) {
      // Bottom sheet, or a top sheet when the anchor sits in the lower half.
      const low = spot && spot.top + spot.height / 2 > viewport.height * 0.55;
      setPlace({ sheet: low ? 'top' : 'bottom' });
      return;
    }
    setPlace(placePopover({ target: spot, popover: { width: box.width, height: box.height }, viewport, placement: step.placement }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spot?.top, spot?.left, spot?.width, spot?.height, viewport.width, viewport.height, step.id, phone]);

  // Focus the main button on every step (without scrolling the page).
  useEffect(() => {
    if (!ready) return undefined;
    const focus = () => {
      if (!popRef.current?.contains(document.activeElement)) nextRef.current?.focus({ preventScroll: true });
    };
    focus();
    // A closing drawer or menu may hand focus back to its opener a moment later.
    const timers = [120, 400].map((ms) => setTimeout(focus, ms));
    return () => timers.forEach(clearTimeout);
  }, [ready, step.id]);

  const onKey = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onSkip();
        return;
      }
      const typing = event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '');
      if (typing) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        onBack();
      } else if (event.key === 'Tab' && popRef.current) {
        const items = [...popRef.current.querySelectorAll('button:not([disabled])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (!popRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [onNext, onBack, onSkip]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onKey]);

  const style = place?.sheet ? undefined : place ? { top: place.top, left: place.left } : { visibility: 'hidden' };
  const arrowStyle = place?.arrow != null ? (place.placement === 'top' || place.placement === 'bottom' ? { left: place.arrow } : { top: place.arrow }) : undefined;
  const title = step.title ? t(step.title, params) : '';
  const text = step.text ? t(step.text, params) : '';

  return createPortal(
    <div className={`tour${ready ? ' is-ready' : ''}${phone ? ' is-phone' : ''}`} data-tour-id={tour.id}>
      {/* The dim: a spotlight with a huge shadow, or the whole screen for a centred step. */}
      <div
        className="tour__catch"
        onClick={() => {
          // A click outside: the popover shakes gently to show where to go on.
          setNudge(true);
          setTimeout(() => setNudge(false), 450);
          nextRef.current?.focus({ preventScroll: true });
        }}
        aria-hidden="true"
      />
      {spot ? (
        <div className="tour__spot" style={spot} aria-hidden="true" />
      ) : (
        <div className="tour__shade" aria-hidden="true" />
      )}
      <div
        ref={popRef}
        className={`tour__pop${place?.sheet ? ` is-sheet is-${place.sheet}` : ''}${place?.placement ? ` at-${place.placement}` : ''}${nudge ? ' is-nudged' : ''}`}
        key={step.id}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
      >
        {arrowStyle && !place?.sheet && <span className="tour__arrow" style={arrowStyle} aria-hidden="true" />}
        <div className="tour__top">
          <span className="tour__count">{t('tour.ui.progress', { current: progress.current, total: progress.total })}</span>
          <span className="tour__dots" aria-hidden="true">
            {Array.from({ length: Math.min(progress.total, 12) }, (_, i) => (
              <i key={i} className={i + 1 === progress.current ? 'is-on' : i + 1 < progress.current ? 'is-done' : ''} />
            ))}
          </span>
          <button type="button" className="tour__x" onClick={onSkip} aria-label={t('tour.ui.close')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <h2 id={titleId} className="tour__title">{title}</h2>
        <p id={textId} className="tour__text">{text}</p>
        <div className="tour__foot">
          {!isLast && (
            <button type="button" className="tour__skip" onClick={onSkip}>
              {t('tour.ui.skip')}
            </button>
          )}
          <span className="tour__spacer" />
          {!isFirst && (
            <button type="button" className="tour__btn" onClick={onBack}>
              {t('tour.ui.back')}
            </button>
          )}
          <button type="button" ref={nextRef} className="tour__btn is-primary" onClick={onNext}>
            {isLast ? t('tour.ui.done') : t('tour.ui.next')}
          </button>
        </div>
        <span className="tour__keys" aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> · <kbd>Esc</kbd>
        </span>
      </div>
      <div className="tour__sr" aria-live="polite">
        {ready ? `${t('tour.ui.progress', { current: progress.current, total: progress.total })}. ${title}` : ''}
      </div>
    </div>,
    document.body
  );
}
