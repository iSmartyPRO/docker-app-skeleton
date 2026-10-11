import { useId, useMemo, useRef, useState } from 'react';
import './charts.css';

/*
 * Small SVG charts for widgets: no chart library, themed by CSS variables,
 * animated on first paint, with hover read-outs. Each one fills its box.
 */

const TAU = Math.PI * 2;

function arc(cx, cy, r, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.sin(start);
  const y1 = cy - r * Math.cos(start);
  const x2 = cx + r * Math.sin(end);
  const y2 = cy - r * Math.cos(end);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Ring of segments with the total (or a label) in the middle. */
export function Donut({ data, size = 140, thickness = 16, center, sub, onPick }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  let angle = 0;
  const gap = data.filter((item) => item.value > 0).length > 1 ? 0.035 : 0;
  const active = hover != null ? data[hover] : null;
  return (
    <div className="dc-donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--dc-track)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((item, index) => {
            if (!item.value) return null;
            const span = (item.value / total) * TAU;
            const start = angle + gap / 2;
            const end = angle + span - gap / 2;
            angle += span;
            if (span >= TAU - 0.001) {
              return <circle key={item.label} cx={c} cy={c} r={r} fill="none" stroke={item.color} strokeWidth={thickness} className="dc-donut__seg" />;
            }
            return (
              <path
                key={item.label}
                d={arc(c, c, r, start, Math.max(start + 0.001, end))}
                fill="none"
                stroke={item.color}
                strokeWidth={hover === index ? thickness + 4 : thickness}
                strokeLinecap="round"
                className="dc-donut__seg"
                style={{ cursor: onPick ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick?.(item)}
              />
            );
          })}
      </svg>
      <div className="dc-donut__center">
        <strong>{active ? active.value : center ?? total}</strong>
        <span>{active ? active.label : sub}</span>
      </div>
    </div>
  );
}

/** Legend rows: colour, label, value and share. */
export function Legend({ data, onPick }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <ul className="dc-legend">
      {data.map((item) => (
        <li key={item.label}>
          <button type="button" onClick={() => onPick?.(item)} disabled={!onPick}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{item.value}</b>
            <em>{Math.round((item.value / total) * 100)}%</em>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars, longest first as given. */
export function Bars({ data, max, format = (value) => value, onPick }) {
  const top = max ?? Math.max(1, ...data.map((item) => item.value));
  return (
    <ul className="dc-bars">
      {data.map((item) => (
        <li key={item.key ?? item.label} className={onPick ? 'is-clickable' : ''} onClick={() => onPick?.(item)}>
          <div className="dc-bars__head">
            <span>
              {item.color && <i style={{ background: item.color }} />}
              {item.label}
            </span>
            <b>{format(item.value)}</b>
          </div>
          <div className="dc-bars__track">
            <span style={{ width: `${Math.max(item.value ? 3 : 0, (item.value / top) * 100)}%`, background: item.color || 'var(--dc-accent)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function niceMax(value) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * pow >= value / 4) * pow;
  return Math.ceil(value / step) * step;
}

/**
 * Lines (optionally filled) or stacked columns over days. `series` items:
 * { key, label, color, values[] }; `labels` are the x captions.
 */
export function TimeChart({ labels, series, height = 180, type = 'area', formatLabel = (value) => value, formatTip }) {
  const uid = useId().replace(/:/g, '');
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 600;
  const pad = { top: 12, right: 8, bottom: 22, left: 30 };
  const n = labels.length;
  const stacked = type === 'stack';
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
  const peak = stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values));
  const top = niceMax(peak);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  const every = Math.max(1, Math.ceil(n / 7));

  const paths = useMemo(
    () =>
      series.map((s) => {
        const points = s.values.map((v, i) => [x(i), y(v)]);
        // Smooth line through the points (monotone-ish cubic).
        let d = '';
        points.forEach(([px, py], i) => {
          if (!i) d = `M ${px} ${py}`;
          else {
            const [qx, qy] = points[i - 1];
            const mx = (qx + px) / 2;
            d += ` C ${mx} ${qy}, ${mx} ${py}, ${px} ${py}`;
          }
        });
        const area = points.length ? `${d} L ${points[points.length - 1][0]} ${y(0)} L ${points[0][0]} ${y(0)} Z` : '';
        return { ...s, d, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, top, n, height]
  );

  const onMove = (event) => {
    const rect = box.current.getBoundingClientRect();
    const rel = ((event.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((rel - pad.left) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const barW = Math.max(3, Math.min(26, (innerW / Math.max(n, 1)) * 0.62));

  return (
    <div className="dc-time" ref={box} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="dc-grid" />
            <text x={pad.left - 6} y={y(tick) + 3} className="dc-axis" textAnchor="end">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {stacked
          ? labels.map((_, i) => {
              let base = 0;
              return (
                <g key={i} className={hover === i ? 'is-hover' : ''}>
                  {series.map((s) => {
                    const v = s.values[i] || 0;
                    const y1 = y(base + v);
                    const h = y(base) - y1;
                    base += v;
                    return v ? <rect key={s.key} x={x(i) - barW / 2} y={y1} width={barW} height={Math.max(0, h)} rx={Math.min(3, barW / 3)} fill={s.color} className="dc-col" /> : null;
                  })}
                </g>
              );
            })
          : paths.map((s) => (
              <g key={s.key}>
                {type === 'area' && <path d={s.area} fill={`url(#${uid}-${s.key})`} className="dc-area" />}
                <path d={s.d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" className="dc-line" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="dc-cursor" />}
        {hover != null &&
          !stacked &&
          series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] || 0)} r="4" fill="var(--dc-surface)" stroke={s.color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />)}
        {labels.map((label, i) =>
          // Every few days, plus the last one when it does not crowd its neighbour.
          (i % every === 0 && n - 1 - i >= every * 0.7) || i === n - 1 ? (
            <text key={label} x={x(i)} y={height - 5} className="dc-axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {formatLabel(label)}
            </text>
          ) : null
        )}
      </svg>
      {hover != null && (
        <div className="dc-tip" style={{ left: `${(x(hover) / width) * 100}%` }}>
          <strong>{formatTip ? formatTip(labels[hover]) : formatLabel(labels[hover])}</strong>
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
              <b>{s.values[hover] || 0}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for a KPI. */
export function Sparkline({ values, color = 'var(--dc-accent)', height = 34 }) {
  const uid = useId().replace(/:/g, '');
  const width = 120;
  const top = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * width, height - 3 - (v / top) * (height - 6)]);
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  return (
    <svg className="dc-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 && <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${uid}-g)`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Progress ring with a percentage. */
export function Ring({ value, size = 64, thickness = 7, color = 'var(--dc-accent)', label }) {
  const r = (size - thickness) / 2;
  const len = TAU * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="dc-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--dc-track)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * len} ${len}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="dc-ring__value"
        />
      </svg>
      <span>{value == null ? '—' : `${Math.round(pct)}%`}</span>
      {label && <em>{label}</em>}
    </div>
  );
}

/** Fill bar (storage, quotas). */
export function Meter({ value, max, color = 'var(--dc-accent)' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct > 90 ? '#EF4444' : pct > 75 ? '#F59E0B' : color;
  return (
    <div className="dc-meter">
      <span style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}
