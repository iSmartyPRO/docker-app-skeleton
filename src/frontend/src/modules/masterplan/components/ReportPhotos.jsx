import { useState } from 'react';
import { useLocale } from '../../../context/LocaleContext';

export const isVideo = (item) => item?.kind === 'video' || /^video\//.test(item?.mime || '');

/** How many tiles a layout shows (the last one carries "+N" when there are more). */
const SHOWN = 5;

function Tile({ item, index, big, more, onOpen }) {
  const { t } = useLocale();
  const [loaded, setLoaded] = useState(false);
  const video = isVideo(item);
  // A lone photo is shown large: the full picture over its preview; the rest use the 480 px preview.
  const src = big && !video ? item.url : item.thumbUrl || (video ? null : item.url);
  return (
    <button
      type="button"
      className={`mpr-tile${loaded || !src ? ' is-loaded' : ''}${video ? ' is-video' : ''}`}
      onClick={() => onOpen(index)}
      aria-label={more ? `${t('mp.rep.photo.open', { n: index + 1 })} (+${more})` : t('mp.rep.photo.open', { n: index + 1 })}
      style={big && item.thumbUrl ? { backgroundImage: `url("${item.thumbUrl}")` } : undefined}
    >
      {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)} />}
      {video && (
        <span className="mpr-tile__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
        </span>
      )}
      {more > 0 && <span className="mpr-tile__more">{t('mp.rep.more', { n: more })}</span>}
    </button>
  );
}

/**
 * Photos and videos of a report as a tidy grid: 1 — one large picture in its
 * own proportions; 2 — side by side; 3 — one large and two stacked; 4 — 2×2;
 * 5 and more — one large and four small, the last with "+N". Previews load
 * lazily with a shimmer; a tap opens the lightbox at that picture.
 */
export default function ReportPhotos({ media, onOpen, compact }) {
  if (!media?.length) return null;
  const n = media.length;
  const shown = media.slice(0, Math.min(n, SHOWN));
  const layout = n >= 5 ? 5 : n;
  const first = media[0];
  let ratio = null;
  if (n === 1) {
    const r = first.width && first.height ? first.width / first.height : 4 / 3;
    ratio = Math.min(1.9, Math.max(compact ? 1 : 0.8, r));
  }
  return (
    <div className={`mpr-grid is-${layout}${compact ? ' is-compact' : ''}`} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
      {shown.map((item, index) => (
        <Tile key={item.id} item={item} index={index} big={n === 1} more={index === shown.length - 1 ? n - shown.length : 0} onOpen={onOpen} />
      ))}
    </div>
  );
}
