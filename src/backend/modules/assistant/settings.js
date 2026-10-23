/*
 * Robot assistant settings (settings.modules.assistant, docs/assistant.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads them from
 * here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`). Plain data and pure functions, no imports: read at build time too.
 */

// Characters of the robot (service.js and the browser part use the same list).
export const AVATARS = ['pixel', 'orbi', 'kiko', 'classic', 'pro', 'boltik', 'nexus', 'bubbles', 'builder', 'builder2', 'architect', 'doctor', 'girl', 'boy', 'toddler', 'zayka', 'ermek', 'aichurok', 'berkut', 'jibek', 'volt', 'nova', 'shadow', 'aurora', 'barsik', 'ryzhik', 'bao', 'pingo'];

// On by default, as while it was built into the core: a portal whose administrator never
// switched it (no stored `enabled`) keeps the robot after the package is installed.
export const defaultEnabled = true;

// Shown to every signed-in person (public settings), not only administrators.
export const publicSettings = ['avatar', 'proactive', 'choice', 'allowed', 'allowColors'];

export const defaults = {
  // Robot shown until a person picks their own (one of AVATARS).
  avatar: 'pixel',
  // Offer help once when a person opens a section for the first time.
  proactive: true,
  // Who chooses the character: 'all' (any), 'some' (only `allowed`), 'one' (everyone gets `avatar`).
  choice: 'all',
  allowed: [],
  // People may recolour their character.
  allowColors: true,
};

export function sanitizeSettings(current, incoming = {}) {
  const next = { ...current };
  if (AVATARS.includes(incoming.avatar)) next.avatar = incoming.avatar;
  if (typeof incoming.proactive === 'boolean') next.proactive = incoming.proactive;
  if (typeof incoming.allowColors === 'boolean') next.allowColors = incoming.allowColors;
  if (['all', 'some', 'one'].includes(incoming.choice)) next.choice = incoming.choice;
  if (Array.isArray(incoming.allowed)) next.allowed = [...new Set(incoming.allowed.filter((id) => AVATARS.includes(id)))];
  // The default must be one people may have; an empty selection means everyone.
  if (next.choice === 'some') {
    if (!next.allowed.length) next.choice = 'all';
    else if (!next.allowed.includes(next.avatar)) next.avatar = next.allowed[0];
  }
  return next;
}
