import { bestOn, ensureContrast, isDark, isHexColor, mix, mutedShare } from './contrast.js';

/*
 * Themes a person chooses in Account → Appearance (the administrator picks the
 * portal's default and which of them employees may use).
 *
 *   base     light / dark / system — wear the portal's brand palette
 *            (Settings → Theme: template + custom colours)
 *   palette  ready-made full palettes (Graphite, Ocean, …)
 *   dynamic  a palette plus a slowly moving background layer (theme/Backdrop.jsx)
 *   custom   the person's background picture + accent colour over the brand palette
 *
 * Every theme resolves to the same token set (themeTokens): the antd theme and
 * the CSS variables of index.css are built from it, so every screen re-skins
 * from one place. Each theme has a fixed colour scheme (light or dark), which
 * stays in <html data-theme> — existing dark-mode rules keep working — while
 * <html data-skin> names the theme for theme-specific touches.
 *
 * Pure module (no React/antd): the contrast check script and unit tests import
 * it. Keep THEME_IDS in sync with src/backend/services/themeCatalog.js (a test
 * compares them).
 */

export const THEMES = [
  { id: 'light', kind: 'base', scheme: 'light', name: { ru: 'Светлая', en: 'Light' }, desc: { ru: 'Фирменные цвета портала', en: 'The portal’s brand colours' } },
  { id: 'dark', kind: 'base', scheme: 'dark', name: { ru: 'Тёмная', en: 'Dark' }, desc: { ru: 'Фирменные цвета, тёмный вариант', en: 'Brand colours, dark variant' } },
  { id: 'system', kind: 'base', scheme: 'auto', name: { ru: 'Как в системе', en: 'As the system' }, desc: { ru: 'Светлая днём, тёмная — если так в устройстве', en: 'Follows the device setting' } },
  {
    id: 'graphite',
    kind: 'palette',
    scheme: 'dark',
    name: { ru: 'Графит', en: 'Graphite' },
    desc: { ru: 'Спокойный тёмно-серый, стальной акцент', en: 'Calm charcoal with a steel accent' },
    colors: {
      colorPrimary: '#8FB8DE',
      colorSuccess: '#7DC59A',
      colorWarning: '#E2B45C',
      colorError: '#F08A80',
      colorBgBase: '#121417',
      colorBgLayout: '#121417',
      colorBgContainer: '#1A1D21',
      colorBgElevated: '#22262B',
      colorTextBase: '#E8EAED',
      colorBorder: '#30353C',
    },
  },
  {
    id: 'ocean',
    kind: 'palette',
    scheme: 'light',
    name: { ru: 'Океан', en: 'Ocean' },
    desc: { ru: 'Свежий бирюзово-голубой', en: 'Fresh sea blue and teal' },
    colors: {
      colorPrimary: '#0A6A86',
      colorSuccess: '#1F7A55',
      colorWarning: '#A86412',
      colorError: '#B42D2D',
      colorBgBase: '#F3F8FA',
      colorBgLayout: '#E6F1F5',
      colorBgContainer: '#FFFFFF',
      colorBgElevated: '#FFFFFF',
      colorTextBase: '#0D2530',
      colorBorder: '#C3D9E2',
    },
  },
  {
    id: 'forest',
    kind: 'palette',
    scheme: 'dark',
    name: { ru: 'Лес', en: 'Forest' },
    desc: { ru: 'Глубокий хвойный зелёный', en: 'Deep pine green' },
    colors: {
      colorPrimary: '#7FD1A0',
      colorSuccess: '#9AD98F',
      colorWarning: '#E6C15A',
      colorError: '#F28B82',
      colorBgBase: '#0E1611',
      colorBgLayout: '#0E1611',
      colorBgContainer: '#152019',
      colorBgElevated: '#1C2A21',
      colorTextBase: '#E2ECE4',
      colorBorder: '#2B3C31',
    },
  },
  {
    id: 'sand',
    kind: 'palette',
    scheme: 'light',
    name: { ru: 'Песок', en: 'Sand' },
    desc: { ru: 'Тёплый бежевый, как бумага', en: 'Warm paper beige' },
    colors: {
      colorPrimary: '#8F5320',
      colorSuccess: '#3E7A4A',
      colorWarning: '#9A6512',
      colorError: '#A93A2A',
      colorBgBase: '#F8F3EA',
      colorBgLayout: '#F3ECE1',
      colorBgContainer: '#FFFCF6',
      colorBgElevated: '#FFFFFF',
      colorTextBase: '#2B2117',
      colorBorder: '#E0D3BF',
    },
  },
  {
    id: 'midnight',
    kind: 'palette',
    scheme: 'dark',
    name: { ru: 'Полночь', en: 'Midnight' },
    desc: { ru: 'Глубокий синий, мягкий индиго', en: 'Deep blue with soft indigo' },
    colors: {
      colorPrimary: '#94A6FF',
      colorSuccess: '#6FD3A6',
      colorWarning: '#F0BE5E',
      colorError: '#FF8F8F',
      colorBgBase: '#090D1A',
      colorBgLayout: '#090D1A',
      colorBgContainer: '#10162A',
      colorBgElevated: '#171F38',
      colorTextBase: '#E6E9F5',
      colorBorder: '#232C49',
    },
  },
  {
    id: 'lavender',
    kind: 'palette',
    scheme: 'light',
    name: { ru: 'Лаванда', en: 'Lavender' },
    desc: { ru: 'Светлый сиреневый, фиолетовый акцент', en: 'Soft lilac, violet accent' },
    colors: {
      colorPrimary: '#5B45B0',
      colorSuccess: '#2E7D5B',
      colorWarning: '#9C6510',
      colorError: '#B3363F',
      colorBgBase: '#F6F4FC',
      colorBgLayout: '#EFECF8',
      colorBgContainer: '#FFFFFF',
      colorBgElevated: '#FFFFFF',
      colorTextBase: '#1E1A33',
      colorBorder: '#D6D0EA',
    },
  },
  {
    id: 'contrast',
    kind: 'palette',
    scheme: 'dark',
    name: { ru: 'Высокий контраст', en: 'High contrast' },
    desc: { ru: 'Максимальная читаемость, чёткие рамки', en: 'Maximum legibility, strong outlines' },
    colors: {
      colorPrimary: '#FFD60A',
      colorSuccess: '#4BE08A',
      colorWarning: '#FFB020',
      colorError: '#FF7070',
      colorBgBase: '#000000',
      colorBgLayout: '#000000',
      colorBgContainer: '#0A0A0A',
      colorBgElevated: '#161616',
      colorTextBase: '#FFFFFF',
      colorBorder: '#A6A6A6',
      colorTextSecondary: '#E6E6E6',
      colorTextTertiary: '#C8C8C8',
    },
  },
  {
    id: 'dawn',
    kind: 'dynamic',
    scheme: 'light',
    motion: 'gradient',
    name: { ru: 'Рассвет', en: 'Dawn' },
    desc: { ru: 'Медленно плывущий тёплый градиент', en: 'A slowly drifting warm gradient' },
    colors: {
      colorPrimary: '#A23E5E',
      colorSuccess: '#2F7A55',
      colorWarning: '#A0620F',
      colorError: '#B3262E',
      colorBgBase: '#FBF6F7',
      colorBgLayout: '#F6EEF0',
      colorBgContainer: '#FFFFFF',
      colorBgElevated: '#FFFFFF',
      colorTextBase: '#2A1C24',
      colorBorder: '#EAD7DD',
    },
    backdrop: { colors: ['#FBD9C9', '#F6C6D6', '#DCD3F5', '#CDE6F5'], opacity: 0.6 },
  },
  {
    id: 'borealis',
    kind: 'dynamic',
    scheme: 'dark',
    motion: 'aurora',
    name: { ru: 'Сияние', en: 'Aurora' },
    desc: { ru: 'Мягкие переливы северного сияния', en: 'Soft northern-lights glow' },
    colors: {
      colorPrimary: '#5EE0B5',
      colorSuccess: '#5EE0B5',
      colorWarning: '#F2C65C',
      colorError: '#FF8A8A',
      colorBgBase: '#070D14',
      colorBgLayout: '#070D14',
      colorBgContainer: '#0E1620',
      colorBgElevated: '#142030',
      colorTextBase: '#E4EEF2',
      colorBorder: '#203040',
    },
    backdrop: { colors: ['#1FD1A0', '#3B82F6', '#8B5CF6'], opacity: 0.32 },
  },
  {
    id: 'constellation',
    kind: 'dynamic',
    scheme: 'dark',
    motion: 'particles',
    name: { ru: 'Созвездие', en: 'Constellation' },
    desc: { ru: 'Лёгкая сетка мерцающих точек', en: 'A gentle grid of drifting stars' },
    colors: {
      colorPrimary: '#9DB7FF',
      colorSuccess: '#74D8A8',
      colorWarning: '#F2C062',
      colorError: '#FF9090',
      colorBgBase: '#0A0F1F',
      colorBgLayout: '#0A0F1F',
      colorBgContainer: '#111830',
      colorBgElevated: '#18213D',
      colorTextBase: '#E8ECF8',
      colorBorder: '#253157',
    },
    // Small dots, not a ground under text: no contrast pairs (ground: false).
    backdrop: { colors: ['#C9D6FF'], opacity: 0.5, ground: false },
  },
  { id: 'custom', kind: 'custom', scheme: 'custom', name: { ru: 'Своя', en: 'Custom' }, desc: { ru: 'Ваша картинка и цвет', en: 'Your picture and colour' } },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);
