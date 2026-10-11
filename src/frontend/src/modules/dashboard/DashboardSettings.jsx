import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, Input, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import { HintLabel } from '../../help/Hint';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

function DashboardForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.dashboard || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { dashboard: { enabled, settings: rest } } }));
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('dashboardSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('dashboardSettings.title')} description={t('dashboardSettings.titleDesc')}>
          <Form.Item name="title" noStyle>
            <Input maxLength={60} placeholder={t('apps.dashboard.name')} style={{ width: 280 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="dashboard.personalize">{t('dashboardSettings.personalize')}</HintLabel>} description={t('dashboardSettings.personalizeDesc')}>
          <Form.Item name="personalize" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('dashboardSettings.defaultLayout')} description={t('dashboardSettings.defaultLayoutDesc')}>
          <Link to="/app/dashboard">{t('dashboardSettings.openDashboard')} →</Link>
        </SettingRow>
        <SettingRow label={t('dashboardSettings.home')} description={t('dashboardSettings.homeDesc')}>
          <Link to="/admin/settings/access">{t('dashboardSettings.homeLink')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function DashboardSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <DashboardForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
