import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, InputNumber, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

function QrForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.qr || { enabled: false, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { qr: { enabled, settings: rest } } }));
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('qrSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('qrSettings.templates')} description={t('qrSettings.templatesDesc')}>
          <Link to="/app/qr/templates">{t('qr.templates.title')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('qrSettings.people')} description={t('qrSettings.peopleDesc')}>
        <SettingRow label={t('qrSettings.allowCustom')} description={t('qrSettings.allowCustomDesc')}>
          <Form.Item name="allowCustom" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('qrSettings.allowUploads')} description={t('qrSettings.allowUploadsDesc')}>
          <Form.Item name="allowUploads" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('qrSettings.dynamic')} description={t('qrSettings.dynamicDesc')}>
          <Form.Item name="dynamic" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('qrSettings.maxCodes')} description={t('qrSettings.maxCodesDesc')}>
          <Form.Item name="maxCodes" noStyle>
            <InputNumber min={10} max={10000} step={50} style={{ width: 140 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function QrSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <QrForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
