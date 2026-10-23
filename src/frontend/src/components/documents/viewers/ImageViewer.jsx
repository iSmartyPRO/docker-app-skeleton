import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../../../context/LocaleContext';

const MAX = 8;

/**
 * Full-screen gallery: wheel / pinch / double-click zoom, drag to pan,
 * ←/→ and swipe between images of the folder, Esc to close.
 */
export default function ImageViewer({ images, index, onIndex, onClose, src, canDownload }) {
  const { t } = useLocale();
  const image = images[index];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const drag = useRef(null);
  const pinch = useRef(null);
  const swipe = useRef(null);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
    setLoaded(false);
  }, [index, reset]);

  const go = useCallback(
    (delta) => {
      if (images.length < 2) return;
      onIndex((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndex]
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(MAX, value * 1.25));
      else if (event.key === '-') setZoom((value) => Math.max(1, value / 1.25));
      else if (event.key === '0') reset();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [go, onClose, reset]);

  useEffect(() => {
    if (zoom === 1) setOffset({ x: 0, y: 0 });
  }, [zoom]);

  const onWheel = (event) => {
    setZoom((value) => Math.min(MAX, Math.max(1, value * (event.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  const onPointerDown = (event) => {
    if (zoom > 1) drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    else swipe.current = { x: event.clientX, t: Date.now() };
  };
  const onPointerMove = (event) => {
    if (drag.current) setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
  };
  const onPointerUp = (event) => {
    if (swipe.current && zoom === 1) {
      const dx = event.clientX - swipe.current.x;
      if (Math.abs(dx) > 60 && Date.now() - swipe.current.t < 600) go(dx < 0 ? 1 : -1);
    }
    drag.current = null;
    swipe.current = null;
  };

  const onTouchMove = (event) => {
    if (event.touches.length !== 2) return;
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) pinch.current = { distance, zoom };
    else setZoom(Math.min(MAX, Math.max(1, (pinch.current.zoom * distance) / pinch.current.distance)));
  };

  if (!image) return null;

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lightbox__bar">
        <span className="lightbox__title">{image.title}</span>
        <span className="lightbox__count">
          {index + 1} / {images.length}
        </span>
        <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.4))} aria-label={t('common.a11y.zoomOut')}>−</button>
        <button type="button" onClick={reset} className="lightbox__pct">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(MAX, value * 1.4))} aria-label={t('common.a11y.zoomIn')}>+</button>
        {canDownload && (
          <a href={src.file(image, { download: true })} aria-label={t('kb.download')}>⤓</a>
        )}
        <button type="button" onClick={onClose} aria-label={t('common.cancel')}>✕</button>
      </div>
      <div
        className={`lightbox__stage${zoom > 1 ? ' is-zoomed' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (pinch.current = null)}
        onDoubleClick={() => (zoom > 1 ? reset() : setZoom(2.5))}
        onClick={(event) => event.target === event.currentTarget && zoom === 1 && onClose()}
      >
        {!loaded && <div className="lightbox__spinner" />}
        <img
          key={image.id}
          src={src.file(image)}
          alt={image.title}
          draggable={false}
          className={loaded ? 'is-loaded' : undefined}
          onLoad={() => setLoaded(true)}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, opacity: loaded ? 1 : 0 }}
        />
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="lightbox__nav is-prev" onClick={() => go(-1)} aria-label={t('common.a11y.previous')}>‹</button>
          <button type="button" className="lightbox__nav is-next" onClick={() => go(1)} aria-label={t('common.a11y.next')}>›</button>
          <div className="lightbox__strip">
            {images.map((item, position) => (
              <button
                type="button"
                key={item.id}
                className={position === index ? 'is-active' : ''}
                onClick={() => onIndex(position)}
              >
                {/* SVG has no raster thumbnail on the server: show the file itself. */}
                <img src={src.thumb && !/\.svg$/i.test(item.name || item.path || '') ? src.thumb(item, 160) : src.file(item)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
