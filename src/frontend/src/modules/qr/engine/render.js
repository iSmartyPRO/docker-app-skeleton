/*
 * QR code → SVG with the module's design (docs/qr.md «Оформление»).
 *
 * Pure: takes the module matrix (from `qrcode`, see matrix.js) and a design,
 * returns markup. The same SVG is the preview, the .svg download and the
 * source of the PNG, so what people see is exactly what they get.
 *
 * Geometry is in units of U per module. The three finder patterns («eyes»)
 * are drawn apart from the data modules, with their own shapes and colours;
 * modules under the logo plate are cleared (with error correction H the code
 * still reads — the scan check confirms it for every design).
 */

export const U = 10;

export const DEFAULT_DESIGN = {
  dots: { style: 'rounded', color: '#0F172A', gradient: null },
  eyes: { frame: 'rounded', ball: 'rounded', frameColor: null, ballColor: null },
  background: { color: '#FFFFFF', transparent: false, radius: 0 },
  logo: { source: 'none', file: null, icon: null, size: 22, plate: 'rounded', plateColor: '#FFFFFF', padding: 10 },
  frame: { style: 'none', text: '', color: '#0F172A', textColor: '#FFFFFF' },
  margin: 3,
  ecl: 'auto',
};

const FONT = "Manrope, Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** A full design from a partial one (defaults below every group). */
export function mergeDesign(design = {}) {
  const d = design || {};
  return {
    dots: { ...DEFAULT_DESIGN.dots, ...(d.dots || {}) },
    eyes: { ...DEFAULT_DESIGN.eyes, ...(d.eyes || {}) },
    background: { ...DEFAULT_DESIGN.background, ...(d.background || {}) },
    logo: { ...DEFAULT_DESIGN.logo, ...(d.logo || {}) },
    frame: { ...DEFAULT_DESIGN.frame, ...(d.frame || {}) },
    margin: d.margin ?? DEFAULT_DESIGN.margin,
    ecl: d.ecl || DEFAULT_DESIGN.ecl,
  };
}

/** Error correction actually used: H under a logo, Q for short payloads, else M. */
export function effectiveEcl(design, text = '') {
  if (design.ecl && design.ecl !== 'auto') return design.ecl;
  if (design.logo?.source && design.logo.source !== 'none') return 'H';
  return text.length > 600 ? 'M' : 'Q';
}

const n = (value) => Math.round(value * 100) / 100;

const escapeXml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);

/** "@brand" → the brand colour. */
export function resolveColor(value, brand) {
  if (value === '@brand') return brand?.color || '#2563EB';
  return value || '#000000';
}

/* ── Colour checks ─────────────────────────────────────────────────────── */

