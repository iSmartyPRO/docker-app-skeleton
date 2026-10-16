import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from 'antd';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useLocale } from '../../../context/LocaleContext';
import { useModuleSwitch } from '../../../modules/platformUi';

/**
 * «Модуль включён» at the top of a module's settings page: the same switch as
 * Settings → Modules, saved at once. `save` is useAdminSettings().save.
 * Requirements between modules ask first (useModuleSwitch).
 */
export default function ModuleEnableSwitch({ id, enabled, save, path }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const { toggle: switchModule } = useModuleSwitch(save);
  const toggle = async (value) => {
    setBusy(true);
    try {
      await switchModule(id, value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection>
      <SettingRow
        label={t('modules.enableLabel')}
        description={
          <>
            {t(enabled ? 'modules.enableOnDesc' : 'modules.enableOffDesc')}
            {enabled && path && (
              <>
                {' '}
                <Link to={path}>{t('modules.open')} ↗</Link>
              </>
            )}
          </>
        }
      >
        <Switch checked={Boolean(enabled)} loading={busy} onChange={toggle} />
      </SettingRow>
    </SettingsSection>
  );
}
