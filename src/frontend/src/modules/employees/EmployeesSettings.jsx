import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Form, Select, Switch } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { useLocale } from '../../context/LocaleContext';
import LoadState from '../../components/ui/LoadState';
import SaveBar from '../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import TourButton from '../../tour/TourButton';
import { empApi } from './api';
import { empError } from './lib';

/**
 * Settings of the Employees module: who sees the directory, the birthdays
 * widget, clearance reminders. Shown in Settings → Modules → Employees and
 * inside the module (/app/employees/settings) for employees.admin.
 */
export function EmployeesSettingsForm() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [state, setState] = useState({ ready: false, error: null, settings: null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = () =>
    empApi
      .settings()
      .then((res) => setState({ ready: true, error: null, settings: res.data.settings }))
      .catch((error) => setState({ ready: true, error, settings: null }));
  useEffect(() => {
    load();
  }, []);
  const initial = useMemo(() => state.settings || {}, [state.settings]);
  useEffect(() => {
    if (state.settings) {
      form.setFieldsValue(initial);
      setDirty(false);
    }
  }, [initial, form, state.settings]);
  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await empApi.saveSettings(values);
      setState((prev) => ({ ...prev, settings: res.data.settings }));
      message.success(t('common.saved'));
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setSaving(false);
    }
  };
  const disabledModule = state.error?.response?.data?.code === 'MODULE_DISABLED';
  return (
    <LoadState ready={state.ready} error={disabledModule ? null : state.error} onRetry={load}>
      {disabledModule ? (
        <p className="emp-muted">
          {t('emp.settings.moduleOff')} <Link to="/admin/settings/modules?focus=employees">{t('emp.settings.toModules')}</Link>
        </p>
      ) : (
        state.settings && (
          <Form form={form} initialValues={initial} onValuesChange={() => setDirty(true)}>
            <SettingsSection title={t('emp.settings.access')}>
              <SettingRow label={t('emp.settings.everyoneCanView')} description={t('emp.settings.everyoneCanViewDesc')}>
                <Form.Item name="everyoneCanView" valuePropName="checked" noStyle>
                  <Switch />
                </Form.Item>
              </SettingRow>
            </SettingsSection>
            <SettingsSection title={t('emp.settings.celebrations')}>
              <SettingRow label={t('emp.settings.birthdays')} description={t('emp.settings.birthdaysDesc')}>
                <Form.Item name="birthdays" noStyle>
                  <Segmented options={['all', 'hr', 'off'].map((value) => ({ value, label: t(`emp.settings.birthdaysMode.${value}`) }))} />
                </Form.Item>
              </SettingRow>
              <SettingRow label={t('emp.settings.anniversaries')} description={t('emp.settings.anniversariesDesc')}>
                <Form.Item name="anniversaries" valuePropName="checked" noStyle>
                  <Switch />
                </Form.Item>
              </SettingRow>
            </SettingsSection>
            <SettingsSection title={t('emp.settings.clearances')}>
              <SettingRow label={t('emp.settings.warnDays')} description={t('emp.settings.warnDaysDesc')}>
                <Form.Item name="clearanceWarnDays" noStyle>
                  <Select mode="tags" style={{ minWidth: 220 }} tokenSeparators={[',', ' ']} options={[60, 30, 14, 7, 3, 1, 0].map((value) => ({ value, label: value ? t('emp.settings.daysBefore', { n: value }) : t('emp.settings.onTheDay') }))} />
                </Form.Item>
              </SettingRow>
              <SettingRow label={t('emp.settings.notifyEmployee')} description={t('emp.settings.notifyEmployeeDesc')}>
                <Form.Item name="notifyEmployee" valuePropName="checked" noStyle>
                  <Switch />
                </Form.Item>
              </SettingRow>
              <SettingRow label={t('emp.settings.notifyManager')} description={t('emp.settings.notifyManagerDesc')}>
                <Form.Item name="notifyManager" valuePropName="checked" noStyle>
                  <Switch />
                </Form.Item>
              </SettingRow>
            </SettingsSection>
            <SaveBar
              visible={dirty}
              saving={saving}
              onSave={save}
              onReset={() => {
                form.setFieldsValue(initial);
                setDirty(false);
              }}
            />
          </Form>
        )
      )}
    </LoadState>
  );
}

/** Settings → Modules → Employees. */
export default function EmployeesSettings() {
  return (
    <>
      <SettingsPageHeader id="employees" extra={<TourButton module="employees" />} />
      <EmployeesSettingsForm />
    </>
  );
}

