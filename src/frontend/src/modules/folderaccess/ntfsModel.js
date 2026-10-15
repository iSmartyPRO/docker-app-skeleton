/*
 * NTFS editor model (browser side, pure): presets, "applies to", the draft of
 * explicit entries, inheritance changes and report fixes. Mirrors
 * src/backend/modules/drive/acl.js; the server re-checks everything in the preview.
 */

export const FLAGS = { OI: 0x01, CI: 0x02, NP: 0x04, IO: 0x08, INHERITED: 0x10 };
const { OI, CI, NP, IO, INHERITED } = FLAGS;

export const PRESETS = {
  full: { mask: 0x1f01ff, flags: OI | CI },
  modify: { mask: 0x1301bf, flags: OI | CI },
  readExecute: { mask: 0x1200a9, flags: OI | CI },
  listFolder: { mask: 0x1200a9, flags: CI },
  read: { mask: 0x120089, flags: OI | CI },
  write: { mask: 0x100116, flags: OI | CI },
};
export const PRESET_ORDER = ['full', 'modify', 'readExecute', 'listFolder', 'read', 'write'];

export const APPLIES_TO = {
  this: 0,
  thisSubfoldersFiles: OI | CI,
  thisSubfolders: CI,
  thisFiles: OI,
  subfoldersFiles: OI | CI | IO,
  subfolders: CI | IO,
  files: OI | IO,
};
export const APPLIES_ORDER = ['thisSubfoldersFiles', 'this', 'thisSubfolders', 'thisFiles', 'subfoldersFiles', 'subfolders', 'files'];

const ALIASES = { full_control: 'full', read_execute: 'readExecute' };
export const presetKey = (name) => ALIASES[name] || name;

export function mapGeneric(mask) {
  let out = (mask & ~0xf0000000) >>> 0;
  if (mask & 0x10000000) out |= 0x1f01ff;
  if (mask & 0x80000000) out |= 0x120089;
  if (mask & 0x40000000) out |= 0x120116;
  if (mask & 0x20000000) out |= 0x1200a0;
  return out >>> 0;
}

export const isInherited = (ace) => Boolean(ace.inherited || (Number(ace.flags) & INHERITED));

/** The editable explicit entries of an ACL as the server takes them. */
export function explicitOf(acl) {
  return (acl?.aces || [])
    .filter((ace) => !isInherited(ace))
    .map((ace) => (ace.type === 'other' ? { type: 'other', aceType: ace.aceType, flags: Number(ace.flags), raw: ace.raw } : { type: ace.type, sid: ace.sid, mask: ace.mask >>> 0, flags: Number(ace.flags) }));
}

/** An entry from the dialog: { type, sid, preset, appliesTo, noPropagate } → { type, sid, mask, flags }. */
export function aceFromForm({ type, sid, preset, appliesTo, noPropagate, mask }) {
  let flags = APPLIES_TO[appliesTo] ?? OI | CI;
  if (noPropagate && flags & (OI | CI)) flags |= NP;
  const value = preset === 'special' ? mask : PRESETS[preset].mask;
  return { type, sid, mask: value >>> 0, flags };
}

/**
 * The entry the "Permission Entry" dialog saves. "List folder contents" is for
 * folders only: it drops "files" (OI) and keeps CI, but keeps inherit-only (IO)
 * and "only within this container" (NP), so an entry for "Subfolders only"
 * stays off the folder itself after it is opened and saved.
 */
export function aceFromDialog(form) {
  const entry = aceFromForm(form);
  if (form.preset === 'listFolder') entry.flags = (entry.flags & ~OI) | CI;
  return entry;
}

export function appliesToOf(flags) {
  const key = Number(flags) & (OI | CI | IO);
  return Object.keys(APPLIES_TO).find((name) => APPLIES_TO[name] === key) || 'this';
}

export function presetOf(mask, flags) {
  const specific = mapGeneric(mask);
  if (specific === PRESETS.readExecute.mask && (Number(flags) & (OI | CI)) === CI) return 'listFolder';
  return ['full', 'modify', 'readExecute', 'read', 'write'].find((name) => specific === PRESETS[name].mask) || 'special';
}

/** Canonical order: explicit deny, then explicit allow (others stay where the allows are). */
export function canonical(aces) {
  return aces.map((ace, index) => ({ ace, index })).sort((a, b) => (a.ace.type === 'deny' ? 0 : 1) - (b.ace.type === 'deny' ? 0 : 1) || a.index - b.index).map((item) => item.ace);
}

/**
 * "Disable inheritance": convert inherited entries into explicit ones, or drop
 * them. Entries of types the editor cannot show ("other") are converted too,
 * byte for byte, as Windows does.
 */
export function disableInheritance(acl, explicit, mode) {
  if (mode === 'remove') return { aces: explicit, protected: true, inherit: 'auto' };
  const key = (ace) => (ace.type === 'other' ? `other|${ace.aceType}|${ace.flags}|${ace.raw}` : `${ace.type}|${ace.sid}|${ace.mask}|${ace.flags}`);
  const seen = new Set(explicit.map(key));
  const converted = (acl?.aces || [])
    .filter(isInherited)
    .map((ace) =>
      ace.type === 'other'
        ? { type: 'other', aceType: ace.aceType, flags: Number(ace.flags) & ~INHERITED, raw: ace.raw }
        : { type: ace.type, sid: ace.sid, mask: ace.mask >>> 0, flags: Number(ace.flags) & ~INHERITED }
    )
    .filter((ace) => !seen.has(key(ace)) && seen.add(key(ace)));
  return { aces: canonical([...explicit, ...converted]), protected: true, inherit: 'auto' };
}

/** A report fix on the explicit entries: add / set (replace the SID's allows) / remove / removeDeny (the SID's explicit denies). */
export function applyFix(explicit, fix) {
  if (!fix?.sid) return explicit;
  if (fix.op === 'remove') return explicit.filter((ace) => ace.sid !== fix.sid);
  if (fix.op === 'removeDeny') return explicit.filter((ace) => !(ace.sid === fix.sid && ace.type === 'deny'));
  const preset = PRESETS[presetKey(fix.preset)];
  if (!preset) return explicit;
  const entry = { type: 'allow', sid: fix.sid, mask: preset.mask, flags: fix.appliesTo ? APPLIES_TO[fix.appliesTo] ?? preset.flags : preset.flags };
  if (fix.op === 'add') return [...explicit, entry];
  if (fix.op === 'set') {
    const at = explicit.findIndex((ace) => ace.sid === fix.sid && ace.type === 'allow');
    const rest = explicit.filter((ace) => !(ace.sid === fix.sid && ace.type === 'allow'));
    rest.splice(at < 0 ? rest.length : Math.min(at, rest.length), 0, entry);
    return rest;
  }
  return explicit;
}

export const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);
