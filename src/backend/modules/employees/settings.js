/*
 * Employees settings (settings.modules.employees, docs/employees.md): the defaults
 * the package manifest carries (scripts/build-module.mjs reads `defaults` from
 * here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`) — moved out of the core's modules/catalog.js. Plain data and
 * pure functions, no imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

// A business module: off until an administrator turns it on.
export const defaultEnabled = false;

export const EMPLOYEES_DEFAULTS = {
  // Everyone signed in sees the directory (names, positions, units, work contacts) without employees.view.
  everyoneCanView: false,
  // Birthdays widget: 'all' (day and month to everyone who sees the directory), 'hr' (HR only), 'off'.
  birthdays: 'all',
  // Work anniversaries (years since hire) in the widget.
  anniversaries: true,
  // Clearance reminders: days before expiry (0 = on the day it expires). Each threshold fires once.
  clearanceWarnDays: [30, 7, 0],
  // Who gets clearance reminders besides HR (employees.hr): the employee (when linked) and their manager.
  notifyEmployee: true,
  notifyManager: true,
};

export const defaults = EMPLOYEES_DEFAULTS;

export function sanitizeEmployees(current, incoming = {}) {
  const next = { ...current };
  if (typeof incoming.everyoneCanView === 'boolean') next.everyoneCanView = incoming.everyoneCanView;
  if (['all', 'hr', 'off'].includes(incoming.birthdays)) next.birthdays = incoming.birthdays;
  if (typeof incoming.anniversaries === 'boolean') next.anniversaries = incoming.anniversaries;
  if (Array.isArray(incoming.clearanceWarnDays)) {
    const days = [...new Set(incoming.clearanceWarnDays.filter((value) => value !== '' && value !== null && Number(value) >= 0).map((value) => clampInt(value, 0, 365, -1)).filter((value) => value >= 0))].sort((a, b) => b - a).slice(0, 5);
    next.clearanceWarnDays = days;
  }
  if (typeof incoming.notifyEmployee === 'boolean') next.notifyEmployee = incoming.notifyEmployee;
  if (typeof incoming.notifyManager === 'boolean') next.notifyManager = incoming.notifyManager;
  return Object.fromEntries(Object.keys(EMPLOYEES_DEFAULTS).map((key) => [key, next[key] ?? EMPLOYEES_DEFAULTS[key]]));
}

export const sanitizeSettings = sanitizeEmployees;
