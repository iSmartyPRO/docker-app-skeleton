import { Link } from 'react-router-dom';
import { Button, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../../components/ui/PageHeader';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { SETTINGS_ITEMS } from '../../../admin/navigation';
import { useLocale } from '../../../context/LocaleContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { hasAdminDocs } from '../../../modules/manifest';
import './platform.css';

/**
 * Title, description and icon for a settings screen, read from the registry.
 * A module's settings screen also gets «About the module» (its admin docs).
 */
export default function SettingsPageHeader({ id, extra }) {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const item = SETTINGS_ITEMS.find((entry) => entry.id === id);
  if (!item) return null;
  const docs = item.group === 'modules' && hasAdminDocs(id) ? (
    <Tooltip title={t('platform.docs.title')}>
      <Link to={`/admin/modules/${id}/docs`}>
        <Button icon={<QuestionCircleOutlined />}>{t('platform.docs.title')}</Button>
      </Link>
    </Tooltip>
  ) : null;
  return (
    <PageHeader
      eyebrow={t(item.groupLabelKey)}
      title={t(item.labelKey)}
      description={t(item.descKey)}
      icon={<MenuIcon slot={item.key} appearance={appearance} />}
      extra={
        docs || extra ? (
          <div className="pf-header-extra">
            {docs}
            {extra}
          </div>
        ) : undefined
      }
    />
  );
}
