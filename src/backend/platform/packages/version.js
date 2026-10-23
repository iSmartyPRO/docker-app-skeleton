/* Versions of packages and of the core: plain x.y.z (spec §3.6: «X or newer», a new major is incompatible). */

const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export const isVersion = (value) => typeof value === 'string' && SEMVER.test(value);

/** Numeric parts of x.y.z (anything after a '-' or '+' is ignored: 1.2.3-dev → 1.2.3). */
export function parts(value) {
  return String(value || '0.0.0')
    .split(/[-+]/, 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
    .concat([0, 0, 0])
    .slice(0, 3);
}

export function compare(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

export const major = (value) => parts(value)[0];

/** `have` satisfies «`min` or newer, same first number». */
export const satisfies = (have, min) => major(have) === major(min) && compare(have, min) >= 0;

/** 1.4.2 → "1.4" (how the spec messages show versions of other modules). */
export const short = (value) => parts(value).slice(0, 2).join('.');

/** The next version for a bump: 'major' | 'minor' | 'patch'. */
export function bump(value, part) {
  const [a, b, c] = parts(value);
  if (part === 'major') return `${a + 1}.0.0`;
  if (part === 'minor') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}
