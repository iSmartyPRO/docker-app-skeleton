import { useId } from 'react';

/*
 * The assistant characters, drawn in SVG (viewBox 120 × 120) and animated with
 * CSS (assistant.css). Every character shares one face language so moods read
 * the same whatever the look:
 *
 *   idle       calm eyes, soft smile, slow hover, blinks
 *   happy      ^ ^ eyes, open smile, blush, a little hop
 *   wave       happy face + the right hand (paw, wing) waving
 *   think      eyes up and aside, flat mouth, "…" above the head
 *   surprised  round eyes, "o" mouth (picked up / dragged)
 *   sleepy     half-closed eyes, "z z" (after a long pause)
 *
 * Robots are whole figures: a head drawn in its own 120-unit box and placed at
 * 80 % on top of a shared body (torso, arms, legs, feet). `look` ({ x, y } in
 * −1…1) turns the eyes and slightly the head to the pointer.
 *
 * Colour: each character has one main colour (clothes, shell…). A person may
 * pick another one; it arrives as the CSS variable --rb-tint and `tone()`
 * derives lighter / darker shades from it, so every gradient follows.
 */

export const ROBOTS = [
  { id: 'pixel', accent: '#6366F1', group: 'robots' },
  { id: 'orbi', accent: '#0EA5E9', group: 'robots' },
  { id: 'kiko', accent: '#14B8A6', group: 'robots' },
  { id: 'classic', accent: '#EF4444', group: 'robots' },
  { id: 'pro', accent: '#2563EB', group: 'robots' },
  { id: 'boltik', accent: '#F97316', group: 'robots' },
  { id: 'builder', accent: '#EAB308', group: 'work' },
  { id: 'builder2', accent: '#65A30D', group: 'work' },
  { id: 'architect', accent: '#334155', group: 'work' },
  { id: 'girl', accent: '#EC4899', group: 'kids' },
  { id: 'boy', accent: '#0D9488', group: 'kids' },
  { id: 'ermek', accent: '#C8102E', group: 'kyrgyz' },
  { id: 'aichurok', accent: '#0D9488', group: 'kyrgyz' },
  { id: 'volt', accent: '#2563EB', group: 'heroes' },
  { id: 'nova', accent: '#2563EB', group: 'heroes' },
  { id: 'barsik', accent: '#0EA5E9', group: 'animals' },
  { id: 'ryzhik', accent: '#EA580C', group: 'animals' },
];

export const ROBOT_GROUPS = ['robots', 'work', 'kids', 'kyrgyz', 'heroes', 'animals'];
export const ROBOT_IDS = ROBOTS.map((robot) => robot.id);

/** Colours a person can give their character (null = as designed). */
export const TINTS = ['#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#EAB308', '#F97316', '#E11D48', '#EC4899', '#8B5CF6', '#475569'];

const show = (on) => ({ opacity: on ? 1 : 0 });

/** A colour that follows the person's tint when one is chosen: shade > 0 mixes white, < 0 black (in %). */
const tone = (tinted, base, shade = 0) => {
  if (!tinted) return base;
  if (!shade) return 'var(--rb-tint)';
  return `color-mix(in srgb, var(--rb-tint), ${shade > 0 ? 'white' : 'black'} ${Math.abs(shade)}%)`;
};

/** Linear gradient whose stops may be CSS colours (var(), color-mix()). */
function Grad({ id, stops, x2 = 0, y2 = 1 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([offset, color]) => (
        <stop key={offset} offset={offset} style={{ stopColor: color }} />
      ))}
    </linearGradient>
  );
}

function Glow({ id, sd = 1.6 }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={sd} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Eyes in four shapes cross-fading by mood; `cx` are the two eye centres. */
function Eyes({ mood, blink, cx, cy, color, glow, rx = 5.5, ry = 7.5, shine = true }) {
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
            {shine && <circle cx={rx * 0.35} cy={-ry * 0.45} r={rx * 0.32} fill="#fff" opacity="0.9" />}
          </g>
          <path className="rb-eye" style={show(happy)} d={`M ${-rx - 1} 2.5 Q 0 ${-ry - 1} ${rx + 1} 2.5`} fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" />
          <g className="rb-eye" style={show(wide)}>
            <circle r={rx + 1.6} fill={color} />
            {shine && <circle cx={1.6} cy={-2} r={2} fill="#fff" opacity="0.9" />}
          </g>
          <rect className="rb-eye" style={show(sleepy)} x={-rx} y="0" width={rx * 2} height="2.8" rx="1.4" fill={color} />
        </g>
      ))}
    </g>
  );
}

