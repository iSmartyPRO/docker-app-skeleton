import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motionAllowed } from './themes';
import './backdrop.css';

/*
 * The fixed background layer behind the portal: a living theme's slow
 * animation (gradient drift, aurora, star grid) or the person's own picture.
 *
 * Cost is kept tiny: each living theme is a small canvas (1/10 of the window
 * for the gradient and aurora, 0.4 for the stars) repainted 2–3 times a
 * second and scaled up by CSS — soft shapes lose nothing, and the browser
 * composites 2–3 frames a second instead of 60. Everything stops when the tab
 * is hidden or the person has been idle for a minute, and never moves under
 * prefers-reduced-motion, «Без анимации», the administrator's switch, data
 * saver or on a weak device (≤ 2 cores or ≤ 2 GB memory) — then a still
 * frame is shown.
 */

const IDLE_MS = 60 * 1000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return undefined;
    const onChange = (event) => setReduced(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** True while the tab is visible and the person has done something in the last minute. */
function useAwake(enabled) {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    let idle = false;
    const update = () => setAwake(!document.hidden && !idle);
    const poke = () => {
      clearTimeout(timer);
      if (idle) {
        idle = false;
        update();
      }
      timer = setTimeout(() => {
        idle = true;
        update();
      }, IDLE_MS);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, poke, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', update);
    poke();
    update();
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, poke, { capture: true }));
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled]);
  return awake;
}

// Painters of the living themes. Each draws one frame at time `t` (ms) on a
// small canvas that CSS scales up to the window: soft gradients lose nothing
// at 1/10 of the resolution, and the browser only composites a new frame a
// few times a second instead of 60 — the whole cost of a living theme.
const PAINTERS = {
  // Dawn: four soft colour clouds drifting on slow Lissajous paths (2–3 minute cycles).
  gradient: {
    scale: 0.1,
    fps: 2,
    setup: () => null,
    draw(ctx, w, h, t, colors) {
      ctx.clearRect(0, 0, w, h);
      const paths = [
        [0.3, 0.35, 0.18, 0.12, 150000, 0],
        [0.72, 0.3, 0.15, 0.16, 190000, 1.3],
        [0.55, 0.72, 0.2, 0.1, 170000, 2.4],
        [0.2, 0.78, 0.14, 0.14, 210000, 4.1],
      ];
      paths.forEach(([x, y, ax, ay, period, phase], i) => {
        const a = (t / period) * Math.PI * 2 + phase;
        const cx = (x + ax * Math.sin(a)) * w;
        const cy = (y + ay * Math.cos(a * 0.8)) * h;
        const r = Math.max(w, h) * (0.45 + 0.05 * Math.sin(a * 1.3));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, colors[i % colors.length]);
        g.addColorStop(1, `${colors[i % colors.length]}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    },
  },
  // Aurora: three glowing blobs breathing and wandering (70–110 s cycles).
  aurora: {
    scale: 0.1,
    fps: 2,
    setup: () => null,
    draw(ctx, w, h, t, colors) {
      ctx.clearRect(0, 0, w, h);
      const blobs = [
        [0.15, 0.05, 70000, 0],
        [0.85, 0.15, 90000, 2],
        [0.45, 1.0, 110000, 4],
      ];
      blobs.forEach(([x, y, period, phase], i) => {
        const a = (t / period) * Math.PI * 2 + phase;
        const cx = (x + 0.12 * Math.sin(a)) * w;
        const cy = (y + 0.1 * Math.cos(a * 1.2)) * h;
        const r = Math.max(w, h) * (0.42 + 0.06 * Math.sin(a * 0.7));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, colors[i % colors.length]);
        g.addColorStop(1, `${colors[i % colors.length]}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    },
  },
  // Constellation: a loose grid of drifting stars with faint links, at 0.4 of the resolution.
  particles: {
    scale: 0.4,
    fps: 3,
    setup(w, h) {
      const count = Math.round(Math.min(64, Math.max(24, (w * h) / 3500)));
      const cols = Math.ceil(Math.sqrt(count * (w / h)));
      const rows = Math.ceil(count / cols);
      return Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        return {
          x: ((i % cols) + 0.5 + (Math.random() - 0.5) * 0.8) * (w / cols),
          y: (Math.floor(i / cols) + 0.5 + (Math.random() - 0.5) * 0.8) * (h / rows),
          vx: Math.cos(angle) * 0.06,
          vy: Math.sin(angle) * 0.06,
          r: 0.5 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
        };
      });
    },
    draw(ctx, w, h, t, colors, points, dt) {
      ctx.clearRect(0, 0, w, h);
      const color = colors[0] || '#FFFFFF';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 0.4;
      const step = dt / 66;
      for (const p of points) {
        p.x += p.vx * step;
        p.y += p.vy * step;
        if (p.x < -5) p.x = w + 5;
        if (p.x > w + 5) p.x = -5;
        if (p.y < -5) p.y = h + 5;
        if (p.y > h + 5) p.y = -5;
      }
      const near = 52 * 52;
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < near) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
      }
      ctx.globalAlpha = 0.12;
      ctx.stroke();
      for (const p of points) {
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(p.phase + t / 1600);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
};

/** A living theme's layer: a small canvas repainted a few times a second, or one still frame. */
function LivingCanvas({ kind, colors, moving }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const painter = PAINTERS[kind];
    if (!canvas || !painter) return undefined;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let state = null;
    // A still frame is a fixed moment, so the layout looks the same every visit.
    const start = moving ? performance.now() - Math.random() * 60000 : 0;
    let last = performance.now();
    const size = () => {
      w = canvas.width = Math.max(16, Math.round(window.innerWidth * painter.scale));
      h = canvas.height = Math.max(16, Math.round(window.innerHeight * painter.scale));
      state = painter.setup(w, h);
    };
    const paint = (now) => {
      const dt = Math.min(500, now - last);
      last = now;
      painter.draw(ctx, w, h, moving ? now - start : 40000, colors, state, moving ? dt : 0);
    };
    size();
    paint(performance.now());
    let timer = 0;
    let frame = 0;
    const loop = () => {
      timer = setTimeout(() => {
        frame = requestAnimationFrame((now) => {
          paint(now);
          loop();
        });
      }, 1000 / painter.fps);
    };
    if (moving) loop();
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        size();
        paint(performance.now());
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [kind, colors, moving]);
  return <canvas ref={ref} className={`da-bd__canvas is-${kind}`} aria-hidden="true" />;
}

