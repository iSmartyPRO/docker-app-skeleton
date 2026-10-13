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
    key: '/admin/api',
    labelKey: 'nav.api',
    descKey: 'nav.apiDesc',
    defaultIcon: 'code',
    permission: 'api.admin',
    keywords: 'api tokens webhooks integrations rest openapi developers токены вебхуки интеграции разработчики',
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
        id: 'notifications',
        defaultIcon: 'bell',
        keywords: 'notifications delivery channels whatsapp wazzup telegram mattermost email push уведомления доставка каналы ватсап',
      },
      {
        id: 'mattermost',
        integration: 'mattermost',
        defaultIcon: 'mattermost',
        keywords: 'mattermost chat bot team messenger alerts notifications чат бот уведомления',
      },
      {
        id: 'google',
        integration: 'google',
        defaultIcon: 'google',
        keywords: 'google oauth sign-in calendar gmail workspace sso гугл вход календарь почта',
      },
      {
        id: 'documents',
        integration: 'documents',
        defaultIcon: 'file',
        keywords: 'collabora libreoffice office word excel powerpoint pdf conversion preview конвертация документы просмотр',
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
    id: 'modules',
    labelKey: 'settings.groups.modules',
    permission: 'settings.modules',
    items: [
      {
        id: 'modules',
        defaultIcon: 'apps',
        keywords: 'modules apps applications enable модули приложения включить',
      },
      {
        id: 'dashboard',
        defaultIcon: 'dashboard',
        keywords: 'dashboard widgets home charts дашборд виджеты главная графики сводка',
      },
      {
        id: 'chat',
        defaultIcon: 'chat',
        keywords: 'chat messenger messages calls чат мессенджер сообщения звонки переписка',
      },
      {
        id: 'files',
        defaultIcon: 'folder',
        keywords: 'files drive storage share links quota trash файлы хранилище диск доступ ссылки квота корзина',
      },
      {
        id: 'companies',
        defaultIcon: 'building',
        keywords: 'companies counterparties contacts crm clients suppliers inn dadata minjust контрагенты компании контакты клиенты поставщики инн минюст',
      },
      {
        id: 'resources',
        defaultIcon: 'compass',
        keywords: 'online resources links home page bookmarks icons онлайн ресурсы ссылки главная страница закладки иконки',
      },
      {
        id: 'drive',
        defaultIcon: 'server',
        keywords: 'drive file server smb share dfs network windows active directory сетевой диск файловый сервер шара папки',
      },
      {
        id: 'kb',
        defaultIcon: 'graduation',
        keywords: 'knowledge base kb documents files folders sharing база знаний документы папки ссылки',
      },
      {
        id: 'tasks',
        defaultIcon: 'tasks',
        keywords: 'tasks projects kanban board todo задачи проекты канбан доска',
      },
      {
        id: 'crm',
        defaultIcon: 'target',
        keywords: 'crm deals pipeline sales funnel kanban leads clients activities сделки воронка продажи лиды клиенты дела срм црм',
      },
      {
        id: 'assistant',
        defaultIcon: 'robot',
        keywords: 'assistant robot helper avatar tips помощник робот подсказки аватар',
      },
      {
        id: 'calendar',
        defaultIcon: 'calendar',
        keywords: 'calendar events meetings reminders календарь события встречи напоминания',
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

/** Pretty settings URL for a module: /admin/settings/<moduleId>. */
export const MODULE_SETTINGS_PATH = (id) => `${SETTINGS_ROOT}/${id}`;
