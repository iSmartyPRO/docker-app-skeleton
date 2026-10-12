import {
  IconBell,
  IconBolt,
  IconBox,
  IconCalendar,
  IconChart,
  IconChat,
  IconDashboard,
  IconDirectory,
  IconFile,
  IconGeneral,
  IconGlobe,
  IconHome,
  IconIntegrations,
  IconKey,
  IconLayers,
  IconLock,
  IconMail,
  IconNetwork,
  IconPalette,
  IconApps,
  IconPeople,
  IconProject,
  IconServer,
  IconShield,
  IconSpark,
  IconStar,
  IconTag,
  IconTelegram,
  IconType,
  IconUser,
  IconMattermost,
  IconGoogle,
  IconWazzup,
  IconWhatsapp,
} from './AdminIcons';
import { PREMIUM_ICONS } from './premiumIcons';
import {
  ADMIN_PAGES,
  LEGACY_ADMIN_ROUTES,
  SETTINGS_GROUPS,
  SETTINGS_ITEMS,
} from '../../admin/navigation';

export const ICON_CATALOG = {
  dashboard: IconDashboard,
  project: IconProject,
  general: IconGeneral,
  palette: IconPalette,
  type: IconType,
  apps: IconApps,
  integrations: IconIntegrations,
  mail: IconMail,
  telegram: IconTelegram,
  whatsapp: IconWhatsapp,
  wazzup: IconWazzup,
  mattermost: IconMattermost,
  google: IconGoogle,
  directory: IconDirectory,
  people: IconPeople,
  user: IconUser,
  shield: IconShield,
  lock: IconLock,
  network: IconNetwork,
  home: IconHome,
  star: IconStar,
  bolt: IconBolt,
  chart: IconChart,
  calendar: IconCalendar,
  file: IconFile,
  globe: IconGlobe,
  key: IconKey,
  bell: IconBell,
  box: IconBox,
  chat: IconChat,
  server: IconServer,
  tag: IconTag,
  layers: IconLayers,
  spark: IconSpark,
  ...PREMIUM_ICONS,
};

export const ICON_IDS = Object.keys(ICON_CATALOG);

/**
 * Every icon slot the editor exposes, grouped the way the console shows them.
 * Built from the navigation registry so new screens get a slot automatically.
 */
export const MENU_SLOT_GROUPS = [
  {
    id: 'sidebar',
    labelKey: 'settings.icons.sidebar',
    slots: ADMIN_PAGES.map((page) => ({
      key: page.key,
      labelKey: page.labelKey,
      defaultIcon: page.defaultIcon,
    })),
  },
  ...SETTINGS_GROUPS.map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    slots: SETTINGS_ITEMS.filter((item) => item.group === group.id).map((item) => ({
      key: item.key,
      labelKey: item.labelKey,
      defaultIcon: item.defaultIcon,
    })),
  })),
];

export const MENU_SLOTS = MENU_SLOT_GROUPS.flatMap((group) => group.slots);

// Icon choices saved by the first skeleton version used the old route keys.
const LEGACY_SLOT_KEYS = Object.fromEntries(
  Object.entries(LEGACY_ADMIN_ROUTES).map(([from, to]) => [`/admin/${to}`, `/admin/${from}`])
);

export function defaultMenuIcons() {
  return Object.fromEntries(MENU_SLOTS.map((slot) => [slot.key, slot.defaultIcon]));
}

export function resolveIconStyle(appearance) {
  return appearance?.icons?.style === 'mono' ? 'mono' : 'colored';
}

// Former default icons: a saved menu still holding one follows the new default.
const RETIRED_DEFAULTS = { '/admin/settings/kb': 'book' };

export function resolveIconId(appearance, slotKey) {
  const menu = appearance?.icons?.menu || {};
  const chosen = menu[slotKey] || menu[LEGACY_SLOT_KEYS[slotKey]];
  if (chosen && ICON_CATALOG[chosen] && RETIRED_DEFAULTS[slotKey] !== chosen) return chosen;
  return MENU_SLOTS.find((slot) => slot.key === slotKey)?.defaultIcon || 'dashboard';
}

export function MenuIcon({ slot, name, variant, appearance }) {
  const style = variant || resolveIconStyle(appearance);
  const id = name || resolveIconId(appearance, slot);
  const Icon = ICON_CATALOG[id] || IconDashboard;
  return <Icon variant={style} />;
}
