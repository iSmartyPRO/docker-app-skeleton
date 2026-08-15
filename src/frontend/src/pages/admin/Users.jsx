import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { createAdminUser, deleteAdminUser, listAdminUsers } from '../../services/api';

const { Title } = Typography;

export default function AdminUsers() {
  const { t } = useLocale();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await listAdminUsers();
    setUsers(res.data.users || []);
  };

  useEffect(() => {
    load().catch((err) => message.error(err.response?.data?.error || err.message));
  }, []);

  const onCreate = async (values) => {
    setSaving(true);
    try {
      await createAdminUser(values);
      setOpen(false);
      await load();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>
          {t('users.title')}
        </Title>
        <Button type="primary" onClick={() => setOpen(true)}>
          {t('users.create')}
        </Button>
      </Space>
      <Card className="panel-card" bordered={false}>
        <Table
          rowKey="id"
          dataSource={users}
          pagination={false}
          columns={[
            {
              title: t('users.avatar'),
              dataIndex: 'avatarUrl',
              render: (url, row) => (
                <Avatar src={url}>{(row.displayName || row.username || '?')[0]}</Avatar>
              ),
            },
            { title: t('users.username'), dataIndex: 'username' },
            { title: t('users.displayName'), dataIndex: 'displayName' },
            { title: t('users.role'), dataIndex: 'role' },
            {
              title: t('users.status'),
              render: (_, row) =>
                row.isBlocked ? (
                  <Tag color="red">{t('users.blocked')}</Tag>
                ) : (
                  <Tag color="green">{t('users.active')}</Tag>
                ),
            },
            {
              title: '',
              render: (_, row) => (
                <Space>
                  <Link to={`/admin/users/${row.id}`}>{t('common.edit')}</Link>
                  <Button
                    type="link"
                    danger
                    onClick={async () => {
                      await deleteAdminUser(row.id);
                      await load();
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={t('users.create')}
      >
        <Form layout="vertical" onFinish={onCreate}>
          <Form.Item
            name="username"
            label={t('users.username')}
            extra={t('users.usernameHint')}
            rules={[
              { required: true, min: 3, max: 32 },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: t('users.usernameHint') },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="displayName" label={t('users.displayName')}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('users.email')}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('users.password')} rules={[{ required: true, min: 10 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label={t('users.role')} initialValue="user">
            <Select
              options={[
                { value: 'user', label: 'user' },
                { value: 'admin', label: 'admin' },
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            {t('common.create')}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
