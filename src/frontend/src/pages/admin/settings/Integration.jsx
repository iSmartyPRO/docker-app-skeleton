import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Form, Input, InputNumber, Select, Switch, Tag, Typography } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { SETTINGS_ITEMS } from '../../../admin/navigation';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { listWazzupChannels, testAdminIntegration } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';
import EditorSettings from './EditorSettings';
import { HintLabel } from '../../../help/Hint';

/** Help hint per integration group (help/content/admin.js → fields). */
const HINTS = {
  email: 'admin.smtp',
  telegram: 'admin.telegramBot',
  whatsapp: 'admin.whatsappGateway',
  wazzup: 'admin.wazzup',
  mattermost: 'admin.mattermost',
  documents: 'admin.documents',
  activeDirectory: 'admin.activeDirectory',
};

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
    { name: 'botUsername', label: 'botUsername', placeholder: 'my_portal_bot' },
    { name: 'defaultChatId', label: 'chatId' },
  ],
  whatsapp: [
    { name: 'serverUrl', label: 'server', placeholder: 'https://wagw.example.com' },
    { name: 'apiKey', label: 'apiKey', secret: true },
  ],
  wazzup: [{ name: 'apiKey', label: 'apiKey', secret: true }],
  documents: [{ name: 'serverUrl', label: 'documentsUrl', placeholder: 'http://collabora:9980' }],
  mattermost: [
    { name: 'serverUrl', label: 'mattermostUrl', placeholder: 'https://chat.example.com' },
    { name: 'botToken', label: 'mattermostToken', secret: true },
    { name: 'notifyChannelId', label: 'mattermostChannel', placeholder: 'e.g. 8zq1k3…' },
    { name: 'notifySecurity', label: 'mattermostAlerts', type: 'switch' },
  ],
  activeDirectory: [
    { name: 'host', label: 'host', placeholder: 'dc01.corp.local' },
    { name: 'port', label: 'port', type: 'number' },
    { name: 'useTls', label: 'tls', type: 'switch' },
    { name: 'bindDn', label: 'bindDn', placeholder: 'CN=svc,OU=Service,DC=corp,DC=local' },
    { name: 'bindPassword', label: 'password', secret: true },
    { name: 'baseDn', label: 'baseDn', placeholder: 'DC=corp,DC=local' },
    { name: 'caCert', label: 'caCert', type: 'textarea', hint: 'caCertHint', placeholder: '-----BEGIN CERTIFICATE-----' },
  ],
};

/** Wazzup `transport` values → display names. Unknown ones are shown as-is. */
const WAZZUP_TRANSPORTS = {
  whatsapp: 'WhatsApp',
  wapi: 'WhatsApp Business API',
  whatsgroup: 'WhatsApp groups',
  instagram: 'Instagram',
  tgapi: 'Telegram',
  telegram: 'Telegram bot',
  vk: 'VK',
  avito: 'Avito',
  viber: 'Viber',
  max: 'MAX',
};

function transportName(transport) {
  return WAZZUP_TRANSPORTS[transport] || transport;
}

/**
 * Channels come from the Wazzup account itself; the admin only picks which
 * channel to use for each messenger. Stored as `{ transport: channelId }`.
 */
function WazzupChannelPicker({ value = {}, onChange, channels, loading, error, onLoad }) {
  const { t } = useLocale();
  const byTransport = useMemo(() => {
    const groups = {};
    for (const channel of channels || []) {
      (groups[channel.transport] ||= []).push(channel);
    }
    return groups;
  }, [channels]);

  const stateLabel = (state) => {
    if (!state) return '—';
    const key = `settings.wazzup.states.${state}`;
    const label = t(key);
    return label === key ? state : label;
  };

  const setChannel = (transport, id) => {
    const next = { ...value };
    if (id) next[transport] = id;
    else delete next[transport];
    onChange?.(next);
  };

  if (!channels) {
    return (
      <div className="channel-empty">
        <Text type={error ? 'danger' : 'secondary'}>{error || t('settings.wazzup.notLoaded')}</Text>
        <Button onClick={onLoad} loading={loading}>
          {t('settings.wazzup.load')}
        </Button>
      </div>
    );
  }

  if (!channels.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.wazzup.none')} />;
  }

  return (
    <div>
      {Object.entries(byTransport).map(([transport, list]) => (
        <SettingRow
          key={transport}
          label={transportName(transport)}
          description={t('settings.wazzup.count', { count: list.length })}
        >
          <Select
            allowClear
            style={{ width: '100%', maxWidth: 420 }}
            placeholder={t('settings.wazzup.notSelected')}
            value={value[transport] || undefined}
            onChange={(id) => setChannel(transport, id)}
            options={list.map((channel) => ({
              value: channel.id,
              label: (
                <span className="channel-option">
                  <span>{channel.plainId || channel.name || channel.id}</span>
                  <Tag bordered={false} color={channel.state === 'active' ? 'green' : 'orange'}>
                    {stateLabel(channel.state)}
                  </Tag>
                </span>
              ),
            }))}
          />
        </SettingRow>
      ))}
    </div>
  );
}