export const BASE_THEME_IDS = ['light', 'dark', 'system'];
/** Themes an administrator may offer or hide (base ones are always available). */
export const OPTIONAL_THEME_IDS = THEMES.filter((theme) => theme.kind === 'palette' || theme.kind === 'dynamic').map((theme) => theme.id);

export const themeById = (id) => THEMES.find((theme) => theme.id === id) || null;

/** Administrator's rules (settings.appearance.themes) with safe defaults. */
export function themePolicy(appearance = {}) {
  const raw = appearance?.themes || {};
  const allowed = Array.isArray(raw.allowed) ? raw.allowed.filter((id) => OPTIONAL_THEME_IDS.includes(id)) : null;
  return {
    // null = every theme; an array = only these (plus the base ones and the portal default).
    allowed: allowed && allowed.length ? allowed : null,
    allowCustom: raw.allowCustom !== false,
    allowMotion: raw.allowMotion !== false,
  };
}

/** Whether `id` may be worn under the administrator's rules (`portalDefault` always may). */
export function isThemeAllowed(id, policy, { portalDefault, hasCustom = true } = {}) {
  const theme = themeById(id);
  if (!theme) return false;
  if (theme.kind === 'base') return true;
  if (theme.kind === 'custom') return Boolean(policy?.allowCustom) && hasCustom;
  if (id === portalDefault) return true;
  return !policy?.allowed || policy.allowed.includes(id);
}

