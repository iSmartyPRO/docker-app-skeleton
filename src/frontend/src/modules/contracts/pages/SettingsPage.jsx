import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { contractsApi } from '../api';
import { useContracts } from '../ContractsContext';
import { ContractsForm } from '../ContractsSettings';

/**
 * /app/contracts/settings — contracts administrators change the module's
 * settings here without the console's rights (PUT /api/app/contracts/settings).
 */
export default function SettingsPage() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { me, settings, refresh } = useContracts();
  const state = useMemo(() => ({ enabled: true, settings }), [settings]);
  if (!me.isAdmin) return <Navigate to="/app/contracts" replace />;
  return (
    <div className="ctr-page ctr-page--narrow">
      <header className="ctr-page__head">
        <div>
          <h1>{t('contracts.settings.title')}</h1>
          <p>{t('settings.contracts.desc')}</p>
        </div>
        {can('settings.modules') && <Link to="/admin/settings/contracts">{t('contracts.settings.console')} →</Link>}
      </header>
      <ContractsForm
        inApp
        state={state}
        onSave={async ({ settings: values }) => {
          await contractsApi.saveSettings(values);
          await refresh();
        }}
      />
    </div>
  );
}
