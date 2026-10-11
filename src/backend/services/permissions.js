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
  ...MODULE_CATALOG.map((module) => ({ group: `module_${module.id}`, permissions: module.permissions })),
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

/** Which settings permission a PUT /admin/settings patch key needs. */
export const SETTINGS_PATCH_PERMISSIONS = {
  appName: 'settings.general',
  appDescription: 'settings.general',
  appearance: 'settings.general',
  accessMode: 'settings.security',
  security: 'settings.security',
  integrations: 'settings.integrations',
  auth: 'settings.auth',
  rateLimit: 'settings.system',
  modules: 'settings.modules',
};

export const SETTINGS_PERMISSIONS = PERMISSIONS.filter((perm) => perm.startsWith('settings.'));
