import { useMemo } from 'react';
import { Form, Input, InputNumber, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

function ChatForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.chat || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { chat: { enabled, settings: rest } } }));
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('chatSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('chatSettings.allowGroups')} description={t('chatSettings.allowGroupsDesc')}>
          <Form.Item name="allowGroups" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('chatSettings.maxUpload')}>
          <Form.Item name="maxUploadMb" noStyle>
            <InputNumber min={1} max={2048} addonAfter="MB" style={{ width: 170 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('chatSettings.callUrl')} description={t('chatSettings.callUrlDesc')}>
          <Form.Item name="callUrl" noStyle>
            <Input placeholder="https://meet.jit.si/{room}" style={{ width: 340 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function ChatSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <ChatForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
