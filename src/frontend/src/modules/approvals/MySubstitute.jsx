import PageHeader from '../../components/ui/PageHeader';
import { SettingsSection } from '../../components/ui/SettingsSection';
import { useLocale } from '../../context/LocaleContext';
import SubstitutesPanel from './settings/SubstitutesPanel';
import './approvals.css';

/** Account → «Мой заместитель»: who decides my approvals while I am away. */
export default function MySubstitute() {
  const { t } = useLocale();
  return (
    <div className="narrow-page">
      <PageHeader title={t('approvals.substitutes.pageTitle')} description={t('approvals.substitutes.pageLead')} />
      <SettingsSection>
        <SubstitutesPanel />
      </SettingsSection>
    </div>
  );
}