function luminance(hex) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!value) return 1;
  const channels = [0, 2, 4].map((i) => parseInt(value[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* ── Shapes ────────────────────────────────────────────────────────────── */

/** Rectangle with its own radius per corner [tl, tr, br, bl], as a path. */
export function roundedRect(x, y, w, h, radii = [0, 0, 0, 0]) {
  const max = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(max, r)));
  let d = `M${n(x + tl)} ${n(y)}H${n(x + w - tr)}`;
  if (tr) d += `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}`;
  d += `V${n(y + h - br)}`;
  if (br) d += `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}`;
  d += `H${n(x + bl)}`;
  if (bl) d += `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}`;
  d += `V${n(y + tl)}`;
  if (tl) d += `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}`;
  return `${d}Z`;
}

function circle(cx, cy, r) {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

function diamond(cx, cy, r) {
  return `M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z`;
}

/* ── Data modules ──────────────────────────────────────────────────────── */

function dotsPath(matrix, style, skip) {
  const size = matrix.size;
  const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && matrix.get(x, y) && !skip(x, y);
  const r = U / 2;
  let d = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x * U;
      const py = y * U;
      if (!dark(x, y)) {
        // Liquid joins: the inside corner between two dark neighbours is filled with a fillet.
        if (style === 'fluid' && matrix.get(x, y) === 0 && !skip(x, y)) {
          if (dark(x - 1, y) && dark(x, y - 1)) d += `M${px} ${py}H${px + r}A${r} ${r} 0 0 0 ${px} ${py + r}Z`;
          if (dark(x + 1, y) && dark(x, y - 1)) d += `M${px + U} ${py}V${py + r}A${r} ${r} 0 0 0 ${px + r} ${py}Z`;
          if (dark(x + 1, y) && dark(x, y + 1)) d += `M${px + U} ${py + U}H${px + r}A${r} ${r} 0 0 0 ${px + U} ${py + r}Z`;
          if (dark(x - 1, y) && dark(x, y + 1)) d += `M${px} ${py + U}V${py + r}A${r} ${r} 0 0 0 ${px + r} ${py + U}Z`;
        }
        continue;
      }
      switch (style) {
        case 'dots':
          d += circle(px + r, py + r, U * 0.43);
          break;
        case 'diamond':
          d += diamond(px + r, py + r, U * 0.56);
          break;
        case 'square':
          d += `M${px} ${py}h${U}v${U}h${-U}Z`;
          break;
        default: {
          const top = dark(x, y - 1);
          const bottom = dark(x, y + 1);
          const left = dark(x - 1, y);
          const right = dark(x + 1, y);
          const round = (a, b) => (!a && !b ? r : 0);
          let radii = [round(top, left), round(top, right), round(bottom, right), round(bottom, left)];
          if (style === 'classy') radii = [radii[0], 0, radii[2], 0];
          d += roundedRect(px, py, U, U, radii);
        }
      }
    }
  }
  return d;
}

/* ── Eyes (finder patterns) ────────────────────────────────────────────── */

// Corner index (tl, tr, br, bl) that points out of the code for each eye.
const EYES = [
  { at: (size) => [0, 0], out: 0 },
  { at: (size) => [size - 7, 0], out: 1 },
  { at: (size) => [0, size - 7], out: 3 },
];

function cornerRadii(out, outward, center, rest) {
  const radii = [rest, rest, rest, rest];
  radii[out] = outward;
  radii[(out + 2) % 4] = center;
  return radii;
}

function eyeFrame(shape, x, y, out) {
  const s = 7 * U;
  const i = U;
  switch (shape) {
    case 'square':
      return roundedRect(x, y, s, s) + roundedRect(x + i, y + i, s - 2 * i, s - 2 * i);
    case 'circle':
      return circle(x + s / 2, y + s / 2, s / 2) + circle(x + s / 2, y + s / 2, s / 2 - i);
    case 'leaf':
      return roundedRect(x, y, s, s, cornerRadii(out, 2.5 * U, 2.5 * U, 0.3 * U)) + roundedRect(x + i, y + i, s - 2 * i, s - 2 * i, cornerRadii(out, 1.6 * U, 1.6 * U, 0));
    case 'soft':
      return roundedRect(x, y, s, s, cornerRadii(out, 2.6 * U, 0.7 * U, 2.6 * U)) + roundedRect(x + i, y + i, s - 2 * i, s - 2 * i, cornerRadii(out, 1.7 * U, 0.2 * U, 1.7 * U));
    default:
      return roundedRect(x, y, s, s, [2 * U, 2 * U, 2 * U, 2 * U]) + roundedRect(x + i, y + i, s - 2 * i, s - 2 * i, [1.25 * U, 1.25 * U, 1.25 * U, 1.25 * U]);
  }
}

function eyeBall(shape, x, y, out) {
  const s = 3 * U;
  const bx = x + 2 * U;
  const by = y + 2 * U;
  switch (shape) {
    case 'square':
      return roundedRect(bx, by, s, s);
    case 'circle':
      return circle(bx + s / 2, by + s / 2, s / 2);
    case 'leaf':
      return roundedRect(bx, by, s, s, cornerRadii(out, 1.2 * U, 1.2 * U, 0.15 * U));
    case 'diamond':
      return diamond(bx + s / 2, by + s / 2, s * 0.62);
    default:
      return roundedRect(bx, by, s, s, [0.9 * U, 0.9 * U, 0.9 * U, 0.9 * U]);
  }
}

