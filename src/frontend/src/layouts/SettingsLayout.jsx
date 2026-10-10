import { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Select } from 'antd';
import { MenuIcon } from '../components/icons/menuIcons';
import { SETTINGS_GROUPS, SETTINGS_ITEMS, SETTINGS_ROOT, findSettingsItem } from '../admin/navigation';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { useThemeMode } from '../context/ThemeContext';
import { PageFallback } from './AdminLayout';

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
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.id} className="settings-nav__group">
            <div className="settings-nav__label">{t(group.labelKey)}</div>
            {SETTINGS_ITEMS.filter((item) => item.group === group.id).map((item) => (
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
          options={SETTINGS_GROUPS.map((group) => ({
            label: t(group.labelKey),
            options: SETTINGS_ITEMS.filter((item) => item.group === group.id).map((item) => ({
              value: item.path,
              label: t(item.labelKey),
            })),
          }))}
        />
      </div>
      <div className="settings-content">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
