/**
 * Permission catalog and built-in roles.
 *
 * Permissions are fixed in code (the API enforces them); roles and groups are
 * data. A user's effective permissions are the union of their own roles and
 * the roles of every group they belong to. `*` means every permission.
 */

import { MODULE_CATALOG } from '../modules/catalog.js';

export const ALL = '*';

/** Grouped for the role editor; `key` is what routes check. */
export const PERMISSION_CATALOG = [
  {
    group: 'console',
    permissions: ['console.access'],
  },
  {
    group: 'people',
    permissions: ['users.view', 'users.manage', 'users.delete', 'groups.manage', 'roles.manage'],
  },
  {
    group: 'audit',
    permissions: ['activity.view'],
  },
  {
    group: 'api',
    permissions: ['api.tokens', 'api.admin'],
  },
  {
    group: 'settings',
    permissions: [
      'settings.view',
      'settings.general',
      'settings.security',
      'settings.auth',
      'settings.integrations',
      'settings.modules',
      'settings.system',
    ],
  },
  // Each module contributes its own permission group.
  ...MODULE_CATALOG.filter((module) => module.permissions.length).map((module) => ({ group: `module_${module.id}`, permissions: module.permissions })),
];

export const PERMISSIONS = PERMISSION_CATALOG.flatMap((group) => group.permissions);

/**
 * Seeded once by key and never overwritten, so edits made in the console
 * survive upgrades. `superadmin` is locked: always `*`, cannot be deleted.
 */
export const SYSTEM_ROLES = [
  {
    key: 'superadmin',
    name: 'Super administrator',
    description: 'Full access, including roles, security, sign-in methods and system settings.',
    permissions: [ALL],
    sort: 0,
  },
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Runs day-to-day operations: users, groups, branding and integrations.',
    permissions: [
      'console.access',
      'users.view',
      'users.manage',
      'users.delete',
      'groups.manage',
      'activity.view',
      'settings.view',
      'settings.general',
      'settings.integrations',
    ],
    sort: 10,
  },
  {
    key: 'moderator',
    name: 'Moderator',
    description: 'Helps users: edits profiles, resets passwords, blocks accounts.',
    permissions: ['console.access', 'users.view', 'users.manage', 'activity.view'],
    sort: 20,
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to users, activity and settings.',
    permissions: ['console.access', 'users.view', 'activity.view', 'settings.view'],
    sort: 30,
  },
  {
    key: 'user',
    name: 'User',
    description: 'Personal cabinet only.',
    permissions: [],
    sort: 40,
  },
];

export const LOCKED_ROLE = 'superadmin';

export function normalizePermissions(list) {
  const input = Array.isArray(list) ? list : [];
  if (input.includes(ALL)) return [ALL];
  return [...new Set(input.filter((perm) => PERMISSIONS.includes(perm)))].sort();
}

export function hasPermission(perms, perm) {
  const set = perms instanceof Set ? perms : new Set(perms || []);
  return set.has(ALL) || set.has(perm);
}

export function hasAnyPermission(perms, wanted) {
  return wanted.some((perm) => hasPermission(perms, perm));
}

/** True when every permission in `granted` is also held by `holder`. */
export function isSubset(granted, holder) {
  const held = holder instanceof Set ? holder : new Set(holder || []);
  if (held.has(ALL)) return true;
  const list = granted instanceof Set ? [...granted] : granted || [];
  if (list.includes(ALL)) return false;
  return list.every((perm) => held.has(perm));
}

/**
 * Which settings permission a PUT /admin/settings patch key needs. Every key
 * updateAdminSettings (services/settings.js) applies must be listed here: a
 * key without an entry is refused (see deniedSettingsKeys).
 */
export const SETTINGS_PATCH_PERMISSIONS = {
  appName: 'settings.general',
  appDescription: 'settings.general',
  appearance: 'settings.general',
  // Interface languages (and the old single default-language key): superadministrators only.
  localization: '*',
  defaultLocale: '*',
  regional: 'settings.general',
  accessMode: 'settings.security',
  // Edited on the Access page next to the access mode (Security group).
  homePage: 'settings.security',
  security: 'settings.security',
  integrations: 'settings.integrations',
  auth: 'settings.auth',
  rateLimit: 'settings.system',
  modules: 'settings.modules',
};

/*
 * Keys older clients always send with an unrelated form: the General form of the version before
 * Settings → Languages sent `defaultLocale` on every save, and so may API token clients. Unchanged,
 * such a key is dropped silently for holders without its permission (no 403 for the whole save);
 * a real change still needs the permission. Documented in docs/i18n.md.
 */
const DROPPED_WHEN_UNCHANGED = {
  defaultLocale: (value, current) => String(value ?? '').trim().toLowerCase() === String(current?.defaultLocale ?? '').toLowerCase(),
};

/** The patch without keys the holder may not change but sent unchanged (see DROPPED_WHEN_UNCHANGED). */
export function dropUnchangedSettingsKeys(patch, perms, current) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...patch };
  for (const [key, same] of Object.entries(DROPPED_WHEN_UNCHANGED)) {
    if (Object.hasOwn(out, key) && !hasPermission(perms, SETTINGS_PATCH_PERMISSIONS[key]) && same(out[key], current)) delete out[key];
  }
  return out;
}

/**
 * Keys of a settings patch the holder may not change: unknown keys (never
 * allowed, even with `*`) and keys whose permission is not held.
 */
export function deniedSettingsKeys(patch, perms) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return [];
  return Object.keys(patch).filter((key) => {
    const needed = Object.hasOwn(SETTINGS_PATCH_PERMISSIONS, key) ? SETTINGS_PATCH_PERMISSIONS[key] : null;
    return !needed || !hasPermission(perms, needed);
  });
}

export const SETTINGS_PERMISSIONS = PERMISSIONS.filter((perm) => perm.startsWith('settings.'));
