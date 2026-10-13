import { Link } from 'react-router-dom';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { useLocale } from '../../context/LocaleContext';
import ApprovalsAdmin from './settings/ApprovalsAdmin';

/** Settings → Modules → Approvals: the same administration as /app/approvals/settings. */
export default function ApprovalsSettings() {
  const { t } = useLocale();
  return (
    <>
      <SettingsPageHeader id="approvals" />
      <p className="section-footnote apr-settings-note">
        {t('approvals.settings.alwaysOn')} <Link to="/app/approvals">{t('approvals.inbox.title')} →</Link>
      </p>
      <ApprovalsAdmin />
    </>
  );
}
