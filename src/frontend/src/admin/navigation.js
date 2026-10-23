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

import { SETTINGS_VIEW } from '../lib/access';

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
    permissions: SETTINGS_VIEW,
    keywords: 'settings preferences configuration настройки параметры',
  },
  {
    key: '/admin/integrations',
    labelKey: 'nav.integrations',
    descKey: 'nav.integrationsDesc',
    defaultIcon: 'integrations',
    permissions: ['settings.view', 'settings.integrations'],
    keywords: 'integrations email telegram whatsapp wazzup mattermost google documents active directory sms интеграции почта телеграм ватсап гугл каталог смс',
  },
  {
    key: '/admin/modules',
    labelKey: 'nav.modules',
    descKey: 'nav.modulesDesc',
    defaultIcon: 'apps',
    permissions: ['settings.view', 'settings.modules'],
    keywords: 'modules apps applications enable dashboard chat files crm tasks remote модули приложения включить дашборд чат файлы задачи',
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
        keywords: 'name brand logo description region time zone date format week название логотип бренд описание регион часовой пояс время дата формат неделя',
      },
      {
        // Interface languages: superadministrators only (enforced by the API too).
        id: 'languages',
        defaultIcon: 'globe',
        permission: '*',
        keywords: 'languages language locale translation default browser english russian kyrgyz turkish chinese языки язык локализация перевод по умолчанию браузер русский английский кыргызский турецкий китайский',
      },
      {
        id: 'legalEntities',
        defaultIcon: 'building',
        keywords: 'legal entities companies payer tax id inn bank details юрлица юридические лица плательщик инн реквизиты организации',
      },
      {
        id: 'org',
        defaultIcon: 'layers',
        permission: 'org.manage',
        keywords: 'org structure organization chart units departments branches offices sites heads оргструктура оргсхема подразделения отделы филиалы офисы объекты руководители',
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
    section: 'integrations',
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
        id: 'isms',
        integration: 'isms',
        defaultIcon: 'sms',
        keywords: 'isms sms gateway android phone sim text message смс шлюз телефон сим',
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
    section: 'modules',
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
        id: 'approvals',
        defaultIcon: 'inbox',
        keywords: 'approvals routes urgency sla substitutes inbox согласования маршруты срочность сроки замещения заместитель ждёт меня входящие',
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
    // Which top-level console section owns this screen: Settings, Integrations or Modules.
    section: group.section || 'settings',
    key: `${SETTINGS_ROOT}/${item.id}`,
    path: `${SETTINGS_ROOT}/${item.id}`,
    labelKey: `settings.${item.id}.title`,
    descKey: `settings.${item.id}.desc`,
  }))
);

/**
 * Settings → <module> of an installed module package (platform/packages/loader.js,
 * before the first render): an item of the «modules» group, like a built-in module's.
 * `labelKey` / `descKey` default to settings.<id>.title / .desc.
 */
export function addPackageSettingsItem({ id, icon, keywords = '', labelKey, descKey }) {
  const group = SETTINGS_GROUPS.find((item) => item.id === 'modules');
  if (!group || SETTINGS_ITEMS.some((item) => item.id === id)) return null;
  const item = { id, defaultIcon: icon || 'apps', keywords, package: true };
  group.items.push(item);
  const entry = {
    ...item,
    permission: group.permission,
    group: group.id,
    groupLabelKey: group.labelKey,
    // The console section that owns it (sidebar highlight, back link): without it the screen does not render.
    section: group.section || 'settings',
    key: `${SETTINGS_ROOT}/${id}`,
    path: `${SETTINGS_ROOT}/${id}`,
    labelKey: labelKey || `settings.${id}.title`,
    descKey: descKey || `settings.${id}.desc`,
  };
  SETTINGS_ITEMS.push(entry);
  return entry;
}

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

/**
 * Top-level console sections. Integrations and Modules were promoted out of
 * Settings into their own sidebar entries; their screens still live under
 * /admin/settings/<id>, but navigation (sidebar highlight, hub, side-nav, back
 * link) is scoped by the section an item belongs to.
 */
export const SECTIONS = {
  settings: { path: SETTINGS_ROOT, labelKey: 'nav.settings', leadKey: 'nav.settingsDesc', titleKey: 'settings.title', hubLeadKey: 'settings.lead', backKey: 'settings.back' },
  integrations: { path: '/admin/integrations', labelKey: 'nav.integrations', leadKey: 'nav.integrationsDesc', titleKey: 'nav.integrations', hubLeadKey: 'nav.integrationsDesc', backKey: 'nav.integrations' },
  modules: { path: '/admin/modules', labelKey: 'nav.modules', leadKey: 'nav.modulesDesc', titleKey: 'nav.modules', hubLeadKey: 'nav.modulesDesc', backKey: 'nav.modules' },
};

/** The console section (settings | integrations | modules) that owns a path. */
export function sectionForPath(pathname) {
  const item = findSettingsItem(pathname);
  if (item) return item.section;
  if (pathname.startsWith('/admin/integrations')) return 'integrations';
  if (pathname.startsWith('/admin/modules')) return 'modules';
  return 'settings';
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