/** Themes offered in Account → Appearance, in catalogue order. */
export function selectableThemes(policy, { portalDefault } = {}) {
  return THEMES.filter((theme) => theme.kind !== 'custom' && isThemeAllowed(theme.id, policy, { portalDefault }));
}

/**
 * The theme that is worn: the first allowed of the device override, the
 * person's choice, the portal default; "system" resolves its scheme from the
 * device. Returns { id, scheme, theme }.
 */
export function pickTheme({ manual, userTheme, portalDefault, policy, systemDark = false, hasCustom = false }) {
  const chain = [manual, userTheme, portalDefault, 'light'];
  const id = chain.find((candidate) => candidate && isThemeAllowed(candidate, policy, { portalDefault, hasCustom })) || 'light';
  const theme = themeById(id);
  let scheme = theme.scheme;
  if (scheme === 'auto') scheme = systemDark ? 'dark' : 'light';
  return { id, scheme, theme };
}

/** Clean personal custom-theme settings (`user.ui.custom`). */
export function cleanCustom(custom = {}) {
  const value = custom && typeof custom === 'object' ? custom : {};
  return {
    image: /^[a-f0-9]{24}$/.test(String(value.image || '')) ? value.image : null,
    accent: isHexColor(value.accent) ? value.accent.toUpperCase() : null,
    scheme: value.scheme === 'dark' ? 'dark' : 'light',
    dim: Number.isFinite(Number(value.dim)) ? Math.max(60, Math.min(92, Math.round(Number(value.dim)))) : 70,
    blur: Number.isFinite(Number(value.blur)) ? Math.max(0, Math.min(24, Math.round(Number(value.blur)))) : 6,
  };
}