function fieldControl(field, current, t) {
  if (field.type === 'number') return <InputNumber min={1} max={65535} style={{ width: 140 }} />;
  if (field.type === 'switch') return <Switch />;
  if (field.type === 'textarea') {
    return <Input.TextArea rows={4} spellCheck={false} placeholder={field.placeholder} style={{ fontFamily: 'monospace', fontSize: 12 }} />;
  }
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
    if (group === 'wazzup') values.channels = current.channels || {};
    for (const field of fields) {
      if (field.secret) values[field.name] = '';
      else if (field.type === 'switch') values[field.name] = Boolean(current[field.name]);
      else values[field.name] = current[field.name] ?? (field.type === 'number' ? null : '');
    }
    return values;
  }, [current, fields, group]);

  const { form, dirty, saving, submit, reset, recompute, formProps } = useSettingsForm(initial, async (values) => {
    await save({ integrations: { [group]: values } });
    // Secrets are write-only: clear what was typed once it is stored.
    form.setFieldsValue(
      Object.fromEntries(fields.filter((field) => field.secret).map((field) => [field.name, '']))
    );
  });
  const enabled = Form.useWatch('enabled', form);

  const [channels, setChannels] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState('');

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    setChannelsError('');
    try {
      const apiKey = form.getFieldValue('apiKey');
      const res = await listWazzupChannels(apiKey ? { apiKey } : {});
      setChannels(res.data.channels || []);
    } catch (err) {
      setChannelsError(errorMessage(err));
    } finally {
      setChannelsLoading(false);
    }
  }, [form]);

  // With a saved key, show the account's channels straight away.
  useEffect(() => {
    if (group === 'wazzup' && current.apiKeySet) loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await testAdminIntegration(group, form.getFieldsValue(true));
      if (res.data?.channels) setChannels(res.data.channels);
      // Telegram: the bot's @username is needed for the login widget — fill it in.
      if (group === 'telegram' && res.data?.bot?.username && form.getFieldValue('botUsername') !== res.data.bot.username) {
        form.setFieldsValue({ botUsername: res.data.bot.username });
        recompute();
      }
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
        title={HINTS[group] ? <HintLabel id={HINTS[group]}>{t('settings.integration.connection')}</HintLabel> : t('settings.integration.connection')}
        description={t('settings.integration.connectionDesc')}
        extra={
          <Button onClick={onTest} loading={testing}>
            {t('settings.integration.test')}
          </Button>
        }
      >
        <div className={enabled ? '' : 'is-muted'}>
          {fields.map((field) => (
            <SettingRow
              key={field.name}
              label={t(`integrations.${field.label}`)}
              description={field.hint ? t(`integrations.${field.hint}`) : undefined}
            >
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
      {group === 'wazzup' && (
        <SettingsSection
          title={t('settings.wazzup.channels')}
          description={t('settings.wazzup.channelsDesc')}
          extra={
            channels && (
              <Button onClick={loadChannels} loading={channelsLoading}>
                {t('settings.wazzup.reload')}
              </Button>
            )
          }
        >
          <Form.Item name="channels" noStyle>
            <WazzupChannelPicker
              channels={channels}
              loading={channelsLoading}
              error={channelsError}
              onLoad={loadChannels}
            />
          </Form.Item>
        </SettingsSection>
      )}
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
        {settings && item.integration === 'documents' && <EditorSettings settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
