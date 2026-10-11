import { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, ConfigProvider, Select } from 'antd';
import { MenuIcon } from '../components/icons/menuIcons';
import { SETTINGS_GROUPS, SETTINGS_ROOT, findSettingsItem, visibleSettingsItems } from '../admin/navigation';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { useThemeMode } from '../context/ThemeContext';
import { PageFallback } from './AdminLayout';
import PageTransition from '../components/ui/PageTransition';

function IntegrationDot({ item }) {
  const { settings } = useSettings();
  if (!item.integration) return null;
  const on = Boolean(settings?.integrations?.[item.integration]?.enabled);
  return <span className={`status-dot${on ? ' is-on' : ''}`} aria-hidden="true" />;
}

/**
 * Settings area: the hub (/admin/settings) is full width; every screen below
 * it gets a grouped side navigation, which turns into a select on mobile.
 */
export default function SettingsLayout() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();
  const isHub = location.pathname.replace(/\/$/, '') === SETTINGS_ROOT;
  const current = findSettingsItem(location.pathname);
  const { can } = useAuth();
  const items = visibleSettingsItems(can);
  // Viewing with settings.view only: every control on the screen is disabled.
  const readOnly = Boolean(current && !can(current.permission));
  const groups = SETTINGS_GROUPS.filter((group) => items.some((item) => item.group === group.id));

  if (isHub) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    );
  }

  return (
    <div className="settings-shell">
      <aside className="settings-nav" aria-label={t('settings.title')}>
        <NavLink to={SETTINGS_ROOT} end className="settings-nav__home">
          <span aria-hidden="true">←</span> {t('settings.back')}
        </NavLink>
        {groups.map((group) => (
          <div key={group.id} className="settings-nav__group">
            <div className="settings-nav__label">{t(group.labelKey)}</div>
            {items.filter((item) => item.group === group.id).map((item) => (
              <NavLink key={item.key} to={item.path} className="settings-nav__item">
                <MenuIcon slot={item.key} appearance={appearance} />
                <span>{t(item.labelKey)}</span>
                <IntegrationDot item={item} />
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="settings-mobile-nav">
        <Select
          value={current?.path}
          onChange={(path) => navigate(path)}
          style={{ width: '100%' }}
          size="large"
          options={groups.map((group) => ({
            label: t(group.labelKey),
            options: items.filter((item) => item.group === group.id).map((item) => ({
              value: item.path,
              label: t(item.labelKey),
            })),
          }))}
        />
      </div>
      <div className="settings-content">
        {readOnly && (
          <Alert type="info" showIcon className="page-alert" message={t('settings.readOnly')} />
        )}
        <ConfigProvider componentDisabled={readOnly}>
          <Suspense fallback={<PageFallback />}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Suspense>
        </ConfigProvider>
      </div>
    </div>
  );
}
