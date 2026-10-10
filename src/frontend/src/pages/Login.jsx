import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import PublicLayout from '../layouts/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';

const { Title, Paragraph } = Typography;

export default function Login() {
  const { message } = App.useApp();
  const { user, ready, login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await login(values);
      message.success(t('common.signIn'));
      navigate('/', { replace: true });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PublicLayout>
      <div className="auth-wrap">
        <Card className="panel-card auth-card" variant="borderless">
          <Title level={2}>{t('login.title')}</Title>
          <Paragraph type="secondary">{t('login.lead')}</Paragraph>
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="username"
              label={t('login.username')}
              rules={[{ required: true }]}
            >
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label={t('login.password')}
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>
              {t('common.signIn')}
            </Button>
          </Form>
        </Card>
      </div>
    </PublicLayout>
  );
}
