/*
 * What the core bundle shares with module packages (docs/module-packages.md «Web SDK»).
 * Plain data: read by the core build (scripts/vite-plugin-portal-sdk.mjs) and
 * by scripts/build-module.mjs. No imports.
 *
 * A package's web/ code is built without these: its imports of them become
 * imports of /sdk/<name>.js — small shim modules emitted with the core build
 * that re-export the core's own copy (window.__PORTAL_SHARED__.load(name)),
 * so a package uses the same React, the same antd theme and the same
 * contexts as the portal.
 *
 *   SHARED_LIBS   npm packages (bare imports)
 *   @portal/sdk   the stable SDK (src/platform/sdk/index.js)
 *   EXPOSED_CORE  core files a package may import by relative path while it
 *                 is converted from src/frontend/src/modules/<id> (paths
 *                 relative to src/frontend/src, without extension). Every
 *                 file under src/platform/ (extension points) is added by the
 *                 build. Changing this list needs a core release.
 */

// @ant-design/icons is not shared: its namespace is every icon (hundreds of KB, and memory at
// build time); a package bundles the few icons it uses (tree-shaken).
export const SHARED_LIBS = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom', 'antd', 'dayjs'];

export const SDK_SPECIFIER = '@portal/sdk';

export const EXPOSED_CORE = [
  'services/api',
  'context/AuthContext',
  'context/LocaleContext',
  'context/SettingsContext',
  'context/ThemeContext',
  'hooks/useAdminSettings',
  'hooks/useSettingsForm',
  'i18n/languages',
  'i18n/translations',
  'i18n/fullcalendar',
  'i18n/vendor',
  'lib/access',
  'lib/datetime',
  'lib/errors',
  'lib/firstName',
  'lib/format',
  'lib/linkVisit',
  'lib/readme',
  'lib/scanBurst',
  'lib/lazyPage',
  'lib/search',
  'components/AppFooter',
  'components/BrandMark',
  'components/Chrome',
  'components/LanguageSwitch',
  'components/ModuleHint',
  'components/ThemeSwitch',
  'components/icons/AdminIcons',
  'components/icons/menuIcons',
  'components/readme/ReadmeCard',
  'components/ui/BarcodeScanner',
  'components/ui/DateTimeField',
  'components/ui/Labels',
  'components/ui/LinkListRow',
  'components/ui/LinkPermissions',
  'components/ui/LinkSimpleForm',
  'components/ui/LoadState',
  'components/ui/PageHeader',
  'components/ui/PageTransition',
  'components/ui/SaveBar',
  'components/ui/Segmented',
  'components/ui/SettingsSection',
  'components/ui/WhenPicker',
  'help/HelpContext',
  'help/Hint',
  'help/Rich',
  'layouts/PublicLayout',
  'pages/admin/settings/ModuleEnableSwitch',
  'pages/admin/settings/SettingsPageHeader',
  'tour/TourButton',
  'tour/TourContext',
  'tour/engine',
  'modules/registry',
  'modules/manifest',
  'modules/platformUi',
  'modules/shared/AccessDialog',
  'modules/shared/ModuleHeader',
  'modules/shared/People',
  'modules/shared/SideRail',
];

/** File name of the shim of a shared name: 'react/jsx-runtime' → 'react__jsx-runtime', core path → 'core/<path>'. */
export function shimFile(name) {
  if (name === SDK_SPECIFIER) return 'portal-sdk.js';
  if (name.startsWith('core/')) return `${name}.js`;
  return `${name.replace(/^@/, '').replace(/\//g, '__')}.js`;
}

/** The URL a package imports for a shared name. */
export const shimUrl = (name) => `/sdk/${shimFile(name)}`;
