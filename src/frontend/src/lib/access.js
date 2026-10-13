/**
 * Client-side mirror of the backend permission model. It only decides what to
 * show — every action is enforced again by the API.
 */
export function can(user, permission) {
  const perms = user?.permissions || [];
  return perms.includes('*') || perms.includes(permission);
}

export function canAny(user, permissions = []) {
  return permissions.some((permission) => can(user, permission));
}

/** Any of these opens the settings console (each section checks its own). */
export const SETTINGS_VIEW = ['settings.view', 'settings.general', 'settings.security', 'settings.auth', 'settings.integrations', 'settings.modules', 'settings.system'];

/** Built-in role names are translated; custom roles show their own name. */
export function roleLabel(role, t) {
  if (!role) return '';
  if (role.isSystem) {
    const key = `builtinRoles.${role.key}.name`;
    const label = t(key);
    if (label !== key) return label;
  }
  return role.name;
}

export function roleDescription(role, t) {
  if (role?.isSystem) {
    const key = `builtinRoles.${role.key}.desc`;
    const label = t(key);
    if (label !== key) return label;
  }
  return role?.description || '';
}

/** Highest built-in role for compact display (badges, menus). */
const ORDER = ['superadmin', 'admin', 'moderator', 'auditor', 'user'];
export function primaryRole(user) {
  const roles = user?.roles || [];
  return [...roles].sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib);
  })[0] || null;
}

/** Same rule as the API: you can hand out only what you hold yourself. */
export function isSubset(granted = [], holder = []) {
  if (holder.includes('*')) return true;
  if (granted.includes('*')) return false;
  return granted.every((perm) => holder.includes(perm));
}

/** Permission names contain dots, so their i18n keys use underscores. */
export function permKey(permission, field = 'title') {
  return `permissions.${String(permission).replace(/\./g, '_')}.${field}`;
}
