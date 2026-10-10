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
    permission: 'console.access',
    keywords: 'dashboard home overview обзор главная',
  },
  {
    key: '/admin/users',
    labelKey: 'nav.users',
    descKey: 'nav.usersDesc',
    defaultIcon: 'people',
    permission: 'users.view',
    keywords: 'users people accounts пользователи люди учётные записи',
  },
  {
    key: '/admin/groups',
    labelKey: 'nav.groups',
    descKey: 'nav.groupsDesc',
    defaultIcon: 'layers',
    permission: 'users.view',
    keywords: 'groups teams departments группы отделы команды',
  },
  {
    key: '/admin/roles',
    labelKey: 'nav.roles',
    descKey: 'nav.rolesDesc',
    defaultIcon: 'key',
    permission: 'users.view',
    keywords: 'roles permissions access rbac роли права доступ разрешения',
  },
  {
    key: '/admin/activity',
    labelKey: 'nav.activity',
    descKey: 'nav.activityDesc',
    defaultIcon: 'bell',
    permission: 'activity.view',
    keywords: 'activity audit log security events журнал события аудит',
  },
  {
    key: '/admin/settings',
    labelKey: 'nav.settings',
    descKey: 'nav.settingsDesc',
    defaultIcon: 'general',
    permissions: ['settings.view', 'settings.general', 'settings.security', 'settings.auth', 'settings.integrations', 'settings.system'],
    keywords: 'settings preferences configuration настройки параметры',
  },
];

export const SETTINGS_GROUPS = [
  {
    id: 'project',
    labelKey: 'settings.groups.project',
    permission: 'settings.general',
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
    permission: 'settings.general',
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
    permission: 'settings.security',
    items: [
      {
        id: 'signin',
        defaultIcon: 'shield',
        permission: 'settings.auth',
        keywords:
          'sign-in login methods sso ldap active directory telegram whatsapp email code otp magic link способы входа код ссылка',
      },
      {
        id: 'access',
        defaultIcon: 'globe',
        keywords: 'access open closed public private доступ открытый закрытый публичный',
      },
      {
        id: 'login',
        defaultIcon: 'lock',
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
    permission: 'settings.integrations',
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
        id: 'wazzup',
        integration: 'wazzup',
        defaultIcon: 'wazzup',
        keywords: 'wazzup wazzup24 whatsapp telegram instagram avito messenger омниканал мессенджеры',
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
    permission: 'settings.system',
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
    // Editing needs this permission; viewing also works with settings.view.
    permission: item.permission || group.permission,
    group: group.id,
    groupLabelKey: group.labelKey,
    key: `${SETTINGS_ROOT}/${item.id}`,
    path: `${SETTINGS_ROOT}/${item.id}`,
    labelKey: `settings.${item.id}.title`,
    descKey: `settings.${item.id}.desc`,
  }))
);

/** Settings screens the user may open (view-only with settings.view). */
export function visibleSettingsItems(can) {
  return SETTINGS_ITEMS.filter((item) => can('settings.view') || can(item.permission));
}

export function visibleAdminPages(canAny) {
  return ADMIN_PAGES.filter((page) => canAny(page.permissions || [page.permission]));
}

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
