import { Link } from 'react-router-dom';
import { Empty } from 'antd';
import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';
import { MenuIcon } from '../components/icons/menuIcons';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { enabledModules } from '../modules/registry';
import InstallBanner from '../pwa/InstallBanner';

/** /apps — launcher with every enabled module. */
export default function Apps() {
  const { t } = useLocale();
  const { settings } = useSettings();
  const modules = enabledModules(settings);
  return (
    <div className="shell">
      <Chrome />
      <main className="shell__main apps-page">
        <InstallBanner />
        <header className="page-header">
          <div className="page-header__text">
            <h1 className="apps-page__title">{t('apps.title')}</h1>
            <p className="page-header__lead ant-typography">{t('apps.lead')}</p>
          </div>
        </header>
        {modules.length === 0 ? (
          <Empty description={t('apps.none')} />
        ) : (
          <div className="apps-grid">
            {modules.map((module) => (
              <Link key={module.id} to={module.path} className="app-tile">
                <span className="app-tile__icon">
                  <MenuIcon name={module.icon} />
                </span>
                <strong>{t(module.labelKey)}</strong>
                <span>{t(module.descKey)}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