/** The person's picture: a blurred 32 px placeholder first, then the full (or phone) version. */
function Picture({ image, dim, blur }) {
  const [loaded, setLoaded] = useState(null);
  const phone = window.matchMedia?.('(max-width: 900px)').matches;
  const src = `/api/account/background/${image}/${phone ? 'mobile' : 'full'}`;
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setLoaded(src);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return (
    <>
      <div className="da-bd__ph" style={{ backgroundImage: `url(/api/account/background/${image}/placeholder)` }} />
      <div className={`da-bd__img${loaded === src ? ' is-loaded' : ''}`} style={{ backgroundImage: loaded === src ? `url(${src})` : undefined, filter: blur ? `blur(${blur}px)` : undefined }} />
      <div className="da-bd__veil" style={{ opacity: dim / 100 }} />
    </>
  );
}

export default function Backdrop({ theme, mode, custom, motion, policy, signedIn }) {
  const reduced = useReducedMotion();
  const kind = theme.kind === 'dynamic' ? theme.motion : theme.kind === 'custom' && custom?.image && signedIn ? 'image' : null;
  const canMove =
    kind && kind !== 'image'
      ? motionAllowed({
          reducedMotion: reduced,
          userMotion: motion,
          policyMotion: policy?.allowMotion !== false,
          cores: navigator.hardwareConcurrency,
          memory: navigator.deviceMemory,
          saveData: Boolean(navigator.connection?.saveData),
        })
      : false;
  const awake = useAwake(canMove);
  const moving = canMove && awake;

  useEffect(() => {
    const root = document.documentElement;
    if (kind) root.dataset.backdrop = kind;
    else delete root.dataset.backdrop;
    root.dataset.motion = moving ? 'on' : 'off';
    return () => {
      delete root.dataset.backdrop;
    };
  }, [kind, moving]);

  if (!kind) return null;
  const colors = theme.backdrop?.colors || [];
  const style = Object.fromEntries(colors.map((color, i) => [`--bd-c${i + 1}`, color]));
  style['--bd-opacity'] = theme.backdrop?.opacity ?? 1;
  return createPortal(
    <div className={`da-bd is-${kind}${canMove ? '' : ' is-still'}${canMove && !awake ? ' is-paused' : ''}`} style={style} aria-hidden="true" data-scheme={mode}>
      {kind !== 'image' && <LivingCanvas kind={kind} colors={colors} moving={moving} />}
      {kind === 'image' && <Picture image={custom.image} dim={custom.dim} blur={custom.blur} />}
    </div>,
    document.body
  );
}
