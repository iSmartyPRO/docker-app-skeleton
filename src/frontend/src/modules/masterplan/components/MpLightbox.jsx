import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { PALETTE, UserAvatar } from '../../shared/People';
import { formatPercent } from '../lib';
import { localeTag } from '../../../i18n/languages';
import { translate } from '../../../i18n/translations';

const MAX = 6;
const isVideo = (item) => item?.kind === 'video' || /^video\//.test(item?.mime || '');

function fileSize(bytes, locale) {
  const n = Number(bytes) || 0;
  if (!n) return null;
  const units = ['b', 'kb', 'mb', 'gb'].map((key) => translate(locale, `format.bytes.${key}`) ?? key.toUpperCase());
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(localeTag(locale), { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}

/**
 * Full-screen viewer of a report's photos and videos. Follows the knowledge
 * base viewer (kb/viewers/ImageViewer: wheel / pinch / double-click zoom, drag
 * to pan, ←/→ and swipe, Esc) and adds what a site photo needs: the report
 * as a caption (author, date, stage, comment), EXIF shooting time and place,
 * video playback, download and — when allowed — deleting the photo.
 *
 * `items`: media of the report (mediaShape); `report`: the report for the
 * caption; `onDelete(item)` (optional) returns a promise.
 */
export default function MpLightbox({ items, index, onIndex, onClose, report, onDelete }) {
  const { t, locale } = useLocale();
  const { modal } = App.useApp();
  const item = items[index];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Which item's image has loaded (by id, not a flag reset after the switch: a cached image may load before that reset).
  const [loadedId, setLoadedId] = useState(null);
  const [info, setInfo] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1100);
  const drag = useRef(null);
  const pinch = useRef(null);
  const swipe = useRef(null);
  const confirming = useRef(false);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [index, reset]);

  const go = useCallback((delta) => {
    if (items.length < 2) return;
    onIndex((index + delta + items.length) % items.length);
  }, [items.length, index, onIndex]);

  const remove = useCallback(() => {
    if (!onDelete || !item) return;
    confirming.current = true;
    modal.confirm({
      title: t('mp.rep.photo.deleteTitle'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      zIndex: 1400,
      onOk: () => onDelete(item),
      afterClose: () => {
        confirming.current = false;
      },
    });
  }, [item, modal, onDelete, t]);

  useEffect(() => {
    const onKey = (event) => {
      if (confirming.current) return;
      if (event.key === 'Escape') {
        // Esc closes the viewer only, not the card or dialog under it (listening in the capture phase, first).
        event.stopImmediatePropagation();
        onClose();
      }
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(MAX, value * 1.25));
      else if (event.key === '-') setZoom((value) => Math.max(1, value / 1.25));
      else if (event.key === '0') reset();
      else if (event.key === 'i') setInfo((value) => !value);
      else if (event.key === 'Delete' && onDelete) remove();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [go, onClose, reset, remove, onDelete]);

  // The neighbours are fetched ahead, so swiping through a report does not wait.
  useEffect(() => {
    for (const delta of [1, -1]) {
      const next = items[(index + delta + items.length) % items.length];
      if (next && !isVideo(next)) new Image().src = next.url;
    }
  }, [index, items]);

  useEffect(() => {
    if (zoom === 1) setOffset({ x: 0, y: 0 });
  }, [zoom]);

  if (!item) return null;
  const video = isVideo(item);
  const loaded = loadedId === item.id;
  const shown = item.id;
  // An image already complete when it mounts (from the cache) counts as loaded at once.
  const imageRef = (img) => {
    if (img?.complete && img.naturalWidth > 0 && loadedId !== shown) setLoadedId(shown);
  };

  const onWheel = (event) => {
    if (video) return;
    setZoom((value) => Math.min(MAX, Math.max(1, value * (event.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };
  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (zoom > 1) drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    else swipe.current = { x: event.clientX, y: event.clientY, t: Date.now() };
  };
  const onPointerMove = (event) => {
    if (drag.current) setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
  };
  const onPointerUp = (event) => {
    if (swipe.current && zoom === 1) {
      const dx = event.clientX - swipe.current.x;
      const dy = event.clientY - swipe.current.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && Date.now() - swipe.current.t < 700) go(dx < 0 ? 1 : -1);
      else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5 && Date.now() - swipe.current.t < 700) onClose();
    }
    drag.current = null;
    swipe.current = null;
  };
  const onTouchMove = (event) => {
    if (event.touches.length !== 2 || video) return;
    swipe.current = null;
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) pinch.current = { distance, zoom };
    else setZoom(Math.min(MAX, Math.max(1, (pinch.current.zoom * distance) / pinch.current.distance)));
  };

  const facts = [
    item.takenAt && { label: t('mp.rep.photo.taken'), value: fmtDateTime(item.takenAt) },
    item.createdAt && { label: t('mp.rep.photo.uploaded'), value: fmtDateTime(item.createdAt) },
    item.lat !== null && item.lat !== undefined && item.lng !== null && item.lng !== undefined && {
      label: t('mp.rep.photo.place'),
      value: (
        <a href={`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=18/${item.lat}/${item.lng}`} target="_blank" rel="noreferrer">
          {Number(item.lat).toFixed(5)}, {Number(item.lng).toFixed(5)} ↗
        </a>
      ),
    },
    item.width && item.height && { label: t('mp.rep.photo.size'), value: `${item.width} × ${item.height}${fileSize(item.size, locale) ? ` · ${fileSize(item.size, locale)}` : ''}` },
    item.name && { label: t('mp.rep.photo.file'), value: item.name },
  ].filter(Boolean);

  return createPortal(
    <div className={`mpr-lb${info ? ' has-info' : ''}`} role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="mpr-lb__bar">
        {report?.author && (
          <div className="mpr-lb__who">
            <span className="mpr-avatar" style={{ '--c': PALETTE[(report.author.id || 0) % PALETTE.length] }}>
              <UserAvatar user={report.author} size={30} tip={false} />
            </span>
            <span>
              <b>{report.author.name}</b>
              <small>{[fmtDate(report.factDate), report.stage?.name].filter(Boolean).join(' · ')}</small>
            </span>
          </div>
        )}
        <span className="mpr-lb__count">{index + 1} / {items.length}</span>
        <span className="mpr-lb__spacer" />
        {!video && (
          <span className="mpr-lb__zoom mpr-hide-phone">
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.4))} aria-label={t('mp.rep.photo.zoomOut')} title={t('mp.rep.photo.zoomOut')}>−</button>
            <button type="button" onClick={reset} className="mpr-lb__pct">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(MAX, value * 1.4))} aria-label={t('mp.rep.photo.zoomIn')} title={t('mp.rep.photo.zoomIn')}>+</button>
          </span>
        )}
        <button type="button" className={info ? 'is-on' : ''} onClick={() => setInfo((value) => !value)} aria-label={t('mp.rep.photo.info')} title={t('mp.rep.photo.info')} aria-pressed={info}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 10.5v6M12 7.2v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <a href={`${item.url}?download=1`} aria-label={t('mp.rep.photo.download')} title={t('mp.rep.photo.download')}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        {onDelete && (
          <button type="button" className="is-danger" onClick={remove} aria-label={t('mp.rep.photo.delete')} title={t('mp.rep.photo.delete')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button type="button" onClick={onClose} aria-label={t('mp.rep.photo.close')} title={t('mp.rep.photo.close')}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="mpr-lb__main">
        <div
          className={`mpr-lb__stage${zoom > 1 ? ' is-zoomed' : ''}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchMove={onTouchMove}
          onTouchEnd={() => (pinch.current = null)}
          onDoubleClick={() => !video && (zoom > 1 ? reset() : setZoom(2.5))}
          onClick={(event) => event.target === event.currentTarget && zoom === 1 && onClose()}
        >
          {!loaded && !video && (
            <>
              {item.thumbUrl && <img className="mpr-lb__blur" src={item.thumbUrl} alt="" aria-hidden="true" />}
              <div className="mpr-lb__spinner" />
            </>
          )}
          {video ? (
            <video key={item.id} src={item.url} controls playsInline autoPlay preload="metadata" poster={item.thumbUrl || undefined} />
          ) : (
            <img
              key={item.id}
              src={item.url}
              alt={item.name}
              draggable={false}
              ref={imageRef}
              onLoad={() => setLoadedId(shown)}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, opacity: loaded ? 1 : 0 }}
            />
          )}
          {items.length > 1 && (
            <>
              <button type="button" className="mpr-lb__nav is-prev" onClick={() => go(-1)} aria-label={t('mp.rep.photo.prev')}>‹</button>
              <button type="button" className="mpr-lb__nav is-next" onClick={() => go(1)} aria-label={t('mp.rep.photo.next')}>›</button>
            </>
          )}
        </div>
        {info && (
          <aside className="mpr-lb__info">
            {report && (
              <>
                <div className="mpr-lb__chips">
                  {report.nodes?.slice(0, 4).map((node) => <span key={node.id} className="mpr-chip is-dark">{node.code || node.name}</span>)}
                  {report.stage && <span className="mpr-chip is-dark is-stage">{report.stage.name}{report.percent !== null ? ` · ${formatPercent(report.percent, locale)}` : ''}</span>}
                </div>
                {report.body && <p className="mpr-lb__caption">{report.body}</p>}
              </>
            )}
            <dl>
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>
      {items.length > 1 && (
        <div className="mpr-lb__strip">
          {items.map((entry, position) => (
            <button type="button" key={entry.id} className={position === index ? 'is-active' : ''} onClick={() => onIndex(position)} aria-label={t('mp.rep.photo.open', { n: position + 1 })}>
              {entry.thumbUrl || !isVideo(entry) ? <img src={entry.thumbUrl || entry.url} alt="" loading="lazy" /> : <span className="mpr-lb__vthumb">▶</span>}
              {isVideo(entry) && <span className="mpr-lb__play" aria-hidden="true">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
