import { markerFont, readableText } from './markers';

/*
 * Point markers drawn inside the plan's transformed <g> (PlanCanvas). Sizes
 * come from layoutMarkers() in screen px and are divided by the zoom `k`, so
 * a marker keeps its on-screen size while its centre follows the plan.
 *
 * marker: { id, x, y, r, label, fill, text?, ring?: [{ from, to, color }],
 *           progress?: 0..100, chip?: '12/42', dim, selected, hover, title }
 *   ring     — a building with many units: status shares around the disc (sales layer)
 *   progress — readiness arc around the disc (construction layer)
 */

const RING_GAP = 2; // px between the disc's white rim and the ring
const RING_W = 3.6; // px

export function MarkerDefs({ k }) {
  return (
    <defs>
      <radialGradient id="mpMkGloss" cx="0.36" cy="0.3" r="0.78">
        <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
        <stop offset="1" stopColor="#0f172a" stopOpacity="0.18" />
      </radialGradient>
      <filter id="mpMkShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy={1.3 / k} stdDeviation={1.5 / k} floodColor="#0f172a" floodOpacity="0.38" />
      </filter>
      <filter id="mpMkLift" x="-80%" y="-80%" width="260%" height="260%">
        <feDropShadow dx="0" dy={3 / k} stdDeviation={3.2 / k} floodColor="#0f172a" floodOpacity="0.42" />
      </filter>
    </defs>
  );
}

/** An arc of a circle of radius r as dashes: from..to in percent from 12 o'clock, clockwise. */
function Arc({ r, from, to, color, width, className = '' }) {
  const span = Math.max(0, to - from);
  if (span <= 0) return null;
  // A hair of a gap between segments reads as separate pieces; a full circle has none.
  const gap = span >= 99.9 ? 0 : Math.min(1.6, span * 0.3);
  return (
    <circle
      className={`mp-mk__arc ${className}`}
      r={r}
      pathLength={100}
      transform="rotate(-90)"
      style={{ stroke: color, strokeWidth: width, strokeDasharray: `${span - gap} ${100 - span + gap}`, strokeDashoffset: -from }}
    />
  );
}

export default function MarkerLayer({ markers, layout, k, editing = null, onKeyActivate, onFocusMarker }) {
  const byId = new Map(markers.map((marker) => [marker.id, marker]));
  // Lower markers on top (a natural perspective); the hovered and the selected above all.
  const order = [...layout].sort((a, b) => {
    const ma = byId.get(a.id);
    const mb = byId.get(b.id);
    const lift = (m) => (m?.selected ? 2 : m?.hover ? 1 : 0);
    return lift(ma) - lift(mb) || a.y - b.y;
  });
  return (
    <g className={`mp-mks${editing ? ' is-editing' : ''}`}>
      <MarkerDefs k={k} />
      {order.map((item) => {
        const marker = byId.get(item.id);
        if (!marker) return null;
        const outer = item.rPx;
        const hasRing = !item.dot && (marker.ring?.length > 0 || (marker.progress !== null && marker.progress !== undefined)) && outer >= 13;
        const body = hasRing ? outer - RING_GAP - RING_W : outer;
        const ringR = body + RING_GAP + RING_W / 2;
        const px = item.dot ? 0 : markerFont(marker.label, body);
        const ink = marker.text || readableText(marker.fill);
        const showChip = marker.chip && !item.dot && outer >= 18;
        const cls = `mp-mk${marker.selected ? ' is-selected' : ''}${marker.hover ? ' is-hover' : ''}${marker.dim ? ' is-dim' : ''}${item.dot ? ' is-dot' : ''}${editing?.selectedId === marker.id ? ' is-picked' : ''}`;
        return (
          <g
            key={marker.id}
            className={cls}
            transform={`translate(${item.x} ${item.y})`}
            data-shape={marker.id}
            data-mk={marker.id}
            tabIndex={0}
            role="button"
            aria-label={marker.title || marker.label}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onKeyActivate?.(marker.id);
              }
            }}
            onFocus={() => onFocusMarker?.(marker.id, item)}
            onBlur={() => onFocusMarker?.(null)}
          >
            {(marker.selected || editing?.selectedId === marker.id) && <circle className="mp-mk__halo" r={(outer + 6) / k} style={{ strokeWidth: 2.5 / k }} />}
            <circle className="mp-mk__focus" r={(outer + 4) / k} style={{ strokeWidth: 2 / k }} />
            <g className="mp-mk__disc">
              {hasRing && <circle className="mp-mk__track" r={ringR / k} style={{ strokeWidth: (RING_W + 2) / k }} />}
              {hasRing && marker.ring?.length > 0 && marker.ring.map((seg) => <Arc key={seg.from} r={ringR / k} from={seg.from} to={seg.to} color={seg.color} width={RING_W / k} />)}
              {hasRing && !marker.ring?.length && <Arc r={ringR / k} from={0} to={Math.max(0, Math.min(100, marker.progress))} color="#15803d" width={RING_W / k} className="is-progress" />}
              <circle className="mp-mk__body" r={body / k} style={{ fill: marker.fill }} />
              <circle className="mp-mk__gloss" r={body / k} />
              <circle className="mp-mk__rim" r={(body - 0.8) / k} style={{ strokeWidth: (item.dot ? 1.4 : 1.8) / k }} />
              {px > 0 && (
                <text className={`mp-mk__num${ink === '#fff' ? '' : ' is-ink'}`} fontSize={px / k} style={{ strokeWidth: 2.4 / k }} dominantBaseline="central" textAnchor="middle" dy={0.04 * (px / k)}>
                  {marker.label}
                </text>
              )}
            </g>
            {showChip && (
              <g className="mp-mk__chip" transform={`translate(0 ${(outer + 9) / k})`}>
                <rect x={-(marker.chip.length * 3.3 + 6) / k} y={-7.5 / k} width={(marker.chip.length * 6.6 + 12) / k} height={15 / k} rx={7.5 / k} style={{ strokeWidth: 1 / k }} />
                <text fontSize={10 / k} dominantBaseline="central" textAnchor="middle">{marker.chip}</text>
              </g>
            )}
            <circle className="mp-mk__hit" r={item.hitPx / k} data-shape={marker.id} data-mk={marker.id} />
            {editing?.selectedId === marker.id && editing.resizable && (
              <g className="mp-mk__resize">
                {/* The real size on the plan (the drawn disc keeps a readable size on screen). */}
                <circle className="mp-mk__ghost" r={marker.r} style={{ strokeWidth: 1.2 / k, strokeDasharray: `${4 / k} ${3 / k}` }} />
                <circle cx={Math.max(marker.r, (outer + 8) / k)} cy={0} r={6 / k} data-mk-resize={marker.id} style={{ strokeWidth: 2 / k }} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
