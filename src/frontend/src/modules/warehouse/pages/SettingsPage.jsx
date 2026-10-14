import { useCallback, useEffect, useState } from 'react';
import { App, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { Hero } from '../components/bits';
import SettingsForm from '../settings/SettingsForm';

/** /app/warehouse/settings for warehouse administrators (no console rights needed). */
export default function SettingsPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { reload } = useWh();
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    whApi.settings().then((res) => setSettings(res.data.settings)).catch((err) => message.error(errorMessage(err)));
  }, [message]);
  const save = useCallback(
    async (values) => {
      const res = await whApi.saveSettings(values);
      setSettings(res.data.settings);
      reload();
    },
    [reload]
  );
  return (
    <div className="wh-page wh-settings">
      <Hero icon="general" title={t('wh.nav.settings')} lead={t('wh.settings.lead')} />
      {settings ? <SettingsForm settings={settings} save={save} /> : <Skeleton active />}
    </div>
  );
}
