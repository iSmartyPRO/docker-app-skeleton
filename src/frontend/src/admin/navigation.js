/**
 * Single source of truth for the admin console structure.
 *
 * The sidebar, the settings hub, the settings side-nav, the ⌘K command palette
 * and the menu-icon editor are all generated from these lists. Adding a new
 * settings screen to a project is:
 *   1. add an item to a group below,
 *   2. register its component in `settingsPages.js`,
 *   3. add `settings.<id>.title` / `.desc` to i18n.
 */

/** Top-level sidebar entries. Everything configurable lives under Settings. */
export const ADMIN_PAGES = [
  {
    key: '/admin',
    labelKey: 'nav.overview',
    descKey: 'nav.overviewDesc',
    defaultIcon: 'dashboard',
    keywords: 'dashboard home overview обзор главная',
  },
  {
    key: '/admin/users',
    labelKey: 'nav.users',
    descKey: 'nav.usersDesc',
    defaultIcon: 'people',
    keywords: 'users people accounts roles пользователи люди роли',
  },
  {
    key: '/admin/activity',
    labelKey: 'nav.activity',
    descKey: 'nav.activityDesc',
    defaultIcon: 'bell',
    keywords: 'activity audit log security events журнал события аудит',
  },
  {
    key: '/admin/settings',
    labelKey: 'nav.settings',
    descKey: 'nav.settingsDesc',
    defaultIcon: 'general',
    keywords: 'settings preferences configuration настройки параметры',
  },
];

export const SETTINGS_GROUPS = [
  {
    id: 'project',
    labelKey: 'settings.groups.project',
    items: [
      {
        id: 'general',
        defaultIcon: 'project',
        keywords: 'name brand logo description название логотип бренд описание',
      },
    ],
  },
  {
    id: 'appearance',
    labelKey: 'settings.groups.appearance',
    items: [
      {
        id: 'theme',
        defaultIcon: 'palette',
        keywords: 'theme colors palette dark light тема цвета палитра тёмная светлая',
      },
      {
        id: 'typography',
        defaultIcon: 'type',
        keywords: 'font typography typeface шрифт типографика',
      },
      {
        id: 'icons',
        defaultIcon: 'apps',
        keywords: 'icons menu иконки меню',
      },
    ],
  },
  {
    id: 'security',
    labelKey: 'settings.groups.security',
    items: [
      {
        id: 'access',
        defaultIcon: 'globe',
        keywords: 'access open closed public private доступ открытый закрытый публичный',
      },
      {
        id: 'login',
        defaultIcon: 'key',
        keywords: 'login session lockout attempts password вход сессия блокировка попытки',
      },
      {
        id: 'ip',
        defaultIcon: 'network',
        keywords: 'ip allow block whitelist blacklist cidr белый чёрный список фильтр',
      },
    ],
  },
  {
    id: 'integrations',
    labelKey: 'settings.groups.integrations',
    items: [
      {
        id: 'email',
        integration: 'email',
        defaultIcon: 'mail',
        keywords: 'email smtp mail почта',
      },
      {
        id: 'telegram',
        integration: 'telegram',
        defaultIcon: 'telegram',
        keywords: 'telegram bot бот',
      },
      {
        id: 'whatsapp',
        integration: 'whatsapp',
        defaultIcon: 'whatsapp',
        keywords: 'whatsapp gateway api шлюз',
      },
      {
        id: 'ad',
        integration: 'activeDirectory',
        defaultIcon: 'directory',
        keywords: 'active directory ldap ad домен каталог',
      },
    ],
  },
  {
    id: 'system',
    labelKey: 'settings.groups.system',
    items: [
      {
        id: 'system',
        defaultIcon: 'server',
        keywords: 'system version database rate limit uptime система версия база лимит',
      },
    ],
  },
];

export const SETTINGS_ROOT = '/admin/settings';

/** Flat list of settings screens with derived path / i18n keys. */
export const SETTINGS_ITEMS = SETTINGS_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    group: group.id,
    groupLabelKey: group.labelKey,
    key: `${SETTINGS_ROOT}/${item.id}`,
    path: `${SETTINGS_ROOT}/${item.id}`,
    labelKey: `settings.${item.id}.title`,
    descKey: `settings.${item.id}.desc`,
  }))
);

export function findSettingsItem(pathname) {
  return SETTINGS_ITEMS.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
  );
}

/** Old URLs from the first version of the skeleton → new locations. */
export const LEGACY_ADMIN_ROUTES = {
  general: 'settings/general',
  appearance: 'settings/theme',
  typography: 'settings/typography',
  icons: 'settings/icons',
  'integrations/email': 'settings/email',
  'integrations/telegram': 'settings/telegram',
  'integrations/whatsapp': 'settings/whatsapp',
  'integrations/ad': 'settings/ad',
  security: 'settings/login',
  'security/ip': 'settings/ip',
  'security/history': 'activity',
};
