import { useMemo } from 'react';
import { Button, Form, Switch } from 'antd';
import Segmented from '../../components/ui/Segmented';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import Cast from './Cast';
import { ROBOT_IDS } from './robots';
import { savePrefs, useAssistantPrefs } from './store';
import './assistant.css';

/*
 * Settings → Modules → Robot assistant. Besides on/off and help offers, the
 * administrator decides who chooses the character:
 *   all   — everyone picks any character (the default one greets newcomers)
 *   some  — only the characters ticked here
 *   one   — nobody chooses: one character for the whole organisation
 */
function AssistantForm({ settings, save }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const own = useAssistantPrefs(user?.id);
  const state = settings.modules?.assistant || { enabled: true, settings: {} };
  const initial = useMemo(
    () => ({ enabled: state.enabled, choice: 'all', allowed: [], allowColors: true, ...state.settings }),
    [state]
  );
  const { dirty, saving, submit, reset, formProps, form, recompute } = useSettingsForm(initial, async ({ enabled, ...rest }) => {
    const settingsPatch = { ...rest, allowed: rest.choice === 'some' ? rest.allowed : rest.allowed || [] };
    await save({ modules: { assistant: { enabled, settings: settingsPatch } } });
    // Whoever picks the default robot sees it at once: their own earlier pick
    // would otherwise hide the change. Other people's choices stay.
    if (rest.avatar !== initial.avatar && own?.avatar) await savePrefs({ avatar: null });
  });
  const choice = Form.useWatch('choice', form) || initial.choice;
  const allowed = Form.useWatch('allowed', form) || initial.allowed;
  const avatar = Form.useWatch('avatar', form) || initial.avatar;
  // Programmatic changes do not fire onValuesChange: keep the save bar in step.
  const setFields = (patch) => {
    form.setFieldsValue(patch);
    recompute();
  };

  const toggle = (id) => {
    const set = new Set(allowed.length ? allowed : []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = ROBOT_IDS.filter((robotId) => set.has(robotId));
    // The default stays among the allowed characters.
    setFields({ allowed: next, ...(next.length && !next.includes(avatar) ? { avatar: next[0] } : {}) });
  };

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
        <SettingRow label={t('assistantSettings.allowColors')} description={t('assistantSettings.allowColorsDesc')}>
          <Form.Item name="allowColors" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('assistantSettings.choiceTitle')} description={t('assistantSettings.choiceDesc')}>
        <div className="asst-mode">
          <Form.Item name="choice" noStyle>
            <Segmented
              block
              onChange={(next) => {
                if (next === 'some' && !allowed.length) setFields({ allowed: [...ROBOT_IDS] });
              }}
              options={[
                { value: 'all', label: t('assistantSettings.choice.all') },
                { value: 'some', label: t('assistantSettings.choice.some') },
                { value: 'one', label: t('assistantSettings.choice.one') },
              ]}
            />
          </Form.Item>
          <p className="asst-mode__hint">{t(`assistantSettings.choiceHint.${choice}`, { n: allowed.length })}</p>
          <Form.Item name="allowed" hidden>
            <span />
          </Form.Item>
          {choice === 'some' && (
            <>
              <div className="asst-mode__bulk">
                <Button size="small" onClick={() => setFields({ allowed: [...ROBOT_IDS] })}>
                  {t('assistantSettings.selectAll')}
                </Button>
                <Button size="small" onClick={() => setFields({ allowed: [avatar] })}>
                  {t('assistantSettings.selectNone')}
                </Button>
              </div>
              <Cast selected={allowed} onToggle={toggle} />
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t(choice === 'one' ? 'assistantSettings.oneTitle' : 'assistantSettings.avatar')}
        description={t(choice === 'one' ? 'assistantSettings.oneDesc' : 'assistantSettings.avatarDesc')}
      >
        <Form.Item name="avatar" noStyle>
          <PickerField only={choice === 'some' && allowed.length ? allowed : null} />
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

const PickerField = ({ value, onChange, only }) => <Cast value={value} onPick={onChange} only={only} />;

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
