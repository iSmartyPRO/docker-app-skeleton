import { query } from '../../config/database.js';

export const AVATARS = ['pixel', 'orbi', 'kiko'];
const SECTION = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Personal settings over the organisation's defaults:
 *   enabled   the robot is shown (on unless the person switched it off)
 *   avatar    one of AVATARS, or null = the administrator's default
 *   size      'S' | 'M' | 'L'
 *   greeted   sections where the robot already offered help (it offers once)
 */
export function cleanPrefs(input = {}, current = {}) {
  const next = { ...current };
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (input.avatar === null || AVATARS.includes(input.avatar)) next.avatar = input.avatar;
  if (['S', 'M', 'L'].includes(input.size)) next.size = input.size;
  if (Array.isArray(input.greeted)) next.greeted = [...new Set(input.greeted.filter((id) => SECTION.test(String(id))))].slice(0, 64);
  if (input.resetGreetings === true) next.greeted = [];
  return next;
}

export function resolvePrefs(stored = {}, module = {}) {
  return {
    enabled: stored.enabled !== false,
    avatar: AVATARS.includes(stored.avatar) ? stored.avatar : null,
    defaultAvatar: AVATARS.includes(module.avatar) ? module.avatar : 'pixel',
    size: ['S', 'M', 'L'].includes(stored.size) ? stored.size : 'M',
    greeted: Array.isArray(stored.greeted) ? stored.greeted : [],
    proactive: module.proactive !== false,
  };
}

export async function storedPrefs(userId) {
  const { rows } = await query(`SELECT prefs FROM assistant_prefs WHERE user_id = $1`, [userId]);
  return rows[0]?.prefs || {};
}

export async function savePrefs(userId, input) {
  const next = cleanPrefs(input, await storedPrefs(userId));
  await query(
    `INSERT INTO assistant_prefs (user_id, prefs, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [userId, JSON.stringify(next)]
  );
  return next;
}
