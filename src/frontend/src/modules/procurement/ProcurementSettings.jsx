import { Link } from 'react-router-dom';
import LoadState from '../../components/ui/LoadState';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useLocale } from '../../context/LocaleContext';
import SettingsForm from './settings/SettingsForm';
import './procurement.css';

/** Settings → Modules → Procurement (console administrators with settings.modules). */
export default function ProcurementSettings() {
  const { t } = useLocale();
  const { settings, ready, error, refresh, save } = useAdminSettings();
  const module = settings?.modules?.procurement;
  return (
    <>
      <SettingsPageHeader id="procurement" />
      <p className="section-footnote">
        {t('procurement.settings.consoleNote')} <Link to="/admin/settings/legalEntities">{t('legalEntities.title')} →</Link>
      </p>
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {module && <SettingsForm settings={module.settings} save={(values) => save({ modules: { procurement: { settings: values } } })} />}
      </LoadState>
    </>
  );
}
