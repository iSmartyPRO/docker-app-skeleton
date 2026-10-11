import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, Input, Radio, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

function ResourcesForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.resources || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { resources: { enabled, settings: rest } } })
  );
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('resourcesSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.catalogue')} description={t('resourcesSettings.catalogueDesc')}>
          <Link to="/app/resources/manage">{t('resources.manageTitle')} →</Link>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.homePage')} description={t('resourcesSettings.homePageDesc')}>
          <Link to="/admin/settings/access">{t('settings.access.title')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('resourcesSettings.look')} description={t('resourcesSettings.lookDesc')}>
        <SettingRow label={t('resourcesSettings.title')} description={t('resourcesSettings.titleDesc')}>
          <Form.Item name="title" noStyle>
            <Input maxLength={60} placeholder={t('resources.title')} style={{ width: 280 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.subtitle')}>
          <Form.Item name="subtitle" noStyle>
            <Input maxLength={200} placeholder={t('resources.subtitle')} style={{ width: 360 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.density')}>
          <Form.Item name="density" noStyle>
            <Radio.Group optionType="button" options={[{ value: 'comfortable', label: t('resourcesSettings.comfortable') }, { value: 'compact', label: t('resourcesSettings.compact') }]} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.showDescriptions')}>
          <Form.Item name="showDescriptions" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.showSearch')} description={t('resourcesSettings.showSearchDesc')}>
          <Form.Item name="showSearch" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('resourcesSettings.personalize')} description={t('resourcesSettings.personalizeDesc')}>
          <Form.Item name="personalize" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function ResourcesSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <ResourcesForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
