import PageHeader from '../../../components/ui/PageHeader';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { SETTINGS_ITEMS } from '../../../admin/navigation';
import { useLocale } from '../../../context/LocaleContext';
import { useThemeMode } from '../../../context/ThemeContext';

/** Title, description and icon for a settings screen, read from the registry. */
export default function SettingsPageHeader({ id, extra }) {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const item = SETTINGS_ITEMS.find((entry) => entry.id === id);
  if (!item) return null;
  return (
    <PageHeader
      eyebrow={t(item.groupLabelKey)}
      title={t(item.labelKey)}
      description={t(item.descKey)}
      icon={<MenuIcon slot={item.key} appearance={appearance} />}
      extra={extra}
    />
  );
}
