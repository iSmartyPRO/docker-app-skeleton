import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Skeleton, Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { errorMessage } from '../../../lib/errors';
import { procApi } from '../api';
import { useProc } from '../ProcContext';
import SettingsForm from '../settings/SettingsForm';
import LegalEntitiesEditor from '../settings/LegalEntitiesEditor';

/** /app/procurement/settings for procurement administrators (no console rights needed). */
export default function SettingsPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { reload } = useProc();
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    procApi.settings().then((res) => setSettings(res.data.settings)).catch((err) => message.error(errorMessage(err)));
  }, [message]);
  const save = useCallback(async (values) => {
    const res = await procApi.saveSettings(values);
    setSettings(res.data.settings);
    reload();
  }, [reload]);
  const entitiesApi = useMemo(() => ({ list: () => procApi.legalEntities(true), create: procApi.createLegalEntity, update: procApi.updateLegalEntity, archive: procApi.archiveLegalEntity }), []);
  return (
    <div className="prc-page prc-settings">
      <header className="mod-hero prc-hero">
        <span className="mod-hero__badge" aria-hidden="true">
          <MenuIcon name="general" />
        </span>
        <div className="mod-hero__text">
          <h1>{t('procurement.nav.settings')}</h1>
          <p>{t('procurement.settings.lead')}</p>
        </div>
      </header>
      <Tabs
        items={[
          { key: 'general', label: t('procurement.settings.general'), children: settings ? <SettingsForm settings={settings} save={save} /> : <Skeleton active /> },
          { key: 'entities', label: t('legalEntities.title'), children: <LegalEntitiesEditor api={entitiesApi} onChanged={reload} /> },
        ]}
      />
    </div>
  );
}
