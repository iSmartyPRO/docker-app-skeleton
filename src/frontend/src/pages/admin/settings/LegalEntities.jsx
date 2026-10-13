import { useMemo } from 'react';
import api from '../../../services/api';
import { useLocale } from '../../../context/LocaleContext';
import { SettingsSection } from '../../../components/ui/SettingsSection';
import LegalEntitiesEditor from '../../../modules/procurement/settings/LegalEntitiesEditor';
import SettingsPageHeader from './SettingsPageHeader';
import '../../../modules/procurement/procurement.css';

/** Settings → Project → Legal entities: the shared directory used by Procurement and Contracts. */
export default function LegalEntitiesSettings() {
  const { t } = useLocale();
  const entitiesApi = useMemo(
    () => ({
      list: () => api.get('/admin/legal-entities'),
      create: (payload) => api.post('/admin/legal-entities', payload),
      update: (id, payload) => api.put(`/admin/legal-entities/${id}`, payload),
      archive: (id) => api.delete(`/admin/legal-entities/${id}`),
    }),
    []
  );
  return (
    <>
      <SettingsPageHeader id="legalEntities" />
      <SettingsSection description={t('legalEntities.lead')}>
        <LegalEntitiesEditor api={entitiesApi} />
      </SettingsSection>
    </>
  );
}
