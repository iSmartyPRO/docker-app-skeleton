import { query } from '../../config/database.js';

export const AVATARS = ['pixel', 'orbi', 'kiko', 'classic', 'pro', 'boltik', 'nexus', 'bubbles', 'builder', 'builder2', 'architect', 'doctor', 'girl', 'boy', 'toddler', 'zayka', 'ermek', 'aichurok', 'berkut', 'jibek', 'volt', 'nova', 'shadow', 'aurora', 'barsik', 'ryzhik', 'bao', 'pingo'];
const HEX = /^#[0-9a-f]{6}$/i;
const SECTION = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Personal settings over the organisation's defaults:
 *   enabled   the robot is shown (on unless the person switched it off)
 *   avatar    one of AVATARS, or null = the administrator's default
 *   size      'S' | 'M' | 'L'
 *   greeted   sections where the robot already offered help (it offers once)
 *   colors    { [avatar]: '#rrggbb' } — a person's own colour per character
 */
export function cleanPrefs(input = {}, current = {}) {
  const next = { ...current };
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (input.avatar === null || AVATARS.includes(input.avatar)) next.avatar = input.avatar;
  if (['S', 'M', 'L'].includes(input.size)) next.size = input.size;
  if (Array.isArray(input.greeted)) next.greeted = [...new Set(input.greeted.filter((id) => SECTION.test(String(id))))].slice(0, 64);
  if (input.resetGreetings === true) next.greeted = [];
  // { avatar: '#rrggbb' } sets a colour, { avatar: null } restores the design.
  if (input.colors && typeof input.colors === 'object') {
    const colors = { ...(current.colors || {}) };
    for (const [avatar, color] of Object.entries(input.colors)) {
      if (!AVATARS.includes(avatar)) continue;
      if (color === null) delete colors[avatar];
      else if (HEX.test(String(color))) colors[avatar] = String(color).toLowerCase();
    }
    next.colors = colors;
  }
  return next;
}

/**
 * Which characters people may choose, from the module settings:
 *   choice 'all'   every character
 *   choice 'some'  only `allowed`
 *   choice 'one'   nobody chooses: everyone gets the default `avatar`
 */
export function allowedAvatars(module = {}) {
  const fallback = AVATARS.includes(module.avatar) ? module.avatar : 'pixel';
  if (module.choice === 'one') return [fallback];
  if (module.choice === 'some') {
    const list = (module.allowed || []).filter((id) => AVATARS.includes(id));
    return list.length ? list : AVATARS;
  }
  return AVATARS;
}

export function resolvePrefs(stored = {}, module = {}) {
  const allowed = allowedAvatars(module);
  const allowColors = module.allowColors !== false;
  return {
    enabled: stored.enabled !== false,
    avatar: module.choice !== 'one' && allowed.includes(stored.avatar) ? stored.avatar : null,
    defaultAvatar: AVATARS.includes(module.avatar) ? module.avatar : 'pixel',
    size: ['S', 'M', 'L'].includes(stored.size) ? stored.size : 'M',
    greeted: Array.isArray(stored.greeted) ? stored.greeted : [],
    colors: allowColors ? Object.fromEntries(Object.entries(stored.colors || {}).filter(([avatar, color]) => AVATARS.includes(avatar) && HEX.test(color))) : {},
    proactive: module.proactive !== false,
    choice: ['some', 'one'].includes(module.choice) ? module.choice : 'all',
    allowed,
    allowColors,
  };
}

export async function storedPrefs(userId) {
  const { rows } = await query(`SELECT prefs FROM assistant_prefs WHERE user_id = $1`, [userId]);
  return rows[0]?.prefs || {};
}

export async function savePrefs(userId, input, module = {}) {
  const patch = { ...input };
  // A character the administrator did not allow (or any, in 'one' mode) is not saved.
  if (patch.avatar && (module.choice === 'one' || !allowedAvatars(module).includes(patch.avatar))) delete patch.avatar;
  if (patch.colors && module.allowColors === false) delete patch.colors;
  const next = cleanPrefs(patch, await storedPrefs(userId));
  await query(
    `INSERT INTO assistant_prefs (user_id, prefs, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [userId, JSON.stringify(next)]
  );
  return next;
}
