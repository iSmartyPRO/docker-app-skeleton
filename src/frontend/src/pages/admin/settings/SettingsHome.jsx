import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Input } from 'antd';
import PageHeader from '../../../components/ui/PageHeader';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { matchesQuery } from '../../../lib/search';
import { SETTINGS_GROUPS, visibleSettingsItems } from '../../../admin/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { useThemeMode } from '../../../context/ThemeContext';

export default function SettingsHome() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const { can } = useAuth();

  const items = useMemo(() => {
    return visibleSettingsItems(can).filter((item) =>
      matchesQuery(`${t(item.labelKey)} ${t(item.descKey)} ${t(item.groupLabelKey)} ${item.keywords}`, query)
    );
  }, [query, t, can]);

  return (
    <div className="settings-home">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.lead')}
        extra={
          <Input.Search
            allowClear
            size="large"
            placeholder={t('settings.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="settings-home__search"
          />
        }
      />
      {items.length === 0 && (
        <Empty description={t('settings.nothingFound', { query })} style={{ marginTop: 48 }} />
      )}
      {SETTINGS_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group.id);
        if (!groupItems.length) return null;
        return (
          <section key={group.id} className="settings-home__group">
            <h2 className="settings-home__group-title">{t(group.labelKey)}</h2>
            <div className="settings-tiles">
              {groupItems.map((item) => {
                const integrationOn = item.integration
                  ? Boolean(settings?.integrations?.[item.integration]?.enabled)
                  : null;
                return (
                  <Link key={item.key} to={item.path} className="settings-tile">
                    <span className="settings-tile__icon">
                      <MenuIcon slot={item.key} appearance={appearance} />
                    </span>
                    <span className="settings-tile__body">
                      <span className="settings-tile__title">
                        {t(item.labelKey)}
                        {integrationOn !== null && (
                          <span className={`pill${integrationOn ? ' is-on' : ''}`}>
                            {integrationOn ? t('settings.integration.on') : t('settings.integration.off')}
                          </span>
                        )}
                      </span>
                      <span className="settings-tile__desc">{t(item.descKey)}</span>
                    </span>
                    <span className="settings-tile__chevron" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
