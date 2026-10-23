import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spin, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

/** Page preview for the thumbnail rail and the slide overview. */
export function Thumb({ doc, number, active, onClick }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 0.25 });
      const canvas = ref.current.querySelector('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      if (!cancelled) await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc, number, visible]);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <button type="button" ref={ref} className={`pdfv-thumb${active ? ' is-active' : ''}`} onClick={onClick}>
      <canvas />
      <span>{number}</span>
    </button>
  );
}

/**
 * One page fitted into the stage. The new page is drawn off screen and swapped
 * in when ready, so moving between slides never flashes an empty frame.
 */
function Slide({ doc, number, size, box }) {
  const holder = useRef(null);
  const [ready, setReady] = useState(false);
  const scale = box.w && box.h ? Math.min(box.w / size.width, box.h / size.height) : 0;

  useEffect(() => {
    if (!scale) return undefined;
    let cancelled = false;
    let task;
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      // Sharp on HiDPI screens without huge canvases on 4K projectors.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
      await task.promise;
      if (cancelled) return;
      holder.current?.replaceChildren(canvas);
      setReady(true);
      // Warm up the next page so the following step is instant.
      if (number < doc.numPages) doc.getPage(number + 1).catch(() => {});
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, scale]);

  return (
    <div className="pdfs-slide" style={{ width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) }}>
      <div ref={holder} className="pdfs-slide__canvas" />
      {!ready && <Spin className="pdfs-slide__spin" />}
    </div>
  );
}

/**
 * Slide view of a PDF: one page at a time, fitted to the screen. Inline in the
 * viewer, or as a full-screen presentation (`presenting`) with an auto-hiding
 * control bar, keyboard / click / wheel / swipe navigation and an overview.
 */
export default function PdfSlides({ doc, sizes, page, onPage, presenting = false, onPresent, onExit }) {
  const { t } = useLocale();
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [overview, setOverview] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);
  const wheelAt = useRef(0);
  const touch = useRef(null);
  const total = sizes.length;
  const size = sizes[page - 1] || sizes[0];
  // The latest callback, so a new function from the parent never restarts full screen.
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const go = useCallback((number) => onPage(Math.min(Math.max(1, number), total)), [onPage, total]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const pad = presenting ? 0 : 24;
      setBox({ w: Math.max(0, entry.contentRect.width - pad * 2), h: Math.max(0, entry.contentRect.height - pad * 2) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [presenting, overview]);

  // Keys go to the slides, not to the page or a modal behind them.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [presenting]);

  // Full screen: enter on start; leaving it (Esc, F11, the browser's UI) ends the show.
  useEffect(() => {
    if (!presenting) return undefined;
    const node = rootRef.current;
    if (node?.requestFullscreen && !document.fullscreenElement) node.requestFullscreen().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) exitRef.current?.();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [presenting]);

  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    if (presenting) idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => {
    wake();
    return () => clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);

  const onKeyDown = (event) => {
    if (event.target.closest?.('input, textarea')) return;
    const key = event.key;
    let handled = true;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(key)) go(page + 1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(key)) go(page - 1);
    else if (key === 'Home') go(1);
    else if (key === 'End') go(total);
    else if (key === 'g' || key === 'G') setOverview((value) => !value);
    else if (key === 'Escape' && overview) setOverview(false);
    else if (key === 'Escape' && presenting) onExit?.();
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      wake();
    }
  };

  const onStageClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    go(event.clientX - rect.left < rect.width / 3 ? page - 1 : page + 1);
  };

  const onWheel = (event) => {
    const now = Date.now();
    if (now - wheelAt.current < 350 || Math.abs(event.deltaY) < 12) return;
    wheelAt.current = now;
    go(page + (event.deltaY > 0 ? 1 : -1));
  };

  const body = (
    <div
      ref={rootRef}
      className={`pdfs${presenting ? ' is-presenting' : ''}${idle ? ' is-idle' : ''}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseMove={wake}
      role="region"
      aria-roledescription={t('common.a11y.slides')}
      aria-label={t('kb.viewer.viewSlides')}
    >
      {overview ? (
        <div className="pdfs-overview">
          {sizes.map((_, index) => (
            <Thumb
              key={index + 1}
              doc={doc}
              number={index + 1}
              active={page === index + 1}
              onClick={() => {
                go(index + 1);
                setOverview(false);
              }}
            />
          ))}
        </div>
      ) : (
        <div
          ref={stageRef}
          className="pdfs-stage"
          onClick={onStageClick}
          onWheel={onWheel}
          onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            const start = touch.current;
            const end = event.changedTouches[0]?.clientX;
            touch.current = null;
            if (start == null || end == null || Math.abs(end - start) < 50) return;
            event.preventDefault();
            go(page + (end < start ? 1 : -1));
          }}
        >
          {size && <Slide doc={doc} number={page} size={size} box={box} />}
        </div>
      )}
      <div className="pdfs-progress" aria-hidden>
        <span style={{ width: `${(page / total) * 100}%` }} />
      </div>
      <div className="pdfs-bar" onClick={(event) => event.stopPropagation()} role="toolbar">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t('common.a11y.previous')}>‹</button>
        <span className="pdfs-bar__count">
          {page} <em>/ {total}</em>
        </span>
        <button type="button" onClick={() => go(page + 1)} disabled={page >= total} aria-label={t('common.a11y.next')}>›</button>
        <span className="pdfs-bar__sep" />
        <Tooltip title={t('kb.viewer.overview')} getPopupContainer={() => rootRef.current || document.body}>
          <button type="button" className={overview ? 'is-on' : ''} onClick={() => setOverview((value) => !value)} aria-label={t('kb.viewer.overview')}>▦</button>
        </Tooltip>
        {presenting ? (
          <Tooltip title={t('kb.viewer.slideKeys')} getPopupContainer={() => rootRef.current || document.body}>
            <button type="button" className="pdfs-bar__exit" onClick={onExit}>✕ {t('kb.viewer.exitPresentation')}</button>
          </Tooltip>
        ) : (
          onPresent && (
            <Tooltip title={t('kb.viewer.presentHint')}>
              <button type="button" className="pdfs-bar__present" onClick={onPresent}>▶ {t('kb.viewer.present')}</button>
            </Tooltip>
          )
        )}
      </div>
    </div>
  );

  // The show sits above everything (modals included) and is the full-screen element.
  return presenting ? createPortal(body, document.body) : body;
}
