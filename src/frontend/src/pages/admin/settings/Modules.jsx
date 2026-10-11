import { Link } from 'react-router-dom';
import { App, Switch, Tag } from 'antd';
import LoadState from '../../../components/ui/LoadState';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { MODULE_REGISTRY } from '../../../modules/registry';
import SettingsPageHeader from './SettingsPageHeader';

/** All modules with an on/off switch; each links to its own settings and app. */
export default function ModulesSettings() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings, ready, error, refresh, save } = useAdminSettings();

  const toggle = async (id, enabled) => {
    try {
      await save({ modules: { [id]: { enabled } } });
      message.success(enabled ? t('modules.enabled') : t('modules.disabled'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      <SettingsPageHeader id="modules" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        <div className="module-list">
          {MODULE_REGISTRY.map((module) => {
            const state = settings?.modules?.[module.id] || {};
            return (
              <section key={module.id} className={`module-card${state.enabled ? ' is-on' : ''}`}>
                <span className="module-card__icon">
                  <MenuIcon name={module.icon} />
                </span>
                <div className="module-card__body">
                  <div className="module-card__title">
                    <strong>{t(module.labelKey)}</strong>
                    <Tag bordered={false} color={state.enabled ? 'green' : 'default'}>
                      {state.enabled ? t('settings.integration.on') : t('settings.integration.off')}
                    </Tag>
                    <code>{module.path}</code>
                  </div>
                  <p>{t(module.descKey)}</p>
                  <div className="module-card__links">
                    <Link to={`/admin/settings/${module.id}`}>{t('modules.settings')} →</Link>
                    {state.enabled && <Link to={module.path}>{t('modules.open')} ↗</Link>}
                  </div>
                </div>
                <Switch checked={Boolean(state.enabled)} onChange={(value) => toggle(module.id, value)} />
              </section>
            );
          })}
        </div>
        <p className="section-footnote">{t('modules.footnote')}</p>
      </LoadState>
    </>
  );
}
