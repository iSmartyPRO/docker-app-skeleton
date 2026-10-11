import { useMemo } from 'react';
import { Form, InputNumber } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import SettingsPageHeader from './SettingsPageHeader';
import { HintLabel } from '../../../help/Hint';

function LoginForm({ settings, save }) {
  const { t } = useLocale();
  const security = settings.security || {};
  const initial = useMemo(
    () => ({
      maxLoginAttempts: security.maxLoginAttempts || 8,
      lockoutMinutes: security.lockoutMinutes || 15,
      sessionDays: security.sessionDays || 7,
    }),
    [security.maxLoginAttempts, security.lockoutMinutes, security.sessionDays]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (values) =>
    save({ security: values })
  );

  return (
    <Form {...formProps}>
      <SettingsSection title={<HintLabel id="admin.lockout">{t('settings.login.lockout')}</HintLabel>} description={t('settings.login.lockoutDesc')}>
        <SettingRow label={t('settings.login.maxAttempts')}>
          <Form.Item name="maxLoginAttempts" noStyle>
            <InputNumber min={3} max={30} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('settings.login.lockoutMinutes')}>
          <Form.Item name="lockoutMinutes" noStyle>
            <InputNumber min={5} max={180} suffix={t('settings.login.minutes')} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('settings.login.sessions')} description={t('settings.login.sessionsDesc')}>
        <SettingRow label={<HintLabel id="admin.sessionDays">{t('settings.login.sessionDays')}</HintLabel>}>
          <Form.Item name="sessionDays" noStyle>
            <InputNumber min={1} max={90} suffix={t('settings.login.days')} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function LoginSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="login" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <LoginForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
