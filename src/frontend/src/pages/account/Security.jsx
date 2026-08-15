import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { changeAccountPassword } from '../../services/api';

const { Title } = Typography;

export default function AccountSecurity() {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await changeAccountPassword(values);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={2}>{t('account.security')}</Title>
      <Card className="panel-card" bordered={false}>
        <Form layout="vertical" style={{ maxWidth: 420 }} onFinish={onFinish}>
          <Form.Item
            name="currentPassword"
            label={t('account.currentPassword')}
            rules={[{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('account.newPassword')}
            rules={[{ required: true, min: 10 }]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
