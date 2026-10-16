/*
 * Server side of the theme system: which theme ids exist, the
 * administrator's theme rules and a person's interface preferences
 * (`users.ui`). The palettes themselves live in the frontend
 * (src/frontend/src/theme/themes.js); a unit test keeps the id lists equal.
 */

export const THEME_IDS = ['light', 'dark', 'system', 'graphite', 'ocean', 'forest', 'sand', 'midnight', 'lavender', 'contrast', 'dawn', 'borealis', 'constellation', 'custom'];
export const BASE_THEME_IDS = ['light', 'dark', 'system'];
export const OPTIONAL_THEME_IDS = THEME_IDS.filter((id) => !BASE_THEME_IDS.includes(id) && id !== 'custom');

export const isThemeId = (value) => THEME_IDS.includes(value);

/** settings.appearance.themes: which themes employees may choose, custom pictures, motion. */
export function sanitizeThemePolicy(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const allowed = Array.isArray(raw.allowed) ? [...new Set(raw.allowed.filter((id) => OPTIONAL_THEME_IDS.includes(id)))] : [];
  return {
    // Empty = all themes.
    allowed,
    allowCustom: raw.allowCustom !== false,
    allowMotion: raw.allowMotion !== false,
  };
}

/** The portal's default theme (settings.appearance.defaultTheme): any theme but a personal custom one. */
export function sanitizeDefaultTheme(value, fallback = 'light') {
  return isThemeId(value) && value !== 'custom' ? value : fallback;
}

/**
 * Whether a person may choose theme `id` under the administrator's rules
 * (the server twin of isThemeAllowed in frontend theme/themes.js): base
 * themes and the portal default always; the custom one while custom
 * backgrounds are allowed; others when the list is empty or names them.
 */
export function themeAllowed(id, policy, portalDefault) {
  if (!isThemeId(id)) return false;
  if (BASE_THEME_IDS.includes(id)) return true;
  const rules = sanitizeThemePolicy(policy);
  if (id === 'custom') return rules.allowCustom;
  if (id === portalDefault) return true;
  return !rules.allowed.length || rules.allowed.includes(id);
}

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_ID = /^[a-f0-9]{24}$/;
const clampInt = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

/**
 * A person's interface preferences (`users.ui`), merged over what is stored:
 *   motion   'auto' | 'off'      moving backgrounds (dynamic themes)
 *   toursOff boolean             «Не показывать туры»
 *   custom   { image, accent, scheme, dim, blur }  the custom theme
 */
export function sanitizeUserUi(patch, current = {}) {
  const base = current && typeof current === 'object' ? current : {};
  const next = { ...sanitizeStoredUi(base) };
  if (!patch || typeof patch !== 'object') return next;
  if (patch.motion !== undefined) next.motion = patch.motion === 'off' ? 'off' : 'auto';
  if (patch.toursOff !== undefined) next.toursOff = patch.toursOff === true;
  if (patch.custom !== undefined) {
    const custom = patch.custom && typeof patch.custom === 'object' ? patch.custom : {};
    const prev = next.custom || {};
    next.custom = {
      image: custom.image === null ? null : IMAGE_ID.test(String(custom.image ?? prev.image ?? '')) ? custom.image ?? prev.image : null,
      accent: HEX.test(String(custom.accent ?? '')) ? custom.accent.toUpperCase() : custom.accent === null ? null : prev.accent ?? null,
      scheme: (custom.scheme ?? prev.scheme) === 'dark' ? 'dark' : 'light',
      dim: clampInt(custom.dim ?? prev.dim, 60, 92, 70),
      blur: clampInt(custom.blur ?? prev.blur, 0, 24, 6),
    };
  }
  return next;
}

/** What may be read back from the column (unknown keys dropped). */
export function sanitizeStoredUi(stored) {
  const raw = stored && typeof stored === 'object' ? stored : {};
  const out = { motion: raw.motion === 'off' ? 'off' : 'auto', toursOff: raw.toursOff === true };
  if (raw.custom && typeof raw.custom === 'object') {
    out.custom = {
      image: IMAGE_ID.test(String(raw.custom.image || '')) ? raw.custom.image : null,
      accent: HEX.test(String(raw.custom.accent || '')) ? String(raw.custom.accent).toUpperCase() : null,
      scheme: raw.custom.scheme === 'dark' ? 'dark' : 'light',
      dim: clampInt(raw.custom.dim, 60, 92, 70),
      blur: clampInt(raw.custom.blur, 0, 24, 6),
    };
  }
  return out;
}
