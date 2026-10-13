import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, Radio, Select, Switch } from 'antd';
import { TimeField as WallTimeField } from '../../components/ui/DateTimeField';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { REMINDER_PRESETS, reminderLabel } from './components/EventDialog';

/** A work-day boundary ('HH:mm' wall-clock), shown in the portal's time format. */
function TimeField({ value, onChange }) {
  return <WallTimeField minuteStep={30} needConfirm={false} allowClear={false} value={value} onChange={(time) => onChange?.(time || value)} />;
}

function CalendarForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.calendar || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { calendar: { enabled, settings: rest } } })
  );
  const google = settings.integrations?.google;
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('calendarSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label="Google Calendar" description={t('calendarSettings.googleDesc')}>
          <Link to="/admin/settings/google">{google?.enabled ? t('common.on') : t('common.off')} · {t('googleSettings.configure')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('calendarSettings.calendars')} description={t('calendarSettings.calendarsDesc')}>
        <SettingRow label={t('calendarSettings.creation')} description={t('calendarSettings.creationDesc')}>
          <Form.Item name="calendarCreation" noStyle>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'everyone', label: t('tasksSettings.creation_everyone') },
                { value: 'admins', label: t('tasksSettings.creation_admins') },
              ]}
            />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('calendarSettings.showTasks')} description={t('calendarSettings.showTasksDesc')}>
          <Form.Item name="showTasks" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('calendarSettings.view')} description={t('calendarSettings.viewDesc')}>
        <SettingRow label={t('calendarSettings.defaultView')}>
          <Form.Item name="defaultView" noStyle>
            <Select style={{ width: 200 }} options={['month', 'week', 'day', 'agenda'].map((value) => ({ value, label: t(`calendar.view.${value}`) }))} />
          </Form.Item>
        </SettingRow>
        {/* The week start is the portal's regional setting (Settings → General → Region and time). */}
        <SettingRow label={t('calendarSettings.weekStart')}>
          <Link to="/admin/settings/general">{t('regional.portalTitle')} →</Link>
        </SettingRow>
        <SettingRow label={t('calendarSettings.workday')} description={t('calendarSettings.workdayDesc')}>
          <span className="time-range">
            <Form.Item name="dayStart" noStyle><TimeField /></Form.Item>
            —
            <Form.Item name="dayEnd" noStyle><TimeField /></Form.Item>
          </span>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('calendarSettings.reminders')} description={t('calendarSettings.remindersDesc')}>
        <SettingRow label={t('calendarSettings.remindersOn')}>
          <Form.Item name="reminders" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('calendarSettings.defaultReminder')}>
          <Form.Item name="defaultReminder" noStyle>
            <Select
              style={{ width: 220 }}
              options={[{ value: -1, label: t('calendar.noReminders') }, ...REMINDER_PRESETS.map((value) => ({ value, label: reminderLabel(value, t) }))]}
            />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function CalendarSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <CalendarForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