/** Mouth variants around (x, y). */
function Mouth({ mood, x, y, color, inner = '#FF8FA3', scale = 1 }) {
  const happy = mood === 'happy' || mood === 'wave';
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
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

function Cheeks({ y, left = 37, right = 83, color = '#FB7185', opacity = 0.55 }) {
  return (
    <g className="rb-cheeks">
      <ellipse cx={left} cy={y} rx="5" ry="3" fill={color} opacity={opacity} />
      <ellipse cx={right} cy={y} rx="5" ry="3" fill={color} opacity={opacity} />
    </g>
  );
}

/** A robot head drawn in its own 120 box, placed at 80 % on top of the body. */
function Head({ look, tilt = 4, children }) {
  return (
    <g transform="translate(12 1) scale(0.8)">
      <g className="rb-head" style={{ transform: `rotate(${look.x * tilt}deg)` }}>
        {children}
      </g>
    </g>
  );
}

function Face({ look, children, reach = 4 }) {
  return (
    <g className="rb-face" style={{ transform: `translate(${look.x * reach}px, ${look.y * 3}px)` }}>
      {children}
    </g>
  );
}

const TORSO = 'M 45 69 H 75 Q 82 69 82.5 76 L 80.5 94 Q 80 101.5 72.5 101.5 H 47.5 Q 40 101.5 39.5 94 L 37.5 76 Q 38 69 45 69 Z';
const DRESS = 'M 46 69 H 74 Q 80 69 80.6 75 L 86.5 103.5 Q 87 108 82 108 H 38 Q 33 108 33.5 103.5 L 39.4 75 Q 40 69 46 69 Z';

/**
 * The shared body: legs and feet, torso (or a dress), arms with hands. Colours
 * are CSS values (url(#…), var(), color-mix()); `chest` draws on the torso,
 * `behind` (a cape) goes under everything.
 */
function Body({ torso, stroke = 'none', arm, armStroke = 'none', hand, leg, foot, cuff, chest, behind, dress = false, segments = false }) {
  const armShape = (x) => (
    <>
      <rect x={x} y="72" width="9" height="20" rx="4.5" style={{ fill: arm }} stroke={armStroke} strokeWidth="1" />
      {segments && [78, 83, 88].map((y) => <path key={y} d={`M ${x + 1} ${y} H ${x + 8}`} stroke="rgba(15,23,42,0.25)" strokeWidth="1" />)}
      {cuff && <rect x={x - 0.3} y="88" width="9.6" height="3" rx="1.5" style={{ fill: cuff }} />}
      <circle cx={x + 4.5} cy="94.5" r="4.6" style={{ fill: hand || arm }} stroke={armStroke} strokeWidth="1" />
    </>
  );
  return (
    <g className="rb-body">
      {behind}
      {!dress && (
        <>
          <rect x="46.5" y="96" width="9" height="13" rx="4" style={{ fill: leg }} />
          <rect x="64.5" y="96" width="9" height="13" rx="4" style={{ fill: leg }} />
        </>
      )}
      <ellipse cx="50.5" cy="110.4" rx="7.6" ry="3.8" style={{ fill: foot }} />
      <ellipse cx="69.5" cy="110.4" rx="7.6" ry="3.8" style={{ fill: foot }} />
      <path d={dress ? DRESS : TORSO} style={{ fill: torso }} stroke={stroke} strokeWidth="1.2" />
      <path d="M 46 72 Q 52 70.5 58 71" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.35" fill="none" />
      {chest}
      <g className="rb-arm rb-arm--left">{armShape(28.5)}</g>
      <g className="rb-arm rb-arm--right">{armShape(82.5)}</g>
    </g>
  );
}

/** "Koshkor muyuz" (ram's horns) — the classic Kyrgyz ornament, centred on (x, y). */
function Muyuz({ x, y, scale = 1, color, width = 1.6 }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M 0 4 L 0 -1 M 0 -1 C -1 -6 -8 -7 -8 -2 C -8 1 -4 1.5 -4 -1 M 0 -1 C 1 -6 8 -7 8 -2 C 8 1 4 1.5 4 -1"
      fill="none"
      style={{ stroke: color }}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ── Robots ─────────────────────────────────────────────────────────────────

/** Pixel — the classic friendly bot: soft white head, night-blue visor, antenna light. */
function Pixel({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#E3E6FF']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#272C5C'], [1, '#11142E']]} />
        <Grad id={id('accent')} x2={1} stops={[[0, tone(t, '#818CF8', 30)], [1, tone(t, '#4F46E5', -10)]]} />
        <radialGradient id={id('bulb')}>
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <Glow id={id('glow')} />
      </defs>
      <Body
        torso={`url(#${id('shell')})`}
        stroke="#C7CBF5"
        arm={`url(#${id('accent')})`}
        hand="#EEF0FF"
        leg={`url(#${id('accent')})`}
        foot="#E3E6FF"
        chest={<circle className="rb-heart" cx="60" cy="84" r="4.6" style={{ fill: `url(#${id('accent')})` }} />}
      />
      <Head look={look}>
        <path d="M60 24 V12" stroke="#A5ABEF" strokeWidth="3" strokeLinecap="round" />
        <circle className="rb-bulb" cx="60" cy="10" r="5" fill={`url(#${id('bulb')})`} />
        <rect x="12" y="44" width="9" height="20" rx="4.5" style={{ fill: `url(#${id('accent')})` }} />
        <rect x="99" y="44" width="9" height="20" rx="4.5" style={{ fill: `url(#${id('accent')})` }} />
        <rect x="18" y="22" width="84" height="66" rx="27" fill={`url(#${id('shell')})`} stroke="#C7CBF5" strokeWidth="1.4" />
        <path d="M30 30 Q 44 25 58 27" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" fill="none" />
        <rect x="27" y="34" width="66" height="44" rx="19" fill={`url(#${id('visor')})`} />
        <Cheeks y={64} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={53} color="#67E8F9" glow={`url(#${id('glow')})`} />
          <Mouth mood={mood} x={60} y={66} color="#67E8F9" />
        </Face>
        <Extras x={84} y={14} color="#818CF8" />
      </Head>
    </>
  );
}

/** Orbi — a glossy floating orb with a wide face band and little hovering hands. */
function Orbi({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <radialGradient id={id('shell')} cx="0.35" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#EEF6FF" />
          <stop offset="1" stopColor="#C9DDF5" />
        </radialGradient>
        <Grad id={id('band')} stops={[[0, '#0F2338'], [1, '#06111E']]} />
        <Grad id={id('accent')} x2={1} stops={[[0, tone(t, '#38BDF8', 25)], [1, tone(t, '#0284C7', -10)]]} />
        <radialGradient id={id('thrust')}>
          <stop offset="0" style={{ stopColor: tone(t, '#7DD3FC', 40), stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: tone(t, '#7DD3FC', 40), stopOpacity: 0 }} />
        </radialGradient>
        <Glow id={id('glow')} sd={1.8} />
      </defs>
      <ellipse className="rb-thrust" cx="60" cy="109" rx="16" ry="6" fill={`url(#${id('thrust')})`} />
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
        <circle className="rb-bulb" cx="73" cy="14" r="3.4" style={{ fill: tone(t, '#38BDF8') }} />
        <ellipse cx="44" cy="30" rx="13" ry="6" fill="#fff" opacity="0.85" transform="rotate(-20 44 30)" />
        <rect x="26" y="40" width="68" height="38" rx="19" fill={`url(#${id('band')})`} />
        <rect x="26" y="40" width="68" height="38" rx="19" fill="none" stroke={`url(#${id('accent')})`} strokeWidth="1.6" opacity="0.7" />
        <Cheeks y={66} left={36} right={84} opacity={0.5} />
        <Face look={look} reach={5}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={56} color="#7DD3FC" glow={`url(#${id('glow')})`} rx={5.2} ry={7} />
          <Mouth mood={mood} x={60} y={67} color="#7DD3FC" />
        </Face>
        <path d="M 30 92 Q 60 104 90 92" stroke={`url(#${id('accent')})`} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
        <Extras x={86} y={20} color="#38BDF8" />
      </g>
    </>
  );
}

/** Kiko — a mint companion with headphones and a warm amber smile. */
function Kiko({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, tone(t, '#99F6E4', 55)], [1, tone(t, '#2DD4BF', 10)]]} />
        <Grad id={id('screen')} x2={1} stops={[[0, '#173B3A'], [1, '#0B2221']]} />
        <Grad id={id('phones')} x2={1} stops={[[0, '#FB923C'], [1, '#EA580C']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('shell')})`}
        stroke={tone(t, '#14B8A6', -10)}
        arm={`url(#${id('shell')})`}
        armStroke={tone(t, '#14B8A6', -10)}
        leg={`url(#${id('shell')})`}
        foot="#EA580C"
        chest={<path d="M 50 71 L 60 79 L 70 71" fill="none" stroke={`url(#${id('phones')})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      />
      <Head look={look}>
        <path d="M 24 50 Q 24 14 60 14 Q 96 14 96 50" fill="none" stroke={`url(#${id('phones')})`} strokeWidth="6" strokeLinecap="round" />
        <rect x="20" y="26" width="80" height="62" rx="24" fill={`url(#${id('shell')})`} style={{ stroke: tone(t, '#14B8A6', -10) }} strokeWidth="1.4" />
        <path d="M32 33 Q 44 28 56 30" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" fill="none" />
        <rect x="12" y="44" width="14" height="24" rx="7" fill={`url(#${id('phones')})`} />
        <rect x="94" y="44" width="14" height="24" rx="7" fill={`url(#${id('phones')})`} />
        <rect x="29" y="37" width="62" height="42" rx="17" fill={`url(#${id('screen')})`} />
        <Cheeks y={66} left={38} right={82} color="#FDA4AF" />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={55} color="#FCD34D" glow={`url(#${id('glow')})`} rx={5} ry={6.8} />
          <Mouth mood={mood} x={60} y={67} color="#FCD34D" inner="#FB923C" />
        </Face>
        <Extras x={84} y={16} color="#14B8A6" />
      </Head>
    </>
  );
}

/** Classic — a retro tin robot: square silver head, spring antenna, a control panel with a gauge. */
function Classic({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('tin')} stops={[[0, '#F8FAFC'], [0.55, '#CBD5E1'], [1, '#94A3B8']]} />
        <Grad id={id('plate')} x2={1} stops={[[0, '#1F2937'], [1, '#0B1220']]} />
        <Grad id={id('accent')} x2={1} stops={[[0, tone(t, '#F87171', 25)], [1, tone(t, '#DC2626', -10)]]} />
        <Glow id={id('glow')} sd={1.4} />
      </defs>
      <Body
        torso={`url(#${id('tin')})`}
        stroke="#64748B"
        arm={`url(#${id('tin')})`}
        armStroke="#64748B"
        hand="#94A3B8"
        leg="#94A3B8"
        foot="#334155"
        segments
        chest={
          <>
            <rect x="47" y="74" width="26" height="19" rx="4" fill={`url(#${id('plate')})`} />
            <path d="M 52 86 A 6 6 0 0 1 64 86" fill="none" stroke="#475569" strokeWidth="1.4" />
            <g transform="translate(58 86)">
              <path className="rb-gauge" d="M 0 0 L 0 -5" stroke="#FDE047" strokeWidth="1.6" strokeLinecap="round" />
            </g>
            <circle cx="68" cy="79" r="2.2" className="rb-blinker" style={{ fill: `url(#${id('accent')})` }} />
            <circle cx="68" cy="86" r="2.2" fill="#22C55E" />
            <circle cx="60" cy="97" r="1.5" fill="#64748B" />
          </>
        }
      />
      <Head look={look} tilt={3}>
        <path d="M60 22 l-4 -2 l8 -3 l-8 -3 l8 -3 l-4 -2" fill="none" stroke="#64748B" strokeWidth="2" strokeLinejoin="round" />
        <circle className="rb-bulb" cx="60" cy="6" r="4.6" style={{ fill: `url(#${id('accent')})` }} />
        <rect x="6" y="44" width="11" height="22" rx="3" fill="#64748B" />
        <rect x="103" y="44" width="11" height="22" rx="3" fill="#64748B" />
        <rect x="9" y="50" width="5" height="10" rx="1.5" style={{ fill: `url(#${id('accent')})` }} />
        <rect x="106" y="50" width="5" height="10" rx="1.5" style={{ fill: `url(#${id('accent')})` }} />
        <rect x="16" y="22" width="88" height="64" rx="13" fill={`url(#${id('tin')})`} stroke="#64748B" strokeWidth="1.4" />
        {[[23, 29], [97, 29], [23, 79], [97, 79]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#94A3B8" stroke="#64748B" strokeWidth="0.6" />)}
        <rect x="27" y="34" width="66" height="42" rx="11" fill={`url(#${id('plate')})`} />
        <Cheeks y={64} opacity={0.45} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={52} color="#FDE047" glow={`url(#${id('glow')})`} rx={6.2} ry={6.2} />
          <Mouth mood={mood} x={60} y={65} color="#FDE047" />
        </Face>
        <Extras x={86} y={14} color="#64748B" />
      </Head>
    </>
  );
}

/** Pro — a calm professional in a dark suit and a tie, graphite head with steady eyes. */
function Pro({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('head')} stops={[[0, '#94A3B8'], [0.45, '#64748B'], [1, '#334155']]} />
        <Grad id={id('suit')} stops={[[0, '#283548'], [1, '#0F172A']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#0B1220'], [1, '#020617']]} />
        <Grad id={id('tie')} stops={[[0, tone(t, '#3B82F6', 10)], [1, tone(t, '#1D4ED8', -15)]]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('suit')})`}
        arm={`url(#${id('suit')})`}
        hand="#CBD5E1"
        cuff="#F8FAFC"
        leg="#0F172A"
        foot="#020617"
        chest={
          <>
            <path d="M 51 69 L 60 85 L 69 69 Z" fill="#F8FAFC" />
            <path d="M 49 69 L 60 87 L 54 92 L 44 72 Z" fill="#334155" />
            <path d="M 71 69 L 60 87 L 66 92 L 76 72 Z" fill="#334155" />
            <path d="M 57.6 70 H 62.4 L 63.6 74 L 61.6 76 L 63 88 L 60 91.5 L 57 88 L 58.4 76 L 56.4 74 Z" fill={`url(#${id('tie')})`} />
            <path d="M 70 79 L 76 78 L 75 81.5 Z" style={{ fill: tone(t, '#60A5FA', 25) }} />
            <circle cx="60" cy="96" r="1.3" fill="#475569" />
          </>
        }
      />
      <Head look={look} tilt={3}>
        <rect x="18" y="24" width="84" height="62" rx="24" fill={`url(#${id('head')})`} stroke="#1E293B" strokeWidth="1.4" />
        <path d="M30 31 Q 44 26 58 28" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" fill="none" />
        <rect x="102" y="46" width="6" height="16" rx="3" fill="#0F172A" />
        <circle cx="105" cy="50" r="1.4" className="rb-blinker" style={{ fill: tone(t, '#3B82F6', 20) }} />
        <rect x="27" y="36" width="66" height="40" rx="16" fill={`url(#${id('visor')})`} />
        <Face look={look}>
          <path d="M 41 45 L 53 43.6 M 67 43.6 L 79 45" stroke="#BAE6FD" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={56} color="#E0F2FE" glow={`url(#${id('glow')})`} rx={5.2} ry={6.4} />
          <Mouth mood={mood} x={60} y={67} color="#E0F2FE" />
        </Face>
        <Cheeks y={66} opacity={0.35} />
        <Extras x={86} y={16} color="#64748B" />
      </Head>
    </>
  );
}

/** Boltik — the chatty one: warm shell, a headset with a mic, a speech bubble on the antenna. */
function Boltik({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, tone(t, '#FED7AA', 55)], [1, tone(t, '#FB923C', 0)]]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#2A1B14'], [1, '#140C08']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('shell')})`}
        stroke={tone(t, '#EA580C', -15)}
        arm={`url(#${id('shell')})`}
        armStroke={tone(t, '#EA580C', -15)}
        hand="#FFF7ED"
        leg="#F8FAFC"
        foot="#FFFFFF"
        chest={
          <>
            <path d="M 50 76 h 20 a 4 4 0 0 1 4 4 v 7 a 4 4 0 0 1 -4 4 h -12 l -5 4 v -4 h -3 a 4 4 0 0 1 -4 -4 v -7 a 4 4 0 0 1 4 -4 Z" fill="#FFFFFF" opacity="0.95" />
            {[55, 60, 65].map((x, i) => <circle key={x} className="rb-chatdot" style={{ animationDelay: `${i * 0.18}s`, fill: tone(t, '#F97316') }} cx={x} cy="83.5" r="1.7" />)}
          </>
        }
      />
      <Head look={look}>
        <path d="M 22 56 Q 22 18 60 18 Q 98 18 98 56" fill="none" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M60 26 V16" style={{ stroke: tone(t, '#FB923C', -10) }} strokeWidth="2.6" strokeLinecap="round" />
        <g className="rb-bubble">
          <path d="M 47 1 h 26 a 5 5 0 0 1 5 5 v 6 a 5 5 0 0 1 -5 5 h -10 l -3 4 l -3 -4 h -10 a 5 5 0 0 1 -5 -5 v -6 a 5 5 0 0 1 5 -5 Z" fill="#FFFFFF" style={{ stroke: tone(t, '#FDBA74', 20) }} strokeWidth="1.2" />
          {[53, 60, 67].map((x, i) => <circle key={x} className="rb-chatdot" style={{ animationDelay: `${i * 0.18}s`, fill: tone(t, '#F97316') }} cx={x} cy="9" r="2" />)}
        </g>
        <rect x="18" y="26" width="84" height="62" rx="28" fill={`url(#${id('shell')})`} style={{ stroke: tone(t, '#EA580C', -15) }} strokeWidth="1.4" />
        <path d="M31 33 Q 44 28 57 30" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" fill="none" />
        <rect x="11" y="45" width="12" height="22" rx="6" fill="#334155" />
        <rect x="97" y="45" width="12" height="22" rx="6" fill="#334155" />
        <path d="M 17 66 Q 20 82 38 82" fill="none" stroke="#334155" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="40" cy="82" r="3.2" fill="#475569" />
        <rect x="28" y="38" width="64" height="40" rx="18" fill={`url(#${id('visor')})`} />
        <Cheeks y={66} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={55} color="#A5F3FC" glow={`url(#${id('glow')})`} rx={5.6} ry={7} />
          <Mouth mood={mood} x={60} y={67} color="#A5F3FC" />
        </Face>
        <Extras x={88} y={24} color="#F97316" />
      </Head>
    </>
  );
}

/** Ermek — a young man in a white ak-kalpak with black brims and a tassel, red chapan with a gold ornament. */
function Ermek({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFDF8'], [1, '#F1E6D6']]} />
        <Grad id={id('felt')} x2={1} stops={[[0, '#FFFFFF'], [1, '#E7E2D8']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#2A1D1A'], [1, '#140D0B']]} />
        <Grad id={id('chapan')} stops={[[0, tone(t, '#E11D48', 10)], [1, tone(t, '#9F1239', -20)]]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('chapan')})`}
        arm={`url(#${id('chapan')})`}
        hand="#F1E6D6"
        cuff="#FCD34D"
        leg="#4A2E22"
        foot="#2B1A12"
        chest={
          <>
            <path d="M 52 69 L 60 82 L 68 69" fill="none" stroke="#FCD34D" strokeWidth="2" strokeLinejoin="round" />
            <path d="M 60 82 V 101" stroke="#FCD34D" strokeWidth="1.4" />
            <Muyuz x={60} y={92} scale={0.55} color="#FCD34D" width={2.4} />
            <rect x="39.5" y="93" width="41" height="3.2" rx="1.6" fill="#7C2D12" />
          </>
        }
      />
      <Head look={look}>
        <rect x="13" y="50" width="8" height="18" rx="4" style={{ fill: tone(t, '#C8102E') }} />
        <rect x="99" y="50" width="8" height="18" rx="4" style={{ fill: tone(t, '#C8102E') }} />
        <rect x="19" y="32" width="82" height="58" rx="25" fill={`url(#${id('shell')})`} stroke="#E2D3BE" strokeWidth="1.4" />
        <rect x="28" y="44" width="64" height="38" rx="17" fill={`url(#${id('visor')})`} />
        <Cheeks y={70} left={38} right={82} opacity={0.6} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={60} color="#FCD34D" glow={`url(#${id('glow')})`} rx={5} ry={6.6} />
          <Mouth mood={mood} x={60} y={71} color="#FCD34D" inner="#FB7185" />
        </Face>
        {/* Ak-kalpak: a tall white felt hat, black brims turned up and split at the front. */}
        <path d="M 24 40 C 26 20 44 4 60 3 C 76 4 94 20 96 40 Z" fill={`url(#${id('felt')})`} stroke="#D6CFC2" strokeWidth="1.2" />
        <path d="M 40 30 C 46 22 52 18 60 16 C 68 18 74 22 80 30" fill="none" stroke="#1F1F1F" strokeWidth="1.6" strokeLinecap="round" />
        <Muyuz x={60} y={27} scale={0.7} color="#1F1F1F" width={2} />
        <path d="M 22 41 Q 22 33 30 32 L 57 34 L 58 42 Z" fill="#111111" />
        <path d="M 98 41 Q 98 33 90 32 L 63 34 L 62 42 Z" fill="#111111" />
        <path d="M 26 36 Q 40 33 55 36" fill="none" stroke="#FCD34D" strokeWidth="1" opacity="0.8" />
        <path d="M 94 36 Q 80 33 65 36" fill="none" stroke="#FCD34D" strokeWidth="1" opacity="0.8" />
        <g className="rb-tassel">
          <path d="M 60 4 Q 61 -1 64 -3" fill="none" stroke="#1F1F1F" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="65" cy="-3.5" r="2.6" style={{ fill: tone(t, '#C8102E') }} />
        </g>
        <Extras x={86} y={14} color="#C8102E" />
      </Head>
    </>
  );
}

/** One braid with a silver chach uchtuk at the end; side −1 left, 1 right. */
function Braid({ side }) {
  const x = side < 0 ? 22 : 98;
  return (
    <g className={`rb-braid rb-braid--${side < 0 ? 'left' : 'right'}`}>
      {[62, 70, 78, 86, 94].map((y, i) => (
        <ellipse key={y} cx={x + side * (i % 2 ? 1 : 0)} cy={y} rx="4.2" ry="5" fill={i % 2 ? '#3B2420' : '#4A2E28'} />
      ))}
      <rect x={x - 2} y="98" width="4" height="3" rx="1" fill="#C0C7D1" />
      <circle cx={x} cy="104.5" r="3.6" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="0.8" />
      <circle cx={x} cy="104.5" r="1.3" fill="#0D9488" />
      <path d={`M ${x - 2} 108 L ${x - 2.5} 112 M ${x} 108 L ${x} 113 M ${x + 2} 108 L ${x + 2.5} 112`} stroke="#C0C7D1" strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

/** Aichurok — a girl in a red velvet topu with an owl-feather (үкү) plume, braids with silver chach uchtuk, a turquoise dress. */
function Aichurok({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#FBE7EC']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#2B1630'], [1, '#170B1A']]} />
        <Grad id={id('velvet')} stops={[[0, '#E11D48'], [1, '#881337']]} />
        <Grad id={id('dress')} stops={[[0, tone(t, '#2DD4BF', 15)], [1, tone(t, '#0F766E', -15)]]} />
        <Grad id={id('feather')} stops={[[0, '#FFFFFF'], [1, '#9CA3AF']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        dress
        torso={`url(#${id('dress')})`}
        arm="#FBE7EC"
        armStroke="#F3C6D2"
        hand="#FFF1F4"
        cuff="#FCD34D"
        foot="#881337"
        chest={
          <>
            <path d="M 54 69 V 107 M 66 69 V 107" stroke="#FCD34D" strokeWidth="1.3" />
            <Muyuz x={60} y={80} scale={0.5} color="#FDE68A" width={2.4} />
            <path d="M 35 102 Q 60 99 85 102" fill="none" stroke="#FCD34D" strokeWidth="1.4" />
            <Muyuz x={46} y={104.5} scale={0.32} color="#FDE68A" width={2.6} />
            <Muyuz x={74} y={104.5} scale={0.32} color="#FDE68A" width={2.6} />
          </>
        }
      />
      <Head look={look}>
        <Braid side={-1} />
        <Braid side={1} />
        <rect x="20" y="30" width="80" height="60" rx="26" fill={`url(#${id('shell')})`} stroke="#F3C6D2" strokeWidth="1.4" />
        <rect x="29" y="43" width="62" height="38" rx="17" fill={`url(#${id('visor')})`} />
        <Cheeks y={69} left={38} right={82} opacity={0.7} />
        <Face look={look}>
          <g stroke="#5EEAD4" strokeWidth="1.6" strokeLinecap="round">
            <path d="M 42 51 L 40 48.5 M 45 50 L 44.5 47" />
            <path d="M 78 51 L 80 48.5 M 75 50 L 75.5 47" />
          </g>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={59} color="#5EEAD4" glow={`url(#${id('glow')})`} rx={5} ry={6.8} />
          <Mouth mood={mood} x={60} y={70} color="#5EEAD4" inner="#FB7185" />
        </Face>
        {/* Topu: a round red velvet cap with a gold band and an owl-feather plume. */}
        <g className="rb-plume">
          <path d="M 60 14 C 54 4 55 -6 59 -10 C 62 -4 63 6 60 14 Z" fill={`url(#${id('feather')})`} stroke="#D1D5DB" strokeWidth="0.6" />
          <path d="M 59 14 C 50 8 47 0 49 -5 C 54 0 57 7 59 14 Z" fill={`url(#${id('feather')})`} stroke="#D1D5DB" strokeWidth="0.6" />
          <path d="M 61 14 C 70 8 73 0 71 -5 C 66 0 63 7 61 14 Z" fill={`url(#${id('feather')})`} stroke="#D1D5DB" strokeWidth="0.6" />
        </g>
        <path d="M 28 38 C 30 20 44 12 60 12 C 76 12 90 20 92 38 Z" fill={`url(#${id('velvet')})`} />
        <path d="M 26 39 Q 60 30 94 39 L 94 43 Q 60 34 26 43 Z" fill="#FCD34D" />
        {[36, 48, 60, 72, 84].map((x) => (
          <circle key={x} cx={x} cy={37.6 - (x === 60 ? 1.6 : x === 48 || x === 72 ? 1.2 : 0)} r="1.3" fill="#B45309" />
        ))}
        <Muyuz x={60} y={25} scale={0.65} color="#FCD34D" width={2} />
        <path d="M 38 22 Q 46 16 54 15" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <Extras x={86} y={16} color="#0D9488" />
      </Head>
    </>
  );
}

// ── Animals ────────────────────────────────────────────────────────────────

/** A snow-leopard rosette (small broken ring). */
const Rosette = ({ x, y, r = 3.2, rotate = 0 }) => (
  <path transform={`translate(${x} ${y}) rotate(${rotate})`} d={`M ${-r} 0 A ${r} ${r} 0 1 1 ${r * 0.6} ${r * 0.8}`} fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
);

/** Barsik — a snow-leopard cub (ирбис, the symbol of the mountains) with a long fluffy tail and a scarf. */
function Barsik({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('fur')} stops={[[0, '#FFFFFF'], [1, '#D6DAE0']]} />
        <Grad id={id('scarf')} x2={1} stops={[[0, tone(t, '#38BDF8', 15)], [1, tone(t, '#0284C7', -15)]]} />
      </defs>
      <g className="rb-tail">
        <path d="M 76 104 C 96 106 106 92 100 76 C 97 68 102 60 108 60" fill="none" stroke="#E5E7EB" strokeWidth="10" strokeLinecap="round" />
        <path d="M 76 104 C 96 106 106 92 100 76 C 97 68 102 60 108 60" fill="none" stroke="#6B7280" strokeWidth="10" strokeLinecap="round" strokeDasharray="2.6 8" opacity="0.7" />
      </g>
      <g className="rb-body">
        <path d="M 39 106 Q 34 82 47 71 H 73 Q 86 82 81 106 Q 60 112 39 106 Z" fill={`url(#${id('fur')})`} stroke="#CBD2DA" strokeWidth="1" />
        <ellipse cx="60" cy="93" rx="11" ry="11" fill="#FFFFFF" />
        <Rosette x={44} y={88} rotate={20} />
        <Rosette x={76} y={86} rotate={-30} />
        <Rosette x={47} y={99} r={2.6} rotate={70} />
        <Rosette x={73} y={99} r={2.6} rotate={-80} />
        <ellipse cx="44" cy="107" rx="9" ry="4.6" fill="#F3F4F6" stroke="#CBD2DA" strokeWidth="1" />
        <ellipse cx="76" cy="107" rx="9" ry="4.6" fill="#F3F4F6" stroke="#CBD2DA" strokeWidth="1" />
        <g className="rb-arm rb-arm--left">
          <rect x="45" y="84" width="9" height="20" rx="4.5" fill={`url(#${id('fur')})`} stroke="#CBD2DA" strokeWidth="1" />
          <path d="M 47.5 101 V 103.5 M 50.5 101 V 103.5" stroke="#9CA3AF" strokeWidth="0.9" strokeLinecap="round" />
        </g>
        <g className="rb-arm rb-arm--right">
          <rect x="66" y="84" width="9" height="20" rx="4.5" fill={`url(#${id('fur')})`} stroke="#CBD2DA" strokeWidth="1" />
          <path d="M 68.5 101 V 103.5 M 71.5 101 V 103.5" stroke="#9CA3AF" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      </g>
      <g className="rb-head" style={{ transform: `rotate(${look.x * 5}deg)` }}>
        <circle cx="33" cy="22" r="10" fill="#4B5563" />
        <circle cx="87" cy="22" r="10" fill="#4B5563" />
        <circle cx="34" cy="23" r="7.5" fill={`url(#${id('fur')})`} />
        <circle cx="86" cy="23" r="7.5" fill={`url(#${id('fur')})`} />
        <circle cx="34.5" cy="24" r="3.8" fill="#FBCFE8" />
        <circle cx="85.5" cy="24" r="3.8" fill="#FBCFE8" />
        <ellipse cx="60" cy="45" rx="34" ry="29" fill={`url(#${id('fur')})`} stroke="#CBD2DA" strokeWidth="1" />
        <Rosette x={46} y={25} rotate={10} />
        <Rosette x={74} y={25} rotate={-20} />
        <Rosette x={60} y={20} r={2.4} rotate={90} />
        <Rosette x={30} y={46} r={2.6} rotate={60} />
        <Rosette x={90} y={46} r={2.6} rotate={-60} />
        <ellipse cx="60" cy="58" rx="14" ry="10" fill="#FFFFFF" />
        <Cheeks y={56} left={38} right={82} color="#F9A8D4" opacity={0.7} />
        <Face look={look} reach={3}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={43} color="#334155" rx={5} ry={6.2} />
          <path d="M 56.5 52 Q 60 50.5 63.5 52 L 60 55.6 Z" fill="#F472B6" />
          <Mouth mood={mood} x={60} y={58} color="#6B7280" scale={0.7} />
          <g stroke="#9CA3AF" strokeWidth="0.9" strokeLinecap="round">
            <path d="M 46 56 L 36 54 M 46 59 L 36 60" />
            <path d="M 74 56 L 84 54 M 74 59 L 84 60" />
          </g>
        </Face>
        <path d="M 37 69 Q 60 79 83 69 L 83 75 Q 60 85 37 75 Z" fill={`url(#${id('scarf')})`} />
        <path d="M 72 76 L 78 90 L 72 89 L 68 78 Z" fill={`url(#${id('scarf')})`} />
        <Extras x={88} y={12} color="#64748B" />
      </g>
    </>
  );
}

// ── Superheroes ────────────────────────────────────────────────────────────

/** The hero's shield: a gold diamond-pentagon with a red "S", centred on x 60. */
function SShield({ y = 73, scale = 1 }) {
  return (
    <g transform={`translate(60 ${y}) scale(${scale})`}>
      <path d="M -12 0 H 12 L 15.5 4.6 L 0 21 L -15.5 4.6 Z" fill="#FACC15" stroke="#DC2626" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M 5.6 4 H -2.6 Q -6 4 -6 6.4 Q -6 8.6 -2.4 8.8 H 2.4 Q 6 9 6 11.3 Q 6 13.6 2.4 13.6 H -4.4" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** A big red cape flowing from the shoulders and fluttering (two layers in opposite phase). */
function HeroCape({ id }) {
  return (
    <g className="rb-cape">
      <path d="M 41 69 Q 27 88 20 113 Q 37 105 50 111 Q 62 104 74 111 Q 88 104 101 112 Q 94 88 79 69 Z" fill={`url(#${id})`} />
      <g className="rb-cape-fold">
        <path d="M 46 74 Q 40 92 37 109 M 60 76 Q 60 94 61 108 M 74 74 Q 82 92 88 109" fill="none" stroke="#7F1D1D" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
      </g>
    </g>
  );
}

/** An athletic hero body: broad shoulders, narrow waist, slim legs and boots; `girl` adds a skirt. */
function HeroBody({ uid, t, girl }) {
  const id = (name) => `${uid}-${name}`;
  const torso = girl
    ? 'M 42 70 H 78 Q 83 70 82.2 76 L 73.5 91 Q 72.4 94 68.4 94 H 51.6 Q 47.6 94 46.5 91 L 37.8 76 Q 37 70 42 70 Z'
    : 'M 38 69.5 H 82 Q 87.5 69.5 86.4 76 L 75.4 93 Q 74 96 70 96 H 50 Q 46 96 44.6 93 L 33.6 76 Q 32.5 69.5 38 69.5 Z';
  const arm = (x) => (
    <>
      <path d={`M ${x} 73 Q ${x + 4} 70 ${x + 8} 73 L ${x + 7.4} 90 Q ${x + 4} 92.5 ${x + 0.6} 90 Z`} style={{ fill: `url(#${id('suit')})` }} />
      {girl && <rect x={x + 0.3} y="86.5" width="7.4" height="3" rx="1.4" fill="#FACC15" />}
      <circle cx={x + 4} cy="93.5" r="4.2" fill={girl ? '#F1F5F9' : '#E2E8F0'} stroke="#CBD5E1" strokeWidth="0.8" />
    </>
  );
  return (
    <g className="rb-body">
      <HeroCape id={id('cape')} />
      {girl ? (
        <>
          <rect x="49.5" y="96" width="7" height="12" rx="3.2" fill="#E2E8F0" />
          <rect x="63.5" y="96" width="7" height="12" rx="3.2" fill="#E2E8F0" />
          <path d="M 48.6 101 H 57.4 V 109 Q 53 111 48.6 109 Z M 62.6 101 H 71.4 V 109 Q 67 111 62.6 109 Z" fill="#DC2626" />
        </>
      ) : (
        <>
          <rect x="48.5" y="94" width="8" height="15" rx="3.6" style={{ fill: `url(#${id('suit')})` }} />
          <rect x="63.5" y="94" width="8" height="15" rx="3.6" style={{ fill: `url(#${id('suit')})` }} />
          <path d="M 48 101 H 57 V 109.5 Q 52.5 111.5 48 109.5 Z M 63 101 H 72 V 109.5 Q 67.5 111.5 63 109.5 Z" fill="#DC2626" />
        </>
      )}
      <ellipse cx="52.5" cy="110.6" rx="6" ry="3.2" fill="#B91C1C" />
      <ellipse cx="67.5" cy="110.6" rx="6" ry="3.2" fill="#B91C1C" />
      <path d={torso} style={{ fill: `url(#${id('suit')})` }} />
      {/* Muscle lines: chest and a hint of abs. */}
      <path d={girl ? 'M 47 88 Q 60 91 73 88' : 'M 44 86 Q 60 90 76 86 M 56 90 V 94 M 64 90 V 94'} fill="none" stroke="#fff" strokeWidth="0.9" opacity="0.25" strokeLinecap="round" />
      <path d="M 44 72 Q 52 70 58 71" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.35" fill="none" />
      {girl ? (
        <>
          <path d="M 46 92.5 H 74 L 80.5 103.5 Q 60 108 39.5 103.5 Z" fill="#DC2626" />
          <path d="M 46 92.5 H 74 L 74.6 95 H 45.4 Z" fill="#FACC15" />
          <path d="M 50 97 L 47 103.5 M 60 97.5 V 105 M 70 97 L 73 103.5" stroke="#991B1B" strokeWidth="0.9" opacity="0.5" />
        </>
      ) : (
        <>
          <path d="M 45.5 91 H 74.5 L 74 97.5 Q 67 101 60 97.5 Q 53 101 46 97.5 Z" fill="#DC2626" />
          <rect x="45" y="90.4" width="30" height="3.2" rx="1.6" fill="#FACC15" />
        </>
      )}
      <SShield y={girl ? 72.5 : 72} scale={girl ? 0.82 : 1} />
      <g className="rb-arm rb-arm--left">{arm(girl ? 31 : 27.5)}</g>
      <g className="rb-arm rb-arm--right">{arm(girl ? 81 : 84.5)}</g>
    </g>
  );
}

/** Superbot — the hero in blue with a red cape, the "S" shield and the famous forelock. */
function Volt({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('suit')} stops={[[0, tone(t, '#3B82F6', 10)], [1, tone(t, '#1E3A8A', -25)]]} />
        <Grad id={id('cape')} stops={[[0, '#EF4444'], [1, '#991B1B']]} />
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#DCE3EC']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#0F172A'], [1, '#020617']]} />
        <Glow id={id('glow')} sd={1.7} />
      </defs>
      <HeroBody uid={uid} t={t} />
      <Head look={look}>
        <rect x="20" y="24" width="80" height="64" rx="26" fill={`url(#${id('shell')})`} stroke="#CBD5E1" strokeWidth="1.4" />
        <path d="M 19 48 C 16 22 36 12 60 12 C 86 12 104 24 101 48 C 92 33 78 28 60 28 C 44 28 30 33 19 48 Z" fill="#111827" />
        <rect x="27" y="38" width="66" height="40" rx="17" fill={`url(#${id('visor')})`} />
        <path d="M 58 27 C 50 31 50 40 57 41 C 61 41.4 61 37 57.6 36.6" fill="none" stroke="#111827" strokeWidth="3.6" strokeLinecap="round" />
        <Cheeks y={68} opacity={0.45} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={57} color="#BFDBFE" glow={`url(#${id('glow')})`} rx={5.4} ry={6.8} />
          <Mouth mood={mood} x={60} y={68} color="#BFDBFE" />
        </Face>
        <Extras x={88} y={14} color="#2563EB" />
      </Head>
    </>
  );
}

/** Supergirl — blonde hair, blue top with the "S" shield, red skirt, boots and cape. */
function Nova({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('suit')} stops={[[0, tone(t, '#3B82F6', 10)], [1, tone(t, '#1E40AF', -20)]]} />
        <Grad id={id('cape')} stops={[[0, '#EF4444'], [1, '#991B1B']]} />
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#FCE7F3']]} />
        <Grad id={id('hair')} stops={[[0, '#FDE68A'], [1, '#EAB308']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#1E1B4B'], [1, '#0B0A24']]} />
        <Glow id={id('glow')} sd={1.6} />
      </defs>
      <HeroBody uid={uid} t={t} girl />
      <Head look={look}>
        <g className="rb-ponytail">
          <path d="M 22 40 C 8 62 10 92 22 106 C 26 96 26 82 30 70 Z" fill={`url(#${id('hair')})`} />
          <path d="M 98 40 C 112 62 110 92 98 106 C 94 96 94 82 90 70 Z" fill={`url(#${id('hair')})`} />
        </g>
        <path d="M 20 54 C 18 28 38 16 60 16 C 82 16 102 28 100 54 Z" fill={`url(#${id('hair')})`} />
        <rect x="21" y="30" width="78" height="60" rx="26" fill={`url(#${id('shell')})`} stroke="#F9A8D4" strokeWidth="1.4" />
        <path d="M 22 50 C 24 30 40 22 58 26 C 48 30 38 36 31 48 Z" fill={`url(#${id('hair')})`} />
        <path d="M 98 50 C 96 30 80 22 62 26 C 72 30 82 36 89 48 Z" fill={`url(#${id('hair')})`} />
        <rect x="29" y="43" width="62" height="38" rx="17" fill={`url(#${id('visor')})`} />
        <Cheeks y={70} left={38} right={82} opacity={0.65} />
        <Face look={look}>
          <g stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round">
            <path d="M 42 52 L 40 49.5 M 45 51 L 44.5 48" />
            <path d="M 78 52 L 80 49.5 M 75 51 L 75.5 48" />
          </g>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={60} color="#93C5FD" glow={`url(#${id('glow')})`} rx={5} ry={6.8} />
          <Mouth mood={mood} x={60} y={71} color="#93C5FD" inner="#FB7185" />
        </Face>
        <Extras x={88} y={18} color="#DC2626" />
      </Head>
    </>
  );
}

// ── Professions and kids ───────────────────────────────────────────────────

/** A hard hat: dome, ridge and brim; `color` is any CSS colour. */
function HardHat({ fill, ridge }) {
  return (
    <>
      <path d="M 22 40 C 22 16 40 6 60 6 C 80 6 98 16 98 40 Z" style={{ fill }} />
      <path d="M 54 7 H 66 V 39 H 54 Z" style={{ fill: ridge }} opacity="0.9" />
      <path d="M 14 41 Q 60 32 106 41 L 106 45 Q 60 37 14 45 Z" style={{ fill: ridge }} />
      <path d="M 30 22 Q 38 13 50 11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.5" />
    </>
  );
}

/** A hi-vis vest with silver reflective stripes over the torso. */
function Vest({ fill }) {
  return (
    <>
      <path d="M 39 72 Q 39 69 45 69 H 53 L 56 101.5 H 47.5 Q 40 101.5 39.5 94 Z" style={{ fill }} />
      <path d="M 81 72 Q 81 69 75 69 H 67 L 64 101.5 H 72.5 Q 80 101.5 80.5 94 Z" style={{ fill }} />
      <path d="M 39.6 84 H 54.8 V 87.4 H 40 Z M 65.2 84 H 80.4 L 80 87.4 H 65.2 Z" fill="#E2E8F0" />
      <path d="M 40 92 H 55.5 V 95.2 H 40.2 Z M 64.5 92 H 80 L 79.8 95.2 H 64.5 Z" fill="#E2E8F0" />
    </>
  );
}

/** Bob — a builder: yellow hard hat with a headlamp, orange hi-vis vest and a tool belt with a hammer. */
function Builder({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#E2E8F0']]} />
        <Grad id={id('hat')} stops={[[0, tone(t, '#FDE047', 25)], [1, tone(t, '#EAB308', -5)]]} />
        <Grad id={id('shirt')} stops={[[0, '#64748B'], [1, '#334155']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#1F2937'], [1, '#0B1220']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('shirt')})`}
        arm={`url(#${id('shirt')})`}
        hand="#D97706"
        leg="#1E3A5F"
        foot="#78350F"
        chest={
          <>
            <Vest fill="#F97316" />
            <rect x="39" y="96" width="42" height="4.6" rx="2" fill="#78350F" />
            <rect x="44" y="95.4" width="6" height="7" rx="1.2" fill="#92400E" />
            <g transform="translate(72 98) rotate(18)">
              <rect x="-1.2" y="0" width="2.4" height="10" rx="1" fill="#A16207" />
              <rect x="-4.4" y="-1.6" width="8.8" height="3.4" rx="1" fill="#475569" />
            </g>
          </>
        }
      />
      <Head look={look}>
        <rect x="19" y="32" width="82" height="58" rx="25" fill={`url(#${id('shell')})`} stroke="#CBD5E1" strokeWidth="1.4" />
        <rect x="28" y="46" width="64" height="36" rx="16" fill={`url(#${id('visor')})`} />
        <Cheeks y={72} left={38} right={82} opacity={0.55} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={61} color="#FDE68A" glow={`url(#${id('glow')})`} rx={5} ry={6.4} />
          <Mouth mood={mood} x={60} y={72} color="#FDE68A" />
        </Face>
        <HardHat fill={`url(#${id('hat')})`} ridge={tone(t, '#CA8A04', -15)} />
        <rect x="53" y="24" width="14" height="9" rx="3" fill="#334155" />
        <circle className="rb-blinker" cx="60" cy="28.5" r="3" fill="#FEF9C3" />
        <Extras x={88} y={12} color="#CA8A04" />
      </Head>
    </>
  );
}

/** Asel — a builder too: white hard hat, a braid, a green hi-vis vest and a tablet with plans. */
function Builder2({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#FCE7F3']]} />
        <Grad id={id('hat')} stops={[[0, '#FFFFFF'], [1, '#E2E8F0']]} />
        <Grad id={id('shirt')} stops={[[0, '#93C5FD'], [1, '#3B82F6']]} />
        <Grad id={id('vest')} stops={[[0, tone(t, '#A3E635', 15)], [1, tone(t, '#65A30D', -5)]]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#2B1630'], [1, '#170B1A']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('shirt')})`}
        arm={`url(#${id('shirt')})`}
        hand="#FBE7EC"
        leg="#1E3A5F"
        foot="#334155"
        chest={
          <>
            <Vest fill={`url(#${id('vest')})`} />
            <g transform="translate(60 85) rotate(-8)">
              <rect x="-7" y="-9" width="14" height="18" rx="2.4" fill="#0F172A" />
              <rect x="-5.6" y="-7.4" width="11.2" height="14.4" rx="1.2" fill="#38BDF8" />
              <path d="M -4 -4 H 4 M -4 -1 H 2 M -4 2 H 4" stroke="#E0F2FE" strokeWidth="1" />
            </g>
          </>
        }
      />
      <Head look={look}>
        <g className="rb-ponytail">
          <path d="M 92 50 C 106 56 108 76 102 92 C 100 98 94 98 96 92 C 100 78 98 64 88 58 Z" fill="#4A2E28" />
          {[66, 74, 82, 90].map((y) => <path key={y} d={`M 97 ${y} L 103 ${y + 2}`} stroke="#3B2420" strokeWidth="1.2" />)}
          <circle cx="98" cy="96" r="2.6" style={{ fill: tone(t, '#84CC16') }} />
        </g>
        <rect x="20" y="32" width="80" height="58" rx="25" fill={`url(#${id('shell')})`} stroke="#F3C6D2" strokeWidth="1.4" />
        <rect x="29" y="46" width="62" height="36" rx="16" fill={`url(#${id('visor')})`} />
        <Cheeks y={72} left={38} right={82} opacity={0.7} />
        <Face look={look}>
          <g stroke="#F9A8D4" strokeWidth="1.5" strokeLinecap="round">
            <path d="M 42 55 L 40 52.5 M 45 54 L 44.5 51" />
            <path d="M 78 55 L 80 52.5 M 75 54 L 75.5 51" />
          </g>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={62} color="#F9A8D4" glow={`url(#${id('glow')})`} rx={4.8} ry={6.4} />
          <Mouth mood={mood} x={60} y={73} color="#F9A8D4" inner="#FB7185" />
        </Face>
        <HardHat fill={`url(#${id('hat')})`} ridge="#CBD5E1" />
        <path d="M 46 22 H 74" stroke={tone(t, '#65A30D')} strokeWidth="3" strokeLinecap="round" />
        <Extras x={88} y={12} color="#65A30D" />
      </Head>
    </>
  );
}

/** Timur — an architect: round glasses, a pencil behind the ear, a turtleneck and a rolled blueprint. */
function Architect({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#E5E7EB']]} />
        <Grad id={id('knit')} stops={[[0, tone(t, '#334155', 10)], [1, tone(t, '#0F172A', -20)]]} />
        <Grad id={id('roll')} x2={1} stops={[[0, '#60A5FA'], [1, '#1D4ED8']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#111827'], [1, '#030712']]} />
        <Glow id={id('glow')} sd={1.4} />
      </defs>
      <Body
        torso={`url(#${id('knit')})`}
        arm={`url(#${id('knit')})`}
        hand="#E5E7EB"
        leg="#57534E"
        foot="#1C1917"
        chest={
          <>
            <path d="M 48 69 Q 60 75 72 69 V 72.5 Q 60 78.5 48 72.5 Z" fill="#000" opacity="0.18" />
            <g transform="translate(62 86) rotate(-34)">
              <rect x="-16" y="-3.6" width="32" height="7.2" rx="3.6" fill={`url(#${id('roll')})`} />
              <ellipse cx="16" cy="0" rx="2" ry="3.6" fill="#DBEAFE" />
              <path d="M -10 -1 H 8 M -8 1.6 H 4" stroke="#DBEAFE" strokeWidth="0.8" opacity="0.8" />
            </g>
          </>
        }
      />
      <Head look={look}>
        <g transform="translate(96 30) rotate(30)">
          <rect x="-2" y="-14" width="4" height="22" rx="1" fill="#FACC15" />
          <path d="M -2 8 L 0 13 L 2 8 Z" fill="#FDE68A" />
          <rect x="-2" y="-16" width="4" height="3" fill="#F472B6" />
        </g>
        <rect x="19" y="26" width="82" height="62" rx="26" fill={`url(#${id('shell')})`} stroke="#D1D5DB" strokeWidth="1.4" />
        <path d="M 22 46 C 22 26 40 18 60 18 C 82 18 98 28 98 44 C 88 34 76 30 60 30 C 44 30 30 36 22 46 Z" fill="#44403C" />
        <rect x="27" y="40" width="66" height="38" rx="16" fill={`url(#${id('visor')})`} />
        <Cheeks y={68} opacity={0.45} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[47, 73]} cy={58} color="#A7F3D0" glow={`url(#${id('glow')})`} rx={4.8} ry={6} />
          <g fill="none" stroke="#D4A017" strokeWidth="2.2">
            <circle cx="47" cy="58" r="10" />
            <circle cx="73" cy="58" r="10" />
            <path d="M 57 57 Q 60 55 63 57" />
          </g>
          <Mouth mood={mood} x={60} y={71} color="#A7F3D0" />
        </Face>
        <Extras x={86} y={14} color="#475569" />
      </Head>
    </>
  );
}

/** Ainura — a schoolgirl: two pigtails with bows, freckles, a dress with a white collar. */
function Girl({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  const bow = (x) => (
    <g transform={`translate(${x} 26)`}>
      <path d="M 0 0 L -9 -6 Q -11 0 -9 6 Z M 0 0 L 9 -6 Q 11 0 9 6 Z" style={{ fill: tone(t, '#EC4899') }} />
      <circle r="2.6" style={{ fill: tone(t, '#BE185D', -10) }} />
    </g>
  );
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#FFE4EC']]} />
        <Grad id={id('dress')} stops={[[0, tone(t, '#F472B6', 20)], [1, tone(t, '#DB2777', -10)]]} />
        <Grad id={id('hair')} stops={[[0, '#7C4A2D'], [1, '#4A2C1A']]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#3B1D33'], [1, '#1E0E1A']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        dress
        torso={`url(#${id('dress')})`}
        arm="#FFE4EC"
        armStroke="#F9C4D4"
        hand="#FFF1F5"
        foot="#BE185D"
        chest={
          <>
            <path d="M 48 69 Q 54 76 60 72 Q 66 76 72 69 Z" fill="#FFFFFF" />
            <circle cx="60" cy="80" r="1.4" fill="#FFFFFF" />
            <circle cx="60" cy="86" r="1.4" fill="#FFFFFF" />
            <path d="M 37 102 Q 60 99 83 102" fill="none" stroke="#FFFFFF" strokeWidth="1.4" opacity="0.8" />
          </>
        }
      />
      <Head look={look} tilt={5}>
        <g className="rb-ponytail">
          <path d="M 22 34 C 6 40 4 62 12 74 C 16 64 18 52 26 46 Z" fill={`url(#${id('hair')})`} />
        </g>
        <g className="rb-braid rb-braid--right">
          <path d="M 98 34 C 114 40 116 62 108 74 C 104 64 102 52 94 46 Z" fill={`url(#${id('hair')})`} />
        </g>
        <rect x="20" y="24" width="80" height="66" rx="31" fill={`url(#${id('shell')})`} stroke="#F9C4D4" strokeWidth="1.4" />
        <path d="M 21 52 C 18 26 40 16 60 16 C 80 16 102 26 99 52 C 92 40 84 34 74 32 C 66 38 52 38 44 32 C 36 34 28 40 21 52 Z" fill={`url(#${id('hair')})`} />
        {bow(22)}
        {bow(98)}
        <rect x="29" y="44" width="62" height="38" rx="18" fill={`url(#${id('visor')})`} />
        <g fill="#F9A8D4" opacity="0.7">
          {[[36, 72], [40, 75], [84, 72], [80, 75]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />)}
        </g>
        <Cheeks y={70} left={38} right={82} opacity={0.75} />
        <Face look={look}>
          <g stroke="#FBCFE8" strokeWidth="1.5" strokeLinecap="round">
            <path d="M 42 53 L 40 50.5 M 45 52 L 44.5 49" />
            <path d="M 78 53 L 80 50.5 M 75 52 L 75.5 49" />
          </g>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={61} color="#FBCFE8" glow={`url(#${id('glow')})`} rx={5.6} ry={7} />
          <Mouth mood={mood} x={60} y={72} color="#FBCFE8" inner="#FB7185" />
        </Face>
        <Extras x={86} y={14} color="#EC4899" />
      </Head>
    </>
  );
}

/** Daniyar — a schoolboy: a cap turned sideways, a T-shirt with a star, backpack straps, shorts and sneakers. */
function Boy({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('shell')} stops={[[0, '#FFFFFF'], [1, '#E0F2FE']]} />
        <Grad id={id('tee')} stops={[[0, tone(t, '#34D399', 20)], [1, tone(t, '#059669', -10)]]} />
        <Grad id={id('cap')} stops={[[0, tone(t, '#2DD4BF', 10)], [1, tone(t, '#0F766E', -15)]]} />
        <Grad id={id('visor')} x2={1} stops={[[0, '#0F2A2A'], [1, '#051515']]} />
        <Glow id={id('glow')} sd={1.5} />
      </defs>
      <Body
        torso={`url(#${id('tee')})`}
        arm="#E0F2FE"
        armStroke="#BAE6FD"
        hand="#F0F9FF"
        leg="#E0F2FE"
        foot="#FFFFFF"
        chest={
          <>
            <path d="M 46 69 V 101 M 74 69 V 101" stroke="#C2410C" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M 60 78 L 62.2 82.6 L 67.2 83 L 63.4 86.2 L 64.6 91 L 60 88.4 L 55.4 91 L 56.6 86.2 L 52.8 83 L 57.8 82.6 Z" fill="#FDE047" />
            <path d="M 40 96 H 80 L 79.6 101 Q 72 103 67 101 L 64 104 H 56 L 53 101 Q 48 103 40.4 101 Z" fill="#1E3A8A" />
            <path d="M 44.5 106.8 H 56.5 M 63.5 106.8 H 75.5" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" />
          </>
        }
      />
      <Head look={look} tilt={5}>
        <rect x="20" y="26" width="80" height="64" rx="30" fill={`url(#${id('shell')})`} stroke="#BAE6FD" strokeWidth="1.4" />
        <path d="M 24 46 C 24 22 42 14 60 14 C 80 14 96 24 96 44 Z" fill={`url(#${id('cap')})`} />
        <path d="M 58 15 L 62 15 L 61 44 L 59 44 Z" fill="#fff" opacity="0.35" />
        <path d="M 92 38 Q 112 36 116 46 Q 104 50 92 46 Z" fill={tone(t, '#0F766E', -20)} />
        <circle cx="60" cy="15" r="3" fill={tone(t, '#0F766E', -20)} />
        <rect x="29" y="44" width="62" height="38" rx="17" fill={`url(#${id('visor')})`} />
        <Cheeks y={70} left={38} right={82} opacity={0.6} />
        <Face look={look}>
          <Eyes mood={mood} blink={blink} cx={[48, 72]} cy={61} color="#99F6E4" glow={`url(#${id('glow')})`} rx={5.6} ry={7} />
          <Mouth mood={mood} x={60} y={72} color="#99F6E4" />
        </Face>
        <Extras x={86} y={12} color="#0D9488" />
      </Head>
    </>
  );
}

/** Ryzhik — a lively fox cub: a bouncing walk, perky ears and a fluffy tail that wags. */
function Ryzhik({ mood, blink, look, uid, t }) {
  const id = (name) => `${uid}-${name}`;
  return (
    <>
      <defs>
        <Grad id={id('fur')} stops={[[0, '#FDBA74'], [1, '#EA580C']]} />
        <Grad id={id('tail')} x2={1} stops={[[0, '#F97316'], [1, '#C2410C']]} />
        <Grad id={id('scarf')} x2={1} stops={[[0, tone(t, '#34D399', 10)], [1, tone(t, '#059669', -10)]]} />
      </defs>
      <g className="rb-tail rb-wag">
        <path d="M 74 100 C 92 104 108 92 106 74 C 105 64 98 60 94 64 C 98 74 92 88 74 92 Z" fill={`url(#${id('tail')})`} />
        <path d="M 106 74 C 105 64 98 60 94 64 C 97 67 98 72 98 76 C 101 76 104 76 106 74 Z" fill="#FFF7ED" />
      </g>
      <g className="rb-body">
        <path d="M 42 106 Q 38 84 48 72 H 72 Q 82 84 78 106 Q 60 111 42 106 Z" fill={`url(#${id('fur')})`} />
        <path d="M 52 74 Q 60 104 68 74 Q 60 78 52 74 Z" fill="#FFF7ED" />
        <ellipse cx="49" cy="108.5" rx="7" ry="3.6" fill="#1C1917" />
        <ellipse cx="71" cy="108.5" rx="7" ry="3.6" fill="#1C1917" />
        <g className="rb-arm rb-arm--left">
          <rect x="41" y="80" width="8" height="20" rx="4" fill={`url(#${id('fur')})`} />
          <rect x="41" y="94" width="8" height="7" rx="3.5" fill="#1C1917" />
        </g>
        <g className="rb-arm rb-arm--right">
          <rect x="71" y="80" width="8" height="20" rx="4" fill={`url(#${id('fur')})`} />
          <rect x="71" y="94" width="8" height="7" rx="3.5" fill="#1C1917" />
        </g>
      </g>
      <g className="rb-head" style={{ transform: `rotate(${look.x * 6}deg)` }}>
        <g className="rb-ear rb-ear--left">
          <path d="M 28 40 L 26 6 L 50 26 Z" fill={`url(#${id('fur')})`} />
          <path d="M 31 34 L 30 13 L 44 26 Z" fill="#FFEDD5" />
          <path d="M 26 6 L 29 14 L 34 12 Z" fill="#1C1917" />
        </g>
        <g className="rb-ear rb-ear--right">
          <path d="M 92 40 L 94 6 L 70 26 Z" fill={`url(#${id('fur')})`} />
          <path d="M 89 34 L 90 13 L 76 26 Z" fill="#FFEDD5" />
          <path d="M 94 6 L 91 14 L 86 12 Z" fill="#1C1917" />
        </g>
        <path d="M 24 40 Q 26 22 60 20 Q 94 22 96 40 Q 98 58 80 68 Q 70 74 60 74 Q 50 74 40 68 Q 22 58 24 40 Z" fill={`url(#${id('fur')})`} />
        <path d="M 30 50 Q 44 52 52 62 Q 58 70 60 72 Q 62 70 68 62 Q 76 52 90 50 Q 88 64 72 72 Q 66 75 60 75 Q 54 75 48 72 Q 32 64 30 50 Z" fill="#FFF7ED" />
        <Cheeks y={58} left={36} right={84} color="#FB7185" opacity={0.6} />
        <Face look={look} reach={3}>
          <Eyes mood={mood} blink={blink} cx={[46, 74]} cy={45} color="#1C1917" rx={4.8} ry={6} />
          <ellipse cx="60" cy="61" rx="4" ry="3" fill="#1C1917" />
          <Mouth mood={mood} x={60} y={66} color="#7C2D12" scale={0.6} />
        </Face>
        <path d="M 38 70 Q 60 80 82 70 L 82 76 Q 60 86 38 76 Z" fill={`url(#${id('scarf')})`} />
        <path d="M 46 77 L 40 90 L 47 89 L 51 79 Z" fill={`url(#${id('scarf')})`} />
        <Extras x={88} y={14} color="#EA580C" />
      </g>
    </>
  );
}

const DRAW = { pixel: Pixel, orbi: Orbi, kiko: Kiko, classic: Classic, pro: Pro, boltik: Boltik, builder: Builder, builder2: Builder2, architect: Architect, girl: Girl, boy: Boy, ermek: Ermek, aichurok: Aichurok, volt: Volt, nova: Nova, barsik: Barsik, ryzhik: Ryzhik };

/**
 * A character at `size` px with a mood; `still` turns idle motion off (pickers,
 * previews); `tint` (#rrggbb) recolours its main colour.
 */
export function Robot({ kind = 'pixel', mood = 'idle', blink = false, look = { x: 0, y: 0 }, size = 64, still = false, tint = null, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const Draw = DRAW[kind] || Pixel;
  return (
    <svg
      className={`rb rb--${kind} is-${mood}${still ? ' is-still' : ''} ${className}`.trim()}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={tint ? { '--rb-tint': tint } : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="rb-shadow" cx="60" cy="115.5" rx="26" ry="3.6" />
      <g className="rb-float">
        <Draw mood={mood} blink={blink} look={look} uid={uid} t={Boolean(tint)} />
      </g>
    </svg>
  );
}
