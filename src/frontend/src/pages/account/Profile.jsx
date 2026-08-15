import { useState } from 'react';
import { Avatar, Button, Card, Form, Input, Typography, Upload, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { updateAccountProfile, uploadAccountAvatar } from '../../services/api';

const { Title, Paragraph } = Typography;

export default function AccountProfile() {
  const { user, setUser } = useAuth();
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const res = await updateAccountProfile(values);
      setUser(res.data.user);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={2}>{t('account.profile')}</Title>
      <Card className="panel-card" bordered={false}>
        <Avatar size={80} src={user?.avatarUrl} style={{ marginBottom: 16 }}>
          {(user?.displayName || user?.username || '?')[0]}
        </Avatar>
        <Paragraph type="secondary">{t('account.avatarHint')}</Paragraph>
        <Upload
          showUploadList={false}
          beforeUpload={async (file) => {
            const form = new FormData();
            form.append('avatar', file);
            const res = await uploadAccountAvatar(form);
            setUser(res.data.user);
            message.success(t('common.saved'));
            return false;
          }}
        >
          <Button>{t('users.avatar')}</Button>
        </Upload>
        <Form
          layout="vertical"
          style={{ marginTop: 24, maxWidth: 480 }}
          initialValues={{
            displayName: user?.displayName,
            email: user?.email,
          }}
          onFinish={onFinish}
        >
          <Form.Item name="displayName" label={t('users.displayName')}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('users.email')}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
