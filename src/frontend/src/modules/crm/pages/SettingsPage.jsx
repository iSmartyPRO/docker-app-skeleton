import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import LoadState from '../../../components/ui/LoadState';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { CrmForm } from '../CrmSettings';

/**
 * /app/crm/settings — CRM administrators change the module's settings here
 * without the console's rights (GET/PUT /api/app/crm/settings).
 */
export default function SettingsPage() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { canAdmin, refresh } = useCrm();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    crmApi
      .settings()
      .then((res) => {
        setSettings(res.data.settings);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    if (canAdmin) load();
  }, [load, canAdmin]);
  const state = useMemo(() => ({ enabled: true, settings: settings || {} }), [settings]);

  if (!canAdmin) return <Navigate to="/app/crm" replace />;

  return (
    <div className="crm-page crm-page--narrow crm-settings">
      <header className="crm-head">
        <div>
          <h1>{t('crm.settingsTitle')}</h1>
          <p>{t('settings.crm.desc')}</p>
        </div>
        {can('settings.modules') && <Link to="/admin/settings/crm">{t('crm.settingsConsole')} →</Link>}
      </header>
      <LoadState ready={Boolean(settings) || Boolean(error)} error={error} onRetry={load}>
        {settings && (
          <CrmForm
            inApp
            state={state}
            onSave={async ({ settings: values }) => {
              const res = await crmApi.saveSettings(values);
              setSettings(res.data.settings);
              refresh().catch(() => {});
            }}
          />
        )}
      </LoadState>
    </div>
  );
}
