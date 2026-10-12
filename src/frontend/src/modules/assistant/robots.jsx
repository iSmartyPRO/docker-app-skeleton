import { useId } from 'react';

/*
 * The robot assistants, drawn in SVG (viewBox 120 × 120) and animated with
 * CSS (assistant.css). Every robot shares the same face language so moods read
 * the same whatever the look:
 *
 *   idle       calm pill eyes, soft smile, slow hover, blinks
 *   happy      ^ ^ eyes, open smile, blush, a little hop
 *   wave       happy face + the right hand waving
 *   think      eyes up and aside, flat mouth, "…" above the head
 *   surprised  round eyes, "o" mouth (picked up / dragged)
 *   sleepy     half-closed eyes, "z z" (after a long pause)
 *
 * `look` ({ x, y } in −1…1) turns the eyes and slightly the head to the pointer.
 */

export const ROBOTS = [
  { id: 'pixel', accent: '#6366F1' },
  { id: 'orbi', accent: '#0EA5E9' },
  { id: 'kiko', accent: '#14B8A6' },
];

const show = (on) => ({ opacity: on ? 1 : 0 });

/** Eyes in four shapes cross-fading by mood; `cx` are the two eye centres. */
function Eyes({ mood, blink, cx, cy, color, glow, rx = 5.5, ry = 7.5 }) {
  const happy = mood === 'happy' || mood === 'wave';
  const wide = mood === 'surprised';
  const sleepy = mood === 'sleepy';
  const open = !happy && !wide && !sleepy;
  return (
    <g className="rb-eyes" filter={glow}>
      {cx.map((x) => (
        <g key={x} transform={`translate(${x} ${cy})`}>
          <g className="rb-eye" style={{ ...show(open), transform: `scaleY(${blink ? 0.12 : 1})` }}>
            <rect x={-rx} y={-ry} width={rx * 2} height={ry * 2} rx={rx} fill={color} />
            <circle cx={rx * 0.35} cy={-ry * 0.45} r={rx * 0.32} fill="#fff" opacity="0.9" />
          </g>
          <path className="rb-eye" style={show(happy)} d={`M ${-rx - 1} 2.5 Q 0 ${-ry - 1} ${rx + 1} 2.5`} fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" />
          <g className="rb-eye" style={show(wide)}>
            <circle r={rx + 1.6} fill={color} />
            <circle cx={1.6} cy={-2} r={2} fill="#fff" opacity="0.9" />
          </g>
          <rect className="rb-eye" style={show(sleepy)} x={-rx} y="0" width={rx * 2} height="2.8" rx="1.4" fill={color} />
        </g>
      ))}
    </g>
  );
}

/** Mouth variants around (x, y). */
function Mouth({ mood, x, y, color, inner = '#FF8FA3' }) {
  const happy = mood === 'happy' || mood === 'wave';
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="rb-mouth" style={show(mood === 'idle')} d="M -7 0 Q 0 6 7 0" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <g className="rb-mouth" style={show(happy)}>
        <path d="M -9.5 -1.5 C -8.5 10.5 8.5 10.5 9.5 -1.5 Q 0 0.5 -9.5 -1.5 Z" fill={color} />
        <path d="M -5 5 Q 0 2.4 5 5 Q 0 8.8 -5 5 Z" fill={inner} />
      </g>
      <ellipse className="rb-mouth" style={show(mood === 'surprised')} cx="0" cy="2" rx="3.6" ry="4.4" fill={color} />
      <path className="rb-mouth" style={show(mood === 'think')} d="M -6 2 Q -2 0 2 2 T 7 1" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      <path className="rb-mouth" style={show(mood === 'sleepy')} d="M -4 1.5 L 4 1.5" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
    </g>
  );
}

/** "…" while thinking, "z z" while sleepy (above the head, right side). */
function Extras({ x, y, color }) {
  return (
    <>
      <g className="rb-think" transform={`translate(${x} ${y})`} fill={color}>
        <circle cx="0" cy="0" r="3" />
        <circle cx="9" cy="-3" r="3" />
        <circle cx="18" cy="-6" r="3" />
      </g>
      {/* The animated group sits inside a positioned one: a CSS transform would replace the SVG one. */}
      <g transform={`translate(${x + 4} ${y})`}>
        <g className="rb-zz" fill={color} fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="800">
          <text x="0" y="0" fontSize="11">z</text>
          <text x="9" y="-9" fontSize="8">z</text>
        </g>
      </g>
    </>
  );
}

