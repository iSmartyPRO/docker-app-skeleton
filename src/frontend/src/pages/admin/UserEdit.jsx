import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Select,
  Switch,
  Typography,
  Upload,
  message,
} from 'antd';
import { useLocale } from '../../context/LocaleContext';
import {
  getAdminUser,
  updateAdminUser,
  uploadAdminUserAvatar,
} from '../../services/api';

const { Title } = Typography;

export default function AdminUserEdit() {
  const { id } = useParams();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminUser(id)
      .then((res) => setUser(res.data.user))
      .catch((err) => message.error(err.response?.data?.error || err.message));
  }, [id]);

  if (!user) return null;

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const res = await updateAdminUser(id, values);
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
      <Title level={2}>{user.displayName || user.username}</Title>
      <Card className="panel-card" bordered={false}>
        <Avatar size={72} src={user.avatarUrl} style={{ marginBottom: 16 }}>
          {(user.displayName || user.username || '?')[0]}
        </Avatar>
        <Upload
          showUploadList={false}
          beforeUpload={async (file) => {
            const form = new FormData();
            form.append('avatar', file);
            const res = await uploadAdminUserAvatar(id, form);
            setUser(res.data.user);
            message.success(t('common.saved'));
            return false;
          }}
        >
          <Button>{t('users.avatar')}</Button>
        </Upload>
        <Form
          layout="vertical"
          style={{ marginTop: 24 }}
          initialValues={{
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            isBlocked: user.isBlocked,
            locale: user.locale,
            theme: user.theme,
          }}
          onFinish={onFinish}
        >
          <Form.Item name="displayName" label={t('users.displayName')}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('users.email')}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('users.role')}>
            <Select
              options={[
                { value: 'user', label: 'user' },
                { value: 'admin', label: 'admin' },
              ]}
            />
          </Form.Item>
          <Form.Item name="isActive" label={t('users.active')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isBlocked" label={t('users.blocked')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="password" label={t('users.password')} rules={[{ min: 10 }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} style={{ marginRight: 8 }}>
            {t('common.save')}
          </Button>
          <Button onClick={() => navigate('/admin/users')}>{t('common.cancel')}</Button>
        </Form>
      </Card>
    </div>
  );
}
