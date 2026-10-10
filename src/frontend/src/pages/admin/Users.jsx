import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  App,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative, initials } from '../../lib/format';
import { createAdminUser, deleteAdminUser, listAdminUsers } from '../../services/api';

const { Text } = Typography;

export function UserStatusTag({ user }) {
  const { t } = useLocale();
  if (user.isBlocked) return <Tag color="red" bordered={false}>{t('users.blocked')}</Tag>;
  if (!user.isActive) return <Tag bordered={false}>{t('users.disabled')}</Tag>;
  return <Tag color="green" bordered={false}>{t('users.active')}</Tag>;
}

export function RoleTag({ role }) {
  const { t } = useLocale();
  return role === 'admin' ? (
    <Tag color="gold" bordered={false}>{t('users.roleAdmin')}</Tag>
  ) : (
    <Tag bordered={false}>{t('users.roleUser')}</Tag>
  );
}

function statusOf(user) {
  if (user.isBlocked) return 'blocked';
  if (!user.isActive) return 'disabled';
  return 'active';
}

function CreateUserModal({ open, onClose, onCreated }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const res = await createAdminUser(values);
      message.success(t('common.saved'));
      form.resetFields();
      onCreated(res.data.user);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('users.create')}
      okText={t('common.create')}
      cancelText={t('common.cancel')}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ role: 'user' }} requiredMark={false}>
        <Form.Item
          name="username"
          label={t('users.username')}
          extra={t('users.usernameHint')}
          rules={[
            { required: true, min: 3, max: 32, message: t('users.usernameHint') },
            { pattern: /^[a-zA-Z0-9._-]+$/, message: t('users.usernameHint') },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="displayName" label={t('users.displayName')}>
          <Input />
        </Form.Item>
        <Form.Item name="email" label={t('users.email')} rules={[{ type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label={t('users.password')} rules={[{ required: true, min: 10 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="role" label={t('users.role')}>
          <Segmented
            options={[
              { value: 'user', label: t('users.roleUser') },
              { value: 'admin', label: t('users.roleAdmin') },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function AdminUsers() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await listAdminUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (role !== 'all' && user.role !== role) return false;
      if (status !== 'all' && statusOf(user) !== status) return false;
      if (!q) return true;
      return [user.username, user.displayName, user.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [users, query, role, status]);

  const remove = async (user) => {
    try {
      await deleteAdminUser(user.id);
      message.success(t('users.deleted'));
      await load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        description={t('users.lead')}
        extra={
          <Button type="primary" onClick={() => setOpen(true)}>
            + {t('users.create')}
          </Button>
        }
      />
      <section className="panel">
        <header className="panel__head panel__head--filters">
          <Input.Search
            allowClear
            placeholder={t('users.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Select
            value={role}
            onChange={setRole}
            style={{ width: 170 }}
            options={[
              { value: 'all', label: t('users.allRoles') },
              { value: 'admin', label: t('users.roleAdmin') },
              { value: 'user', label: t('users.roleUser') },
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 170 }}
            options={[
              { value: 'all', label: t('users.allStatuses') },
              { value: 'active', label: t('users.active') },
              { value: 'disabled', label: t('users.disabled') },
              { value: 'blocked', label: t('users.blocked') },
            ]}
          />
          <Text type="secondary" className="panel__count">
            {t('users.count', { count: visible.length })}
          </Text>
        </header>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={visible}
          pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 760 }}
          onRow={(row) => ({
            onClick: (event) => {
              if (event.target.closest('button, a, .ant-popover')) return;
              navigate(`/admin/users/${row.id}`);
            },
            className: 'is-clickable',
          })}
          columns={[
            {
              title: t('users.username'),
              dataIndex: 'username',
              sorter: (a, b) => a.username.localeCompare(b.username),
              render: (_, row) => (
                <div className="user-cell">
                  <Avatar src={row.avatarUrl}>{initials(row.displayName || row.username)}</Avatar>
                  <div>
                    <Link to={`/admin/users/${row.id}`} className="user-cell__name">
                      {row.displayName || row.username}
                      {row.id === me?.id && <span className="user-cell__you"> ({t('users.you')})</span>}
                    </Link>
                    <div className="user-cell__meta">
                      @{row.username}
                      {row.email ? ` · ${row.email}` : ''}
                    </div>
                  </div>
                </div>
              ),
            },
            { title: t('users.role'), dataIndex: 'role', width: 140, render: (value) => <RoleTag role={value} /> },
            { title: t('users.status'), width: 140, render: (_, row) => <UserStatusTag user={row} /> },
            {
              title: t('users.lastLogin'),
              dataIndex: 'lastLoginAt',
              width: 170,
              sorter: (a, b) => new Date(a.lastLoginAt || 0) - new Date(b.lastLoginAt || 0),
              render: (value) =>
                value ? (
                  <span title={formatDateTime(value, locale)}>{formatRelative(value, locale)}</span>
                ) : (
                  <Text type="secondary">{t('common.never')}</Text>
                ),
            },
            {
              title: '',
              width: 120,
              align: 'right',
              render: (_, row) =>
                row.id === me?.id ? null : (
                  <Popconfirm
                    title={t('users.confirmDelete', { name: row.displayName || row.username })}
                    okText={t('common.delete')}
                    okButtonProps={{ danger: true }}
                    cancelText={t('common.cancel')}
                    onConfirm={() => remove(row)}
                  >
                    <Button type="text" danger size="small">
                      {t('common.delete')}
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </section>
      <CreateUserModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(created) => {
          setOpen(false);
          setUsers((list) => [...list, created]);
        }}
      />
    </div>
  );
}
