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
  IconWhatsapp,
} from './AdminIcons';
import { PREMIUM_ICONS } from './premiumIcons';

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

export const MENU_SLOTS = [
  { key: '/admin', labelKey: 'admin.dashboard', defaultIcon: 'dashboard' },
  { key: 'project', labelKey: 'admin.project', defaultIcon: 'project' },
  { key: '/admin/general', labelKey: 'admin.general', defaultIcon: 'general', depth: 1 },
  { key: 'appearance', labelKey: 'admin.appearance', defaultIcon: 'palette', depth: 1 },
  { key: '/admin/appearance', labelKey: 'admin.theme', defaultIcon: 'palette', depth: 2 },
  { key: '/admin/typography', labelKey: 'admin.typography', defaultIcon: 'type', depth: 2 },
  { key: '/admin/icons', labelKey: 'admin.iconStyle', defaultIcon: 'apps', depth: 2 },
  { key: 'integrations', labelKey: 'admin.integrations', defaultIcon: 'integrations' },
  { key: '/admin/integrations/email', labelKey: 'admin.email', defaultIcon: 'mail', depth: 1 },
  { key: '/admin/integrations/telegram', labelKey: 'admin.telegram', defaultIcon: 'telegram', depth: 1 },
  { key: '/admin/integrations/whatsapp', labelKey: 'admin.whatsapp', defaultIcon: 'whatsapp', depth: 1 },
  { key: '/admin/integrations/ad', labelKey: 'admin.ad', defaultIcon: 'directory', depth: 1 },
  { key: 'people', labelKey: 'admin.people', defaultIcon: 'people' },
  { key: '/admin/users', labelKey: 'admin.users', defaultIcon: 'user', depth: 1 },
  { key: 'security', labelKey: 'admin.security', defaultIcon: 'shield' },
  { key: '/admin/security', labelKey: 'admin.access', defaultIcon: 'lock', depth: 1 },
  { key: '/admin/security/ip', labelKey: 'admin.ipLists', defaultIcon: 'network', depth: 1 },
  { key: '/admin/security/history', labelKey: 'admin.history', defaultIcon: 'bell', depth: 1 },
];

export function defaultMenuIcons() {
  return Object.fromEntries(MENU_SLOTS.map((slot) => [slot.key, slot.defaultIcon]));
}

export function resolveIconStyle(appearance) {
  return appearance?.icons?.style === 'mono' ? 'mono' : 'colored';
}

export function resolveIconId(appearance, slotKey) {
  const chosen = appearance?.icons?.menu?.[slotKey];
  if (chosen && ICON_CATALOG[chosen]) return chosen;
  return MENU_SLOTS.find((slot) => slot.key === slotKey)?.defaultIcon || 'dashboard';
}

export function MenuIcon({ slot, name, variant, appearance }) {
  const style = variant || resolveIconStyle(appearance);
  const id = name || resolveIconId(appearance, slot);
  const Icon = ICON_CATALOG[id] || IconDashboard;
  return <Icon variant={style} />;
}
