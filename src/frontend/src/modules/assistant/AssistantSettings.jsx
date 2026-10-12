import { useMemo } from 'react';
import { Form, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import RobotPicker from './RobotPicker';
import './assistant.css';

function AssistantForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.assistant || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { assistant: { enabled, settings: rest } } })
  );
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('assistantSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('assistantSettings.proactive')} description={t('assistantSettings.proactiveDesc')}>
          <Form.Item name="proactive" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('assistantSettings.avatar')} description={t('assistantSettings.avatarDesc')}>
        <Form.Item name="avatar" noStyle>
          <PickerField />
        </Form.Item>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

const PickerField = ({ value, onChange }) => <RobotPicker value={value} onChange={onChange} />;

export default function AssistantSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="assistant" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <AssistantForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
