import { lazy } from 'react';
import { FEATURE_MODULES, MODULE_REGISTRY } from '../modules/registry';

/**
 * Settings screen components, keyed by the item id in navigation.js.
 * Each screen is its own chunk, so the admin bundle stays small.
 */
const Integration = lazy(() => import('../pages/admin/settings/Integration'));

// A module's settings screen comes from the module registry (its `Settings`).
const MODULE_SETTINGS = Object.fromEntries([...MODULE_REGISTRY, ...FEATURE_MODULES].filter((module) => module.Settings).map((module) => [module.id, module.Settings]));

export const SETTINGS_PAGES = {
  ...MODULE_SETTINGS,
  general: lazy(() => import('../pages/admin/settings/General')),
  languages: lazy(() => import('../pages/admin/settings/Languages')),
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
  mattermost: Integration,
  isms: Integration,
  ad: Integration,
  system: lazy(() => import('../pages/admin/settings/System')),
  notifications: lazy(() => import('../pages/admin/settings/NotificationDelivery')),
  modules: lazy(() => import('../pages/admin/settings/Modules')),
  documents: Integration,
  google: lazy(() => import('../pages/admin/settings/GoogleSettings')),
  legalEntities: lazy(() => import('../pages/admin/settings/LegalEntities')),
};
