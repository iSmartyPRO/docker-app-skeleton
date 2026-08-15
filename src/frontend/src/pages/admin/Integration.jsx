import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Form, Input, InputNumber, Spin, Switch, Typography, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { saveAdminSettings, testAdminIntegration } from '../../services/api';

const { Title, Paragraph } = Typography;

const META = {
  email: {
    titleKey: 'admin.email',
    group: 'email',
    fields: [
      { name: 'host', label: 'host' },
      { name: 'port', label: 'port', type: 'number' },
      { name: 'user', label: 'user' },
      { name: 'password', label: 'password', secret: true },
      { name: 'from', label: 'from' },
    ],
  },
  telegram: {
    titleKey: 'admin.telegram',
    group: 'telegram',
    fields: [
      { name: 'botToken', label: 'token', secret: true },
      { name: 'defaultChatId', label: 'chatId' },
    ],
  },
  whatsapp: {
    titleKey: 'admin.whatsapp',
    group: 'whatsapp',
    fields: [
      { name: 'serverUrl', label: 'server' },
      { name: 'apiKey', label: 'apiKey', secret: true },
    ],
  },
  ad: {
    titleKey: 'admin.ad',
    group: 'activeDirectory',
    fields: [
      { name: 'host', label: 'host' },
      { name: 'port', label: 'port', type: 'number' },
      { name: 'bindDn', label: 'bindDn' },
      { name: 'bindPassword', label: 'password', secret: true },
      { name: 'baseDn', label: 'baseDn' },
    ],
  },
};

export default function AdminIntegration() {
  const { kind } = useParams();
  const meta = META[kind] || META.email;
  const { t } = useLocale();
  const { refresh: refreshPublic } = useSettings();
  const { settings, ready, refresh } = useAdminSettings();
  const current = settings?.integrations?.[meta.group] || {};
  const [saving, setSaving] = useState(false);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings({
        integrations: { [meta.group]: values },
      });
      await refresh();
      await refreshPublic();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    try {
      const res = await testAdminIntegration(meta.group);
      message.success(res.data?.message || 'OK');
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    }
  };

  if (!ready) {
    return <Spin />;
  }

  return (
    <div>
      <Title level={2}>{t(meta.titleKey)}</Title>
      <Paragraph type="secondary">{t('integrations.lead')}</Paragraph>
      <Card className="panel-card" bordered={false}>
        <Form
          key={meta.group}
          layout="vertical"
          initialValues={{
            enabled: Boolean(current.enabled),
            ...current,
            password: '',
            botToken: '',
            apiKey: '',
            bindPassword: '',
          }}
          onFinish={onFinish}
        >
          <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          {meta.fields.map((field) => (
            <Form.Item
              key={field.name}
              name={field.name}
              label={t(`integrations.${field.label}`)}
            >
              {field.type === 'number' ? (
                <InputNumber style={{ width: '100%' }} />
              ) : field.secret ? (
                <Input.Password placeholder={current[`${field.name}Set`] ? '••••••' : ''} />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
          <Button type="primary" htmlType="submit" loading={saving} style={{ marginRight: 8 }}>
            {t('common.save')}
          </Button>
          <Button onClick={onTest}>{t('common.test')}</Button>
        </Form>
      </Card>
    </div>
  );
}
