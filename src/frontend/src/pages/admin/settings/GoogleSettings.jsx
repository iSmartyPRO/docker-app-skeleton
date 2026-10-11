import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Button, Form, Input, Popconfirm, Switch, Tag, Typography } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { disconnectAdminGmail, getAdminGoogleInfo, startGoogle, testAdminIntegration } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

const { Text } = Typography;

function CopyField({ value }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  return (
    <div className="copy-field">
      <code>{value || '…'}</code>
      <Button
        size="small"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => message.success(t('common.copied')));
        }}
      >
        {t('common.copy')}
      </Button>
    </div>
  );
}

function GoogleForm({ settings, save, refresh }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [testing, setTesting] = useState(false);
  const current = settings.integrations?.google || {};
  const signInOn = Boolean(settings.authMethods?.google?.enabled);

  useEffect(() => {
    getAdminGoogleInfo().then((res) => setInfo(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (params.get('gmail') === 'connected') message.success(t('googleSettings.gmailConnected'));
    const code = params.get('google_error');
    if (code) {
      const key = `signin.errors.${code}`;
      message.error(t(key) === key ? t('signin.errors.GOOGLE_ERROR') : t(key));
    }
    if (params.toString()) setParams({}, { replace: true });
  }, [params, setParams, message, t]);

  const initial = useMemo(
    () => ({
      enabled: Boolean(current.enabled),
      clientId: current.clientId || '',
      clientSecret: '',
      allowedDomains: (current.allowedDomains || '').split(',').filter(Boolean).join(', '),
      calendar: current.calendar !== false,
      gmailSend: Boolean(current.gmailSend),
    }),
    [current]
  );

  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    await save({ integrations: { google: values } });
    form.setFieldsValue({ clientSecret: '' });
  });
  const enabled = Form.useWatch('enabled', form);

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await testAdminIntegration('google', form.getFieldsValue(true));
      message.success(res.data?.message || 'OK');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const disconnectGmail = async () => {
    try {
      await disconnectAdminGmail();
      await refresh();
      message.success(t('googleSettings.gmailDisconnected'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const configured = Boolean(current.clientId && current.clientSecretSet);

  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('settings.integration.enabled')} description={t('googleSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('googleSettings.setupTitle')} description={t('googleSettings.setupDesc')}>
        <ol className="setup-steps">
          <li>
            {t('googleSettings.step1')}{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
              Google Cloud Console ↗
            </a>
          </li>
          <li>{t('googleSettings.step2')}</li>
          <li>
            {t('googleSettings.step3')}
            <div className="setup-steps__fields">
              <span>{t('googleSettings.origin')}</span>
              <CopyField value={info?.origin} />
              <span>{t('googleSettings.redirect')}</span>
              <CopyField value={info?.redirectUri} />
            </div>
          </li>
          <li>{t('googleSettings.step4')}</li>
          <li>{t('googleSettings.step5')}</li>
        </ol>
      </SettingsSection>

      <SettingsSection
        title={t('settings.integration.connection')}
        description={t('googleSettings.connectionDesc')}
        extra={<Button onClick={onTest} loading={testing}>{t('settings.integration.test')}</Button>}
      >
        <div className={enabled ? '' : 'is-muted'}>
          <SettingRow label="Client ID">
            <Form.Item name="clientId" noStyle>
              <Input placeholder="1234567890-abc.apps.googleusercontent.com" />
            </Form.Item>
          </SettingRow>
          <SettingRow label="Client secret">
            <Form.Item name="clientSecret" noStyle>
              <Input.Password autoComplete="new-password" placeholder={current.clientSecretSet ? t('settings.integration.secretSet') : 'GOCSPX-…'} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('googleSettings.domains')} description={t('googleSettings.domainsDesc')}>
            <Form.Item name="allowedDomains" noStyle>
              <Input placeholder="company.com, company.kz" />
            </Form.Item>
          </SettingRow>
        </div>
      </SettingsSection>

      <SettingsSection title={t('googleSettings.features')} description={t('googleSettings.featuresDesc')}>
        <SettingRow label={t('googleSettings.signIn')} description={t('googleSettings.signInDesc')}>
          <span className="feature-state">
            <Tag color={signInOn ? 'green' : 'default'} bordered={false}>{signInOn ? t('common.on') : t('common.off')}</Tag>
            <Link to="/admin/settings/signin">{t('googleSettings.configure')} →</Link>
          </span>
        </SettingRow>
        <SettingRow label={t('googleSettings.calendar')} description={t('googleSettings.calendarDesc')}>
          <Form.Item name="calendar" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('googleSettings.gmail')} description={t('googleSettings.gmailDesc')}>
          <Form.Item name="gmailSend" valuePropName="checked" noStyle>
            <Switch disabled={!current.gmailTokenSet} />
          </Form.Item>
        </SettingRow>
        <div className="gmail-sender">
          {current.gmailTokenSet ? (
            <>
              <span className="gmail-sender__who">
                <Tag color="green" bordered={false}>{t('googleSettings.sender')}</Tag>
                <strong>{current.gmailSender}</strong>
              </span>
              <Popconfirm title={t('googleSettings.gmailDisconnectConfirm')} onConfirm={disconnectGmail}>
                <Button size="small" danger>{t('connections.disconnect')}</Button>
              </Popconfirm>
            </>
          ) : (
            <>
              <Text type="secondary">{configured ? t('googleSettings.gmailHint') : t('googleSettings.gmailNeedsClient')}</Text>
              <Button disabled={!configured || !current.enabled || dirty} onClick={() => startGoogle('gmail', '/admin/settings/google')}>
                {t('googleSettings.gmailConnect')}
              </Button>
            </>
          )}
        </div>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function GoogleSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <GoogleForm settings={settings} save={save} refresh={refresh} />}
      </LoadState>
    </>
  );
}
