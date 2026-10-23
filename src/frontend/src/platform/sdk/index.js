/*
 * @portal/sdk for the browser — the stable surface a module package's web/
 * code imports from the core (docs/module-packages.md «Web SDK»):
 *
 *   import { api, useLocale, useAuth, LoadState, PageHeader } from '@portal/sdk';
 *
 * The package build (scripts/build-module.mjs) turns the import into
 * /sdk/portal-sdk.js, a shim that hands out these very objects from the core
 * bundle. Adding a name is a minor SDK change; renaming or removing one is a
 * major change of the core.
 */

export { SDK_VERSION } from './version';

// API client (axios instance with the portal's auth, errors and base URL).
export { default as api } from '../../services/api';

// Who is signed in, the portal settings, the interface language.
export { useAuth } from '../../context/AuthContext';
export { useSettings } from '../../context/SettingsContext';
export { useLocale } from '../../context/LocaleContext';
export { useThemeMode } from '../../context/ThemeContext';
export { t, translate } from '../../i18n/translations';
export { pick, localeTag, LANGUAGES } from '../../i18n/languages';

// Access, errors, formats, dates in the portal's regional settings.
export { can, canAny } from '../../lib/access';
export { errorMessage } from '../../lib/errors';
export { formatBytes, formatDateTime, formatRelative, formatNumber, initials } from '../../lib/format';
export { fmtDate, fmtDateTime, fmtSmart, fmtTime, getRegional, useRegional, toPicker, fromPicker, dayToPicker, dayFromPicker, todayISO, nowInZone, pickerFormat } from '../../lib/datetime';
export { lazyPage } from '../../lib/lazyPage';

// Admin settings screens of a module.
export { useAdminSettings } from '../../hooks/useAdminSettings';
export { useSettingsForm } from '../../hooks/useSettingsForm';
export { default as SettingsPageHeader } from '../../pages/admin/settings/SettingsPageHeader';
export { SettingsSection, SettingRow } from '../../components/ui/SettingsSection';
export { default as SaveBar } from '../../components/ui/SaveBar';

// Page building blocks.
export { default as LoadState } from '../../components/ui/LoadState';
export { default as PageHeader } from '../../components/ui/PageHeader';
export { default as PageTransition } from '../../components/ui/PageTransition';
export { default as Segmented } from '../../components/ui/Segmented';
export { default as Chrome } from '../../components/Chrome';
export { MenuIcon } from '../../components/icons/menuIcons';
export { DateField, DateTimeField, TimeField } from '../../components/ui/DateTimeField';
export { Hint, HintLabel, HelpButton } from '../../help/Hint';
export { default as ModuleHeader } from '../../modules/shared/ModuleHeader';
export { default as SideRail } from '../../modules/shared/SideRail';
export { UserAvatar, Person, userOptions, ColorSwatches } from '../../modules/shared/People';

// Core extension points of the interface (src/platform): what a package's web/index.js
// register(ctx) uses to add widgets, «Связи» blocks, search providers, its public UI.
export { contribute, contributions, subscribe, useContributions, provideModule, providedModules, useModuleUi } from '../extensions';
export { registerWidget, lazyWidget, WIDGET_REGISTRY } from '../widgets/registry';
export { registerLinkBlock, LinkBlocks } from '../links';
export { registerSearchProvider, searchEverywhere } from '../search';
export { optionalComponent, optionalApi } from '../optional';
