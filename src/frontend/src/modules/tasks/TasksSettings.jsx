import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, InputNumber, Radio, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

function TasksForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.tasks || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { tasks: { enabled, settings: rest } } })
  );
  const reminders = Form.useWatch('reminders', form);
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('tasksSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('tasksSettings.access')} description={t('tasksSettings.accessDesc')}>
          <Link to="/app/tasks/projects">{t('tasksSettings.openProjects')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('tasksSettings.projects')} description={t('tasksSettings.projectsDesc')}>
        <SettingRow label={t('tasksSettings.creation')} description={t('tasksSettings.creationDesc')}>
          <Form.Item name="projectCreation" noStyle>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'everyone', label: t('tasksSettings.creation_everyone') },
                { value: 'admins', label: t('tasksSettings.creation_admins') },
              ]}
            />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('tasksSettings.defaultView')}>
          <Form.Item name="defaultView" noStyle>
            <Radio.Group optionType="button" options={[{ value: 'board', label: t('tasks.board') }, { value: 'list', label: t('tasks.list') }]} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('tasksSettings.reminders')} description={t('tasksSettings.remindersDesc')}>
        <SettingRow label={t('tasksSettings.remindersOn')}>
          <Form.Item name="reminders" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('tasksSettings.dueSoon')} description={t('tasksSettings.dueSoonDesc')}>
          <Form.Item name="dueSoonHours" noStyle>
            <InputNumber min={1} max={168} disabled={!reminders} addonAfter={t('tasksSettings.hours')} style={{ width: 150 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function TasksSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <TasksForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
