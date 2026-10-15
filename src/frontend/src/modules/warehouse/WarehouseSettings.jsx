import LoadState from '../../components/ui/LoadState';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import ModuleEnableSwitch from '../../pages/admin/settings/ModuleEnableSwitch';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useLocale } from '../../context/LocaleContext';
import SettingsForm from './settings/SettingsForm';
import './warehouse.css';

/** Settings → Modules → Warehouse (console administrators with settings.modules). */
export default function WarehouseSettings() {
  const { t } = useLocale();
  const { settings, ready, error, refresh, save } = useAdminSettings();
  const module = settings?.modules?.warehouse;
  return (
    <>
      <SettingsPageHeader id="warehouse" />
      <p className="section-footnote">{t('wh.settings.consoleNote')}</p>
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {module && <ModuleEnableSwitch id="warehouse" enabled={module.enabled} save={save} path="/app/warehouse" />}
        {module && <SettingsForm settings={module.settings} save={(values) => save({ modules: { warehouse: { settings: values } } })} />}
      </LoadState>
    </>
  );
}