/**
 * Full token set of a theme. `brand(scheme)` gives the portal's brand palette
 * for light / dark (theme/templates.js → resolveColors), used by base themes
 * and as the ground of a custom theme.
 */
export function themeTokens(theme, scheme, brand, custom = null) {
  let colors;
  if (theme.kind === 'palette' || theme.kind === 'dynamic') {
    colors = { ...theme.colors };
  } else {
    colors = { ...brand(scheme) };
    if (theme.kind === 'custom' && custom?.accent) {
      colors.colorPrimary = custom.accent;
    }
  }
  colors.colorBgElevated ||= colors.colorBgContainer;
  colors.colorBgBase ||= colors.colorBgLayout;
  const surfaces = [colors.colorBgContainer, colors.colorBgLayout, colors.colorBgElevated];
  // Links and focus rings use the primary colour as text: AA on every surface.
  colors.colorPrimary = ensureContrast(colors.colorPrimary, surfaces, 4.5);
  colors.colorInfo = colors.colorPrimary;
  colors.colorLink = colors.colorPrimary;
  colors.colorError = ensureContrast(colors.colorError, [colors.colorBgContainer], 4.5);
  colors.colorSuccess = ensureContrast(colors.colorSuccess, [colors.colorBgContainer], 3);
  colors.colorWarning = ensureContrast(colors.colorWarning, [colors.colorBgContainer], 3);
  const darkInk = isDark(colors.colorBgLayout) ? colors.colorBgLayout : colors.colorTextBase;
  colors.onPrimary = bestOn(colors.colorPrimary, ['#FFFFFF', darkInk, '#000000']);
  // Living themes: text may sit on the moving layer too (its strongest tint over the ground).
  const grounds = theme.backdrop && theme.backdrop.ground !== false ? theme.backdrop.colors.map((tint) => mix(tint, colors.colorBgLayout, theme.backdrop.opacity)) : [];
  const worstSurface = [...surfaces, ...grounds];
  if (!colors.colorTextSecondary) {
    colors.colorTextSecondary = mix(colors.colorTextBase, colors.colorBgContainer, mutedShare(colors.colorTextBase, worstSurface, 4.6, 0.62));
  }
  if (!colors.colorTextTertiary) {
    colors.colorTextTertiary = mix(colors.colorTextBase, colors.colorBgContainer, mutedShare(colors.colorTextBase, worstSurface, 3.1, 0.42));
  }
  return colors;
}

/**
 * May the background move? Never under reduced motion, the person's
 * "no animation", the administrator's switch, data saver, or on a weak device.
 */
export function motionAllowed({ reducedMotion = false, userMotion = 'auto', policyMotion = true, cores, memory, saveData = false } = {}) {
  if (reducedMotion || userMotion === 'off' || !policyMotion || saveData) return false;
  if (Number.isFinite(cores) && cores > 0 && cores <= 2) return false;
  if (Number.isFinite(memory) && memory > 0 && memory <= 2) return false;
  return true;
}
