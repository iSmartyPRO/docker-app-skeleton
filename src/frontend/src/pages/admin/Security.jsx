import { useState } from 'react';
import { Button, Card, Form, InputNumber, Spin, Switch, Typography, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { saveAdminSettings } from '../../services/api';

const { Title } = Typography;

export default function AdminSecurity() {
  const { t } = useLocale();
  const { settings, ready, refresh } = useAdminSettings();
  const [saving, setSaving] = useState(false);
  const security = settings?.security || {};

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings({ security: values });
      await refresh();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <Spin />;
  }

  return (
    <div>
      <Title level={2}>{t('admin.access')}</Title>
      <Card className="panel-card" bordered={false}>
        <Form
          layout="vertical"
          initialValues={{
            whitelistEnabled: Boolean(security.whitelistEnabled),
            blacklistEnabled: security.blacklistEnabled !== false,
            maxLoginAttempts: security.maxLoginAttempts || 8,
            lockoutMinutes: security.lockoutMinutes || 15,
          }}
          onFinish={onFinish}
        >
          <Form.Item name="whitelistEnabled" label={t('admin.whitelistEnabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="blacklistEnabled" label={t('admin.blacklistEnabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="maxLoginAttempts" label={t('admin.maxAttempts')}>
            <InputNumber min={3} max={30} />
          </Form.Item>
          <Form.Item name="lockoutMinutes" label={t('admin.lockout')}>
            <InputNumber min={5} max={180} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
