import { useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Switch, Typography } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { SETTINGS_ITEMS } from '../../../admin/navigation';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { testAdminIntegration } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

const { Text } = Typography;

/** Field schema per integration group. `secret` fields are write-only. */
const FIELDS = {
  email: [
    { name: 'host', label: 'host', placeholder: 'smtp.example.com' },
    { name: 'port', label: 'port', type: 'number' },
    { name: 'secure', label: 'secure', type: 'switch' },
    { name: 'user', label: 'user' },
    { name: 'password', label: 'password', secret: true },
    { name: 'from', label: 'from', placeholder: 'Product <no-reply@example.com>' },
  ],
  telegram: [
    { name: 'botToken', label: 'token', secret: true },
    { name: 'defaultChatId', label: 'chatId' },
  ],
  whatsapp: [
    { name: 'serverUrl', label: 'server', placeholder: 'https://wa-gateway.example.com' },
    { name: 'apiKey', label: 'apiKey', secret: true },
  ],
  activeDirectory: [
    { name: 'host', label: 'host', placeholder: 'dc01.corp.local' },
    { name: 'port', label: 'port', type: 'number' },
    { name: 'useTls', label: 'tls', type: 'switch' },
    { name: 'bindDn', label: 'bindDn', placeholder: 'CN=svc,OU=Service,DC=corp,DC=local' },
    { name: 'bindPassword', label: 'password', secret: true },
    { name: 'baseDn', label: 'baseDn', placeholder: 'DC=corp,DC=local' },
  ],
};

function fieldControl(field, current, t) {
  if (field.type === 'number') return <InputNumber min={1} max={65535} style={{ width: 140 }} />;
  if (field.type === 'switch') return <Switch />;
  if (field.secret) {
    return (
      <Input.Password
        autoComplete="new-password"
        placeholder={current[`${field.name}Set`] ? t('settings.integration.secretSet') : ''}
      />
    );
  }
  return <Input placeholder={field.placeholder} />;
}

function IntegrationForm({ group, settings, save }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [testing, setTesting] = useState(false);
  const fields = FIELDS[group];
  const current = settings.integrations?.[group] || {};

  const initial = useMemo(() => {
    const values = { enabled: Boolean(current.enabled) };
    for (const field of fields) {
      if (field.secret) values[field.name] = '';
      else if (field.type === 'switch') values[field.name] = Boolean(current[field.name]);
      else values[field.name] = current[field.name] ?? (field.type === 'number' ? null : '');
    }
    return values;
  }, [current, fields]);

  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    await save({ integrations: { [group]: values } });
    // Secrets are write-only: clear what was typed once it is stored.
    form.setFieldsValue(
      Object.fromEntries(fields.filter((field) => field.secret).map((field) => [field.name, '']))
    );
  });
  const enabled = Form.useWatch('enabled', form);

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await testAdminIntegration(group, form.getFieldsValue(true));
      message.success(res.data?.message || (res.data?.bot ? `@${res.data.bot.username}` : 'OK'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('settings.integration.enabled')} description={t('settings.integration.statusDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection
        title={t('settings.integration.connection')}
        description={t('settings.integration.connectionDesc')}
        extra={
          <Button onClick={onTest} loading={testing}>
            {t('settings.integration.test')}
          </Button>
        }
      >
        <div className={enabled ? '' : 'is-muted'}>
          {fields.map((field) => (
            <SettingRow key={field.name} label={t(`integrations.${field.label}`)}>
              <Form.Item
                name={field.name}
                valuePropName={field.type === 'switch' ? 'checked' : 'value'}
                noStyle
              >
                {fieldControl(field, current, t)}
              </Form.Item>
            </SettingRow>
          ))}
        </div>
        <Text type="secondary" className="section-footnote">
          {t('settings.integration.testHint')}
        </Text>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function IntegrationSettings({ itemId }) {
  const item = SETTINGS_ITEMS.find((entry) => entry.id === itemId);
  const { settings, ready, error, refresh, save } = useAdminSettings();
  if (!item?.integration) return null;
  return (
    <>
      <SettingsPageHeader id={item.id} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && (
          <IntegrationForm key={item.id} group={item.integration} settings={settings} save={save} />
        )}
      </LoadState>
    </>
  );
}
