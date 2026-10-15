import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Switch } from 'antd';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';

/**
 * «Модуль включён» at the top of a module's settings page: the same switch as
 * Settings → Modules, saved at once. `save` is useAdminSettings().save.
 */
export default function ModuleEnableSwitch({ id, enabled, save, path }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const toggle = async (value) => {
    setBusy(true);
    try {
      await save({ modules: { [id]: { enabled: value } } });
      message.success(value ? t('modules.enabled') : t('modules.disabled'));
    } catch (err) {
      message.error(errorMessage(err));
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
