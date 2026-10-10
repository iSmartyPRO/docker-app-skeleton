import { lazy } from 'react';

/**
 * Settings screen components, keyed by the item id in navigation.js.
 * Each screen is its own chunk, so the admin bundle stays small.
 */
const Integration = lazy(() => import('../pages/admin/settings/Integration'));

export const SETTINGS_PAGES = {
  general: lazy(() => import('../pages/admin/settings/General')),
  theme: lazy(() => import('../pages/admin/settings/Theme')),
  typography: lazy(() => import('../pages/admin/settings/Typography')),
  icons: lazy(() => import('../pages/admin/settings/MenuIcons')),
  signin: lazy(() => import('../pages/admin/settings/SignIn')),
  access: lazy(() => import('../pages/admin/settings/Access')),
  login: lazy(() => import('../pages/admin/settings/Login')),
  ip: lazy(() => import('../pages/admin/settings/IpFiltering')),
  email: Integration,
  telegram: Integration,
  whatsapp: Integration,
  wazzup: Integration,
  ad: Integration,
  system: lazy(() => import('../pages/admin/settings/System')),
};
