import { useMemo } from 'react';
import { Form, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { Button } from 'antd';
import { useAuth } from '../../context/AuthContext';
import RobotPicker from './RobotPicker';
import { savePrefs, useAssistantPrefs } from './store';
import './assistant.css';

function AssistantForm({ settings, save }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const own = useAssistantPrefs(user?.id);
  const state = settings.modules?.assistant || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async ({ enabled, ...rest }) => {
    await save({ modules: { assistant: { enabled, settings: rest } } });
    // Whoever picks the default robot sees it at once: their own earlier pick
    // would otherwise hide the change. Other people's choices stay.
    if (rest.avatar !== initial.avatar && own?.avatar) await savePrefs({ avatar: null });
  });
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
        <OwnRobotNote />
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** The default does not replace a robot someone picked for themselves — say so to the admin. */
function OwnRobotNote() {
  const { t } = useLocale();
  const { user } = useAuth();
  const prefs = useAssistantPrefs(user?.id);
  if (!prefs?.avatar) return null;
  return (
    <p className="asst-account-note">
      {t('assistantSettings.ownRobot', { name: t(`assistant.robots.${prefs.avatar}.name`) })}{' '}
      <Button size="small" type="link" onClick={() => savePrefs({ avatar: null })}>
        {t('assistantSettings.showDefault')}
      </Button>
    </p>
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
