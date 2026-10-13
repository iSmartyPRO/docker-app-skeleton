import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';

/*
 * The site plan surface: a background (image or SVG) with clickable polygons
 * on top, zoom (wheel, buttons, pinch), pan (drag), "fit" and "focus on a
 * box". Coordinates of polygons are the plan's own (its width × height).
 *
 * shapes: [{ id, points: [[x, y]…], fill, stroke, level, dim, selected, label }]
 * edit:   { points, closed, onAdd(pt), onMove(index, pt), onRemove(index) } — the contour editor
 */

const MIN_K = 0.05;
const MAX_K = 40;

export function bboxOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Area-weighted centroid of a polygon (label position). */
export function centroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const box = bboxOf(points);
    return [box.x + box.w / 2, box.y + box.h / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

const PlanCanvas = forwardRef(function PlanCanvas({ width, height, background, shapes, onShapeClick, onShapeHover, onBackgroundClick, edit, className = '', ariaLabel, children }, ref) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // { x, y, k }
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitBox = useCallback(
    (target, pad = 0.06) => {
      if (!size.w || !size.h) return;
      const w = Math.max(target.w, 1);
      const h = Math.max(target.h, 1);
      const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(size.w / (w * (1 + pad * 2)), size.h / (h * (1 + pad * 2)))));
      setView({ k, x: size.w / 2 - (target.x + w / 2) * k, y: size.h / 2 - (target.y + h / 2) * k });
    },
    [size]
  );
  const fit = useCallback(() => fitBox({ x: 0, y: 0, w: width, h: height }, 0.02), [fitBox, width, height]);

  useEffect(() => {
    if (size.w && !view) fit();
  }, [size, view, fit]);

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      if (!v) return v;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fit,
    fitBox,
    zoom: (factor) => zoomAt(factor, size.w / 2, size.h / 2),
  }), [fit, fitBox, zoomAt, size]);

  // Wheel zoom must be non-passive to stop the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018)), event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toPlan = (clientX, clientY) => {
    const rect = box.current.getBoundingClientRect();
    return [(clientX - rect.left - view.x) / view.k, (clientY - rect.top - view.y) / view.k];
  };

  const onPointerDown = (event) => {
    if (!view) return;
    box.current.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const vertex = event.target.dataset?.vertex;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), view };
      return;
    }
    gesture.current = { type: vertex !== undefined ? 'vertex' : 'pan', index: Number(vertex), startX: event.clientX, startY: event.clientY, view, moved: false, target: event.target };
  };

  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!view) return;
    if (!g) {
      if (onShapeHover) {
        const id = event.target.dataset?.shape;
        const rect = box.current.getBoundingClientRect();
        onShapeHover(id ? Number(id) : null, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.type === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = box.current.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      const k = Math.min(MAX_K, Math.max(MIN_K, g.view.k * (dist / g.dist)));
      const f = k / g.view.k;
      setView({ k, x: cx - (cx - g.view.x) * f, y: cy - (cy - g.view.y) * f });
      return;
    }
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > 4) {
      g.moved = true;
      setDragging(true);
    }
    if (!g.moved) return;
    if (g.type === 'vertex') edit?.onMove?.(g.index, toPlan(event.clientX, event.clientY));
    else setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
  };

  const onPointerUp = (event) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) return;
    gesture.current = null;
    setDragging(false);
    if (!g || g.moved || g.type === 'pinch') return;
    // A click (no drag).
    const id = g.target?.dataset?.shape;
    if (g.type === 'vertex') return;
    if (edit && !edit.closed) {
      edit.onAdd?.(toPlan(event.clientX, event.clientY));
      return;
    }
    if (id) onShapeClick?.(Number(id));
    else onBackgroundClick?.();
  };

  const k = view?.k || 1;
  const labels = useMemo(() => shapes.filter((shape) => shape.label).map((shape) => ({ id: shape.id, at: centroid(shape.points), box: bboxOf(shape.points), label: shape.label, level: shape.level })), [shapes]);

  return (
    <div
      ref={box}
      className={`mp-canvas${dragging ? ' is-dragging' : ''}${edit ? ' is-editing' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !gesture.current && onShapeHover?.(null)}
      role="application"
      aria-label={ariaLabel}
    >
      {view && (
        <svg className="mp-canvas__svg" width={size.w} height={size.h}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <rect x={0} y={0} width={width} height={height} className="mp-canvas__paper" />
            {background && <image href={background} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
            {shapes
              .filter((shape) => shape.level)
              .map((shape) => (
                <polygon key={`l${shape.id}`} data-shape={shape.id} points={shape.points.map((p) => p.join(',')).join(' ')} className={`mp-shape is-level${shape.selected ? ' is-selected' : ''}${shape.dim ? ' is-dim' : ''}`} style={{ '--fill': shape.fill, '--stroke': shape.stroke, strokeWidth: (shape.selected ? 3 : 1.6) / k, strokeDasharray: `${6 / k} ${4 / k}` }} />
              ))}
            {shapes
              .filter((shape) => !shape.level)
              .map((shape) => (
                <polygon key={shape.id} data-shape={shape.id} points={shape.points.map((p) => p.join(',')).join(' ')} className={`mp-shape${shape.selected ? ' is-selected' : ''}${shape.dim ? ' is-dim' : ''}${shape.hover ? ' is-hover' : ''}`} style={{ '--fill': shape.fill, '--stroke': shape.stroke, strokeWidth: (shape.selected ? 3.5 : 1.2) / k }} />
              ))}
            {labels.map((item) => {
              const fontPx = item.level ? 13 : 11;
              const fits = item.box.w * k > (item.level ? 60 : 34) && item.box.h * k > 16;
              if (!fits) return null;
              // Levels are labelled above their top-left corner, so unit labels inside stay readable.
              const x = item.level ? item.box.x + 4 / k : item.at[0];
              const y = item.level ? item.box.y - 7 / k : item.at[1];
              return (
                <text key={`t${item.id}`} x={x} y={y} className={`mp-shape__label${item.level ? ' is-level' : ''}`} fontSize={fontPx / k} dominantBaseline={item.level ? 'auto' : 'middle'} textAnchor={item.level ? 'start' : 'middle'}>
                  {item.label}
                </text>
              );
            })}
            {edit?.points?.length > 0 && (
              <g className="mp-edit">
                {edit.closed ? <polygon points={edit.points.map((p) => p.join(',')).join(' ')} style={{ strokeWidth: 2 / k }} /> : <polyline points={edit.points.map((p) => p.join(',')).join(' ')} style={{ strokeWidth: 2 / k }} />}
                {edit.points.map((p, index) => (
                  <circle key={index} data-vertex={index} cx={p[0]} cy={p[1]} r={6 / k} style={{ strokeWidth: 2 / k }} onDoubleClick={(event) => { event.stopPropagation(); edit.onRemove?.(index); }} />
                ))}
              </g>
            )}
          </g>
        </svg>
      )}
      {children}
    </div>
  );
});

export default PlanCanvas;
