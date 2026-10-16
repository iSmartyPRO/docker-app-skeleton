import { Link } from 'react-router-dom';
import { BulbOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { moduleName } from '../modules/platformUi';
import '../pages/admin/settings/platform.css';

/**
 * A quiet hint where a feature hides because an optional linked module is off
 * (a manifest `enhances` link): «Включите «Контрагенты», чтобы выбирать
 * поставщиков из справочника». Renders nothing while the module is on.
 *
 *   <ModuleHint module="companies" what={t('platform.hintWhat.procurementSupplier')} />
 *
 * `what` completes the sentence after «to …» (lower case, no full stop);
 * without it a short «Available with the X module» is shown. People who may
 * switch modules on get a link to the Modules page.
 */
export default function ModuleHint({ module, what, className = '' }) {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { can } = useAuth();
  if (!settings?.modules?.[module] || settings.modules[module].enabled) return null;
  const name = moduleName(module, t);
  return (
    <div className={`pf-hint ${className}`} role="note">
      <BulbOutlined className="pf-hint__icon" aria-hidden="true" />
      <span className="pf-hint__text">{what ? t('platform.hint.text', { module: name, what }) : t('platform.hint.short', { module: name })}</span>
      {can('settings.modules') && (
        <Link className="pf-hint__action" to={`/admin/settings/modules?focus=${encodeURIComponent(module)}`}>
          {t('platform.hint.action')}
        </Link>
      )}
    </div>
  );
}
