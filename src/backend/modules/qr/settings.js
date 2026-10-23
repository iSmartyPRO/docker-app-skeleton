/*
 * QR codes settings (settings.modules.qr, docs/qr.md): the defaults the package
 * manifest carries (scripts/build-module.mjs reads `defaults` from here) and the
 * sanitizer the portal uses for them (index.js exports it as `sanitizeSettings`).
 * Plain data and pure functions, no imports: read at build time too.
 */

export const defaultEnabled = false;

export const defaults = {
  // People may change a template's options that are not locked (false: templates as they are).
  allowCustom: true,
  // People may upload their own logo.
  allowUploads: true,
  // Website codes may be dynamic: /q/<slug>, target editable after printing, scans counted.
  dynamic: true,
  maxCodes: 500,
};

export function sanitizeSettings(current, incoming = {}) {
  const next = { ...current };
  for (const flag of ['allowCustom', 'allowUploads', 'dynamic']) {
    if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
  }
  const max = Number(incoming.maxCodes);
  if (Number.isInteger(max)) next.maxCodes = Math.min(10000, Math.max(10, max));
  return next;
}
