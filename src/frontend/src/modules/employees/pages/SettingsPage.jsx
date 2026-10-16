import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import ModuleHeader from '../../shared/ModuleHeader';
import { EmployeesSettingsForm } from '../EmployeesSettings';

/** /app/employees/settings — the module settings for employees.admin without the console. */
export default function SettingsPage() {
  const { t } = useLocale();
  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'settings', label: t('emp.nav.settings') }]}
        icon={<MenuIcon name="general" />}
        title={t('emp.nav.settings')}
        description={t('settings.employees.desc')}
      />
      <EmployeesSettingsForm />
    </div>
  );
}