/** Pixel — a classic friendly bot: soft white head, night-blue visor, antenna light. */
function Pixel({ mood, blink, look, uid }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <linearGradient id={id('shell')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E3E6FF" />
        </linearGradient>
        <linearGradient id={id('visor')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#272C5C" />
          <stop offset="1" stopColor="#11142E" />
        </linearGradient>
        <linearGradient id={id('accent')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <radialGradient id={id('bulb')}>
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="rb-body">
        <rect x="40" y="86" width="40" height="22" rx="11" fill={`url(#${id('shell')})`} stroke="#C7CBF5" strokeWidth="1.2" />
        <circle className="rb-heart" cx="60" cy="97" r="4.2" fill={`url(#${id('accent')})`} />
        <g className="rb-arm rb-arm--left">
          <rect x="29" y="88" width="10" height="16" rx="5" fill={`url(#${id('accent')})`} />
        </g>
        <g className="rb-arm rb-arm--right">
          <rect x="81" y="88" width="10" height="16" rx="5" fill={`url(#${id('accent')})`} />
        </g>
      </g>
      <g className="rb-head" style={{ transform: `rotate(${look.x * 4}deg)` }}>
        <g className="rb-antenna">
          <path d="M60 24 V12" stroke="#A5ABEF" strokeWidth="3" strokeLinecap="round" />
          <circle className="rb-bulb" cx="60" cy="10" r="5" fill={`url(#${id('bulb')})`} />
        </g>
        <rect x="12" y="44" width="9" height="20" rx="4.5" fill={`url(#${id('accent')})`} />
        <rect x="99" y="44" width="9" height="20" rx="4.5" fill={`url(#${id('accent')})`} />
        <rect x="18" y="22" width="84" height="66" rx="27" fill={`url(#${id('shell')})`} stroke="#C7CBF5" strokeWidth="1.4" />
        <path d="M30 30 Q 44 25 58 27" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" fill="none" />
        <rect x="27" y="34" width="66" height="44" rx="19" fill={`url(#${id('visor')})`} />
        <g className="rb-cheeks">
          <ellipse cx="37" cy="64" rx="5" ry="3" fill="#FB7185" opacity="0.55" />
          <ellipse cx="83" cy="64" rx="5" ry="3" fill="#FB7185" opacity="0.55" />
        </g>
        <g style={{ transform: `translate(${look.x * 4}px, ${look.y * 3}px)` }} className="rb-face">
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={53} color="#67E8F9" glow={`url(#${id('glow')})`} />
          <Mouth mood={mood} x={60} y={66} color="#67E8F9" />
        </g>
        <Extras x={84} y={14} color="#818CF8" />
      </g>
    </>
  );
}

/** Orbi — a glossy floating orb with a wide face band and little hovering hands. */
function Orbi({ mood, blink, look, uid }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <radialGradient id={id('shell')} cx="0.35" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#EEF6FF" />
          <stop offset="1" stopColor="#C9DDF5" />
        </radialGradient>
        <linearGradient id={id('band')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F2338" />
          <stop offset="1" stopColor="#06111E" />
        </linearGradient>
        <linearGradient id={id('accent')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#0284C7" />
        </linearGradient>
        <radialGradient id={id('thrust')}>
          <stop offset="0" stopColor="#7DD3FC" stopOpacity="0.9" />
          <stop offset="1" stopColor="#7DD3FC" stopOpacity="0" />
        </radialGradient>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse className="rb-thrust" cx="60" cy="108" rx="16" ry="6" fill={`url(#${id('thrust')})`} />
      <g className="rb-body">
        <g className="rb-arm rb-arm--left">
          <ellipse cx="17" cy="72" rx="7" ry="10" fill={`url(#${id('shell')})`} stroke="#B9CDE6" strokeWidth="1.2" />
        </g>
        <g className="rb-arm rb-arm--right">
          <ellipse cx="103" cy="72" rx="7" ry="10" fill={`url(#${id('shell')})`} stroke="#B9CDE6" strokeWidth="1.2" />
        </g>
      </g>
      <g className="rb-head" style={{ transform: `rotate(${look.x * 3}deg)` }}>
        <ellipse cx="60" cy="60" rx="39" ry="42" fill={`url(#${id('shell')})`} stroke="#B9CDE6" strokeWidth="1.4" />
        <path d="M 60 18 Q 66 12 72 14" stroke={`url(#${id('accent')})`} strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle className="rb-bulb" cx="73" cy="14" r="3.4" fill="#38BDF8" />
        <ellipse cx="44" cy="30" rx="13" ry="6" fill="#fff" opacity="0.85" transform="rotate(-20 44 30)" />
        <rect x="26" y="40" width="68" height="38" rx="19" fill={`url(#${id('band')})`} />
        <rect x="26" y="40" width="68" height="38" rx="19" fill="none" stroke={`url(#${id('accent')})`} strokeWidth="1.6" opacity="0.7" />
        <g className="rb-cheeks">
          <ellipse cx="36" cy="66" rx="4.5" ry="2.6" fill="#FB7185" opacity="0.5" />
          <ellipse cx="84" cy="66" rx="4.5" ry="2.6" fill="#FB7185" opacity="0.5" />
        </g>
        <g style={{ transform: `translate(${look.x * 5}px, ${look.y * 3}px)` }} className="rb-face">
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={56} color="#7DD3FC" glow={`url(#${id('glow')})`} rx={5.2} ry={7} />
          <Mouth mood={mood} x={60} y={67} color="#7DD3FC" />
        </g>
        <path d="M 30 92 Q 60 104 90 92" stroke={`url(#${id('accent')})`} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
        <Extras x={86} y={20} color="#38BDF8" />
      </g>
    </>
  );
}

/** Kiko — a mint companion with headphones and a warm amber smile. */
function Kiko({ mood, blink, look, uid }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <linearGradient id={id('shell')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#99F6E4" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
        <linearGradient id={id('screen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#173B3A" />
          <stop offset="1" stopColor="#0B2221" />
        </linearGradient>
        <linearGradient id={id('phones')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FB923C" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="rb-body">
        <path d="M 40 106 Q 40 88 60 88 Q 80 88 80 106 Z" fill={`url(#${id('shell')})`} stroke="#14B8A6" strokeWidth="1.2" />
        <path d="M 50 90 L 60 97 L 70 90" fill="none" stroke={`url(#${id('phones')})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <g className="rb-arm rb-arm--left">
          <rect x="30" y="90" width="9" height="15" rx="4.5" fill={`url(#${id('shell')})`} stroke="#14B8A6" strokeWidth="1.1" />
        </g>
        <g className="rb-arm rb-arm--right">
          <rect x="81" y="90" width="9" height="15" rx="4.5" fill={`url(#${id('shell')})`} stroke="#14B8A6" strokeWidth="1.1" />
        </g>
      </g>
      <g className="rb-head" style={{ transform: `rotate(${look.x * 4}deg)` }}>
        <path d="M 24 50 Q 24 14 60 14 Q 96 14 96 50" fill="none" stroke={`url(#${id('phones')})`} strokeWidth="6" strokeLinecap="round" />
        <rect x="20" y="26" width="80" height="62" rx="24" fill={`url(#${id('shell')})`} stroke="#14B8A6" strokeWidth="1.4" />
        <path d="M32 33 Q 44 28 56 30" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" fill="none" />
        <rect x="12" y="44" width="14" height="24" rx="7" fill={`url(#${id('phones')})`} />
        <rect x="94" y="44" width="14" height="24" rx="7" fill={`url(#${id('phones')})`} />
        <rect x="29" y="37" width="62" height="42" rx="17" fill={`url(#${id('screen')})`} />
        <g className="rb-cheeks">
          <ellipse cx="38" cy="66" rx="4.6" ry="2.7" fill="#FDA4AF" opacity="0.55" />
          <ellipse cx="82" cy="66" rx="4.6" ry="2.7" fill="#FDA4AF" opacity="0.55" />
        </g>
        <g style={{ transform: `translate(${look.x * 4}px, ${look.y * 3}px)` }} className="rb-face">
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={55} color="#FCD34D" glow={`url(#${id('glow')})`} rx={5} ry={6.8} />
          <Mouth mood={mood} x={60} y={67} color="#FCD34D" inner="#FB923C" />
        </g>
        <Extras x={84} y={16} color="#14B8A6" />
      </g>
    </>
  );
}

const DRAW = { pixel: Pixel, orbi: Orbi, kiko: Kiko };

/** A robot at `size` px with a mood; `still` turns idle motion off (pickers, previews). */
export function Robot({ kind = 'pixel', mood = 'idle', blink = false, look = { x: 0, y: 0 }, size = 64, still = false, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const Draw = DRAW[kind] || Pixel;
  return (
    <svg
      className={`rb rb--${kind} is-${mood}${still ? ' is-still' : ''} ${className}`.trim()}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="rb-shadow" cx="60" cy="114" rx="24" ry="4" />
      <g className="rb-float">
        <Draw mood={mood} blink={blink} look={look} uid={uid} />
      </g>
    </svg>
  );
}
