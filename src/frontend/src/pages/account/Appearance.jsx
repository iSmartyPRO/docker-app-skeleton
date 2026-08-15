import { useState } from 'react';
import { Button, Card, Form, Radio, Typography, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { updateAccountProfile } from '../../services/api';

const { Title } = Typography;

export default function AccountAppearance() {
  const { user, setUser } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const { setMode } = useThemeMode();
  const [saving, setSaving] = useState(false);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const res = await updateAccountProfile(values);
      setUser(res.data.user);
      setLocale(values.locale);
      setMode(values.theme === 'system' ? values.theme : values.theme);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={2}>{t('account.appearance')}</Title>
      <Card className="panel-card" bordered={false}>
        <Form
          layout="vertical"
          initialValues={{ locale: user?.locale || locale, theme: user?.theme || 'system' }}
          onFinish={onFinish}
        >
          <Form.Item name="locale" label={t('header.language')}>
            <Radio.Group>
              <Radio.Button value="en">English</Radio.Button>
              <Radio.Button value="ru">Русский</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="theme" label={t('header.theme')}>
            <Radio.Group>
              <Radio.Button value="light">{t('header.light')}</Radio.Button>
              <Radio.Button value="dark">{t('header.dark')}</Radio.Button>
              <Radio.Button value="system">System</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