const inFinder = (size) => (x, y) => (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);

/* ── Logo ──────────────────────────────────────────────────────────────── */

/**
 * Where the logo goes, in modules: the image box (keeping the picture's
 * aspect) and the plate around it. Wide logos get a wider, lower box.
 */
export function logoBox(size, logo, aspect = 1) {
  const side = (size * logo.size) / 100;
  const a = Math.max(0.25, Math.min(4, aspect || 1));
  let w = side;
  let h = side;
  if (a >= 1) {
    w = side * Math.min(1.45, Math.sqrt(a));
    h = w / a;
  } else {
    h = side * Math.min(1.45, Math.sqrt(1 / a));
    w = h * a;
  }
  const pad = (Math.max(w, h) * logo.padding) / 100;
  const round = logo.plate === 'circle';
  const pw = round ? Math.hypot(w, h) + 2 * pad : w + 2 * pad;
  const ph = round ? pw : h + 2 * pad;
  const c = size / 2;
  return { w, h, x: c - w / 2, y: c - h / 2, plate: { w: pw, h: ph, x: c - pw / 2, y: c - ph / 2 }, round };
}

function clearedBy(box) {
  const { plate, round } = box;
  if (round) {
    const cx = plate.x + plate.w / 2;
    const cy = plate.y + plate.h / 2;
    const r = plate.w / 2;
    return (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + 0.35;
  }
  const t = 0.2;
  return (x, y) => x + 1 > plate.x + t && x < plate.x + plate.w - t && y + 1 > plate.y + t && y < plate.y + plate.h - t;
}

/* ── Fill (colour or gradient) ─────────────────────────────────────────── */

function gradientDef(id, gradient, brand, extent) {
  const from = resolveColor(gradient.from, brand);
  const to = resolveColor(gradient.to, brand);
  if (gradient.type === 'radial') {
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(extent / 2)}" cy="${n(extent / 2)}" r="${n(extent * 0.62)}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>`;
  }
  const angle = ((gradient.angle ?? 45) * Math.PI) / 180;
  const c = extent / 2;
  const dx = (Math.cos(angle) * extent) / 2;
  const dy = (Math.sin(angle) * extent) / 2;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(c - dx)}" y1="${n(c - dy)}" x2="${n(c + dx)}" y2="${n(c + dy)}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}

/* ── Frame and caption ─────────────────────────────────────────────────── */

function fitFont(text, width, height) {
  const length = Math.max(1, [...text].reduce((sum, ch) => sum + (/[　-鿿＀-￯]/.test(ch) ? 1.05 : /[A-ZА-ЯЁ]/.test(ch) ? 0.7 : 0.6), 0));
  return n(Math.min(height * 0.44, (width * 0.86) / length));
}

function caption(text, x, y, width, height, color) {
  if (!text) return '';
  const size = fitFont(text, width, height);
  return `<text x="${n(x + width / 2)}" y="${n(y + height / 2)}" font-family="${escapeXml(FONT)}" font-size="${size}" font-weight="700" letter-spacing="${n(size * 0.02)}" fill="${color}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

/* ── The code ──────────────────────────────────────────────────────────── */

/**
 * @param matrix  { size, get(x, y) } — the modules
 * @param options design, brand { color }, logo { href, aspect } (resolved
 *                image of the logo source), icon { markup, mode, color },
 *                caption (default text of the frame), id (unique per page)
 * @returns { svg, width, height, warnings: string[] }
 */
export function renderSvg(matrix, options = {}) {
  const design = mergeDesign(options.design);
  const brand = options.brand || {};
  const id = options.id || 'qr';
  const size = matrix.size;
  const margin = Math.max(0, Math.min(8, Number(design.margin) || 0));
  const Q = (size + 2 * margin) * U;
  const warnings = [];

  const background = design.background.transparent ? null : resolveColor(design.background.color, brand);
  const gradient = design.dots.gradient;
  const dotColor = resolveColor(design.dots.color, brand);
  const fillId = `${id}-fill`;
  const dotFill = gradient ? `url(#${fillId})` : dotColor;
  const frameFill = design.eyes.frameColor ? resolveColor(design.eyes.frameColor, brand) : dotFill;
  const ballFill = design.eyes.ballColor ? resolveColor(design.eyes.ballColor, brand) : dotFill;

  // Contrast: the darkest colour of the dots against the light behind them.
  const behind = background || '#FFFFFF';
  const darkest = [gradient ? resolveColor(gradient.from, brand) : dotColor, gradient ? resolveColor(gradient.to, brand) : dotColor].sort((a, b) => luminance(a) - luminance(b));
  if (luminance(darkest[1]) > luminance(behind)) warnings.push('inverted');
  else if (contrastRatio(darkest[1], behind) < 3) warnings.push('lowContrast');

  // Logo
  const logo = design.logo;
  const image = logo.source === 'icon' ? options.icon : options.logo;
  const hasLogo = logo.source !== 'none' && Boolean(image && (image.href || image.markup));
  const box = hasLogo ? logoBox(size, logo, logo.source === 'icon' ? 1 : image.aspect) : null;
  const finder = inFinder(size);
  const cleared = box ? clearedBy(box) : () => false;
  const skip = (x, y) => finder(x, y) || cleared(x, y);
  if (box) {
    let covered = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (cleared(x, y)) covered += 1;
    if (covered / (size * size) > 0.16) warnings.push('largeLogo');
  }

  const defs = [];
  if (gradient) defs.push(gradientDef(fillId, gradient, brand, size * U));

  let code = `<path d="${dotsPath(matrix, design.dots.style, skip)}" fill="${dotFill}"/>`;
  for (const eye of EYES) {
    const [ex, ey] = eye.at(size).map((v) => v * U);
    code += `<path d="${eyeFrame(design.eyes.frame, ex, ey, eye.out)}" fill="${frameFill}" fill-rule="evenodd"/>`;
    code += `<path d="${eyeBall(design.eyes.ball, ex, ey, eye.out)}" fill="${ballFill}"/>`;
  }
  if (box) {
    const p = box.plate;
    if (logo.plate !== 'none') {
      const plateColor = resolveColor(logo.plateColor, brand);
      const plate = box.round
        ? circle((p.x + p.w / 2) * U, (p.y + p.h / 2) * U, (p.w / 2) * U)
        : roundedRect(p.x * U, p.y * U, p.w * U, p.h * U, Array(4).fill(logo.plate === 'rounded' ? Math.min(p.w, p.h) * U * 0.24 : 0));
      code += `<path d="${plate}" fill="${plateColor}"/>`;
    }
    const [bx, by, bw, bh] = [box.x * U, box.y * U, box.w * U, box.h * U];
    if (image.markup) {
      const color = image.color || (gradient ? resolveColor(gradient.from, brand) : dotColor);
      const paint = image.mode === 'stroke' ? `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` : `fill="${color}"`;
      const inset = bw * 0.08;
      code += `<svg x="${n(bx + inset)}" y="${n(by + inset)}" width="${n(bw - 2 * inset)}" height="${n(bh - 2 * inset)}" viewBox="0 0 24 24" ${paint}>${image.markup}</svg>`;
    } else {
      code += `<image href="${escapeXml(image.href)}" x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" preserveAspectRatio="xMidYMid meet"/>`;
    }
  }

  // Layout of the frame around the code block (Q × Q).
  const frame = design.frame;
  const text = frame.style === 'none' ? '' : (frame.text || options.caption || '').trim();
  const frameColor = resolveColor(frame.color, brand);
  const textColor = resolveColor(frame.textColor, brand);
  const radius = (Q * (design.background.radius || 0)) / 100;
  const block = (x, y, r = radius) => {
    const inner = `<g transform="translate(${n(x + margin * U)} ${n(y + margin * U)})">${code}</g>`;
    return (background ? `<path d="${roundedRect(x, y, Q, Q, [r, r, r, r])}" fill="${background}"/>` : '') + inner;
  };

  let width = Q;
  let height = Q;
  let body = '';
  switch (frame.style) {
    case 'caption': {
      const band = Q * 0.17;
      height = Q + band;
      if (background) body += `<path d="${roundedRect(0, 0, width, height, [radius, radius, radius, radius])}" fill="${background}"/>`;
      body += `<g transform="translate(${n(margin * U)} ${n(margin * U)})">${code}</g>`;
      body += caption(text, 0, Q - band * 0.12, width, band, textColor);
      break;
    }
    case 'card':
    case 'ticket': {
      const pad = Q * 0.05;
      const band = Q * 0.19;
      width = Q + 2 * pad;
      height = Q + pad + band;
      const outer = Q * 0.08;
      const top = frame.style === 'ticket';
      const qy = top ? band : pad;
      if (top) {
        const maskId = `${id}-ticket`;
        const notch = pad * 1.15;
        defs.push(`<mask id="${maskId}"><rect width="${n(width)}" height="${n(height)}" fill="#fff"/>${`<path d="${circle(0, band - pad / 2, notch)}${circle(width, band - pad / 2, notch)}" fill="#000"/>`}</mask>`);
        body += `<path d="${roundedRect(0, 0, width, height, [outer, outer, outer, outer])}" fill="${frameColor}" mask="url(#${maskId})"/>`;
      } else {
        body += `<path d="${roundedRect(0, 0, width, height, [outer, outer, outer, outer])}" fill="${frameColor}"/>`;
      }
      body += block(pad, qy, Math.max(radius, Q * 0.045));
      body += caption(text, 0, top ? 0 : Q + pad, width, top ? band - pad * 0.3 : band, textColor);
      break;
    }
    case 'badge': {
      const stroke = Q * 0.022;
      const gap = Q * 0.04;
      const inner = Q + 2 * (stroke + gap);
      const pill = Q * 0.13;
      width = inner;
      height = inner + pill / 2 + stroke;
      const outer = Q * 0.07;
      if (background) body += `<path d="${roundedRect(0, 0, inner, inner, [outer, outer, outer, outer])}" fill="${background}"/>`;
      body += `<path d="${roundedRect(stroke / 2, stroke / 2, inner - stroke, inner - stroke, [outer, outer, outer, outer])}" fill="none" stroke="${frameColor}" stroke-width="${n(stroke)}"/>`;
      body += `<g transform="translate(${n(stroke + gap + margin * U)} ${n(stroke + gap + margin * U)})">${code}</g>`;
      if (text) {
        const pillWidth = Math.min(inner * 0.84, Math.max(inner * 0.46, fitFont(text, inner, pill) * [...text].length * 0.62 + pill * 1.4));
        const px = (inner - pillWidth) / 2;
        const py = inner - pill / 2 - stroke / 2;
        body += `<path d="${roundedRect(px, py, pillWidth, pill, Array(4).fill(pill / 2))}" fill="${frameColor}"/>`;
        body += caption(text, px + pill * 0.3, py, pillWidth - pill * 0.6, pill * 1.05, textColor);
      }
      break;
    }
    default:
      body = block(0, 0);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" shape-rendering="geometricPrecision">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
  return { svg, width, height, warnings };
}

/* ── Small samples for the style pickers ───────────────────────────────── */

const SAMPLE = ['11011', '10110', '01111', '11001', '10111'];

/** A 5×5 patch of modules in a dot style (currentColor). */
export function dotSample(style) {
  const matrix = { size: 5, get: (x, y) => (SAMPLE[y][x] === '1' ? 1 : 0) };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 54 54"><path d="${dotsPath(matrix, style, () => false)}" fill="currentColor"/></svg>`;
}

/** One eye: frame and centre shapes (currentColor). */
export function eyeSample(frame, ball) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 78 78"><path d="${eyeFrame(frame, 0, 0, 0)}" fill="currentColor" fill-rule="evenodd"/><path d="${eyeBall(ball, 0, 0, 0)}" fill="currentColor"/></svg>`;
}
