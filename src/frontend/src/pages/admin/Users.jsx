import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
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
import { useAccessData } from '../../hooks/useAccessData';
import { isSubset, roleLabel } from '../../lib/access';

const { Text } = Typography;

export function UserStatusTag({ user }) {
  const { t } = useLocale();
  if (user.isBlocked) return <Tag color="red" bordered={false}>{t('users.blocked')}</Tag>;
  if (!user.isActive) return <Tag bordered={false}>{t('users.disabled')}</Tag>;
  return <Tag color="green" bordered={false}>{t('users.active')}</Tag>;
}

const ROLE_COLOR = { superadmin: 'gold', admin: 'blue', moderator: 'cyan', auditor: 'purple' };

/** Effective roles of a user (direct + through groups), most powerful first. */
export function AccessTags({ user, max = 2 }) {
  const { t } = useLocale();
  const roles = [...(user.roles || [])].filter((role) => role.key !== 'user' || user.roles.length === 1);
  if (!roles.length) return <span className="muted">—</span>;
  return (
    <span className="access-tags">
      {roles.slice(0, max).map((role) => (
        <Tag key={role.id} color={ROLE_COLOR[role.key]} bordered={false}>
          {roleLabel(role, t)}
        </Tag>
      ))}
      {roles.length > max && <Tag bordered={false}>+{roles.length - max}</Tag>}
    </span>
  );
}

export function SourceBadge({ source }) {
  const { t } = useLocale();
  if (!source || source === 'local') return null;
  return <span className={`source-badge is-${source}`}>{t(`users.source_${source}`)}</span>;
}

function statusOf(user) {
  if (user.isBlocked) return 'blocked';
  if (!user.isActive) return 'disabled';
  return 'active';
}

function CreateUserModal({ open, onClose, onCreated, roles, groups }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user: me } = useAuth();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const holder = me?.permissions || [];
  const defaultGroup = groups.find((group) => group.isDefault);

  useEffect(() => {
    if (open) form.setFieldsValue({ groupIds: defaultGroup ? [defaultGroup.id] : [], roleIds: [] });
  }, [open, defaultGroup, form]);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const payload = { ...values };
      if (!payload.password) delete payload.password;
      if (!payload.phone) delete payload.phone;
      const res = await createAdminUser(payload);
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
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <div className="form-grid">
          <Form.Item
            name="username"
            label={t('users.username')}
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
          <Form.Item name="phone" label={t('users.phone')}>
            <Input placeholder="+996 700 123 456" inputMode="tel" />
          </Form.Item>
        </div>
        <Form.Item name="password" label={t('users.password')} extra={t('users.passwordOptional')} rules={[{ min: 10 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="groupIds" label={t('users.groups')}>
          <Select
            mode="multiple"
            options={groups.map((group) => ({
              value: group.id,
              label: group.name,
              disabled: !isSubset(group.roles.flatMap((role) => roles.find((r) => r.id === role.id)?.permissions || []), holder),
            }))}
          />
        </Form.Item>
        <Form.Item name="roleIds" label={t('users.directRoles')} extra={t('users.directRolesHint')}>
          <Select
            mode="multiple"
            options={roles.map((role) => ({
              value: role.id,
              label: roleLabel(role, t),
              disabled: !isSubset(role.permissions, holder),
            }))}
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
  const [group, setGroup] = useState('all');
  const access = useAccessData();
  const { can } = useAuth();
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
      if (role !== 'all' && !(user.roles || []).some((item) => item.id === role)) return false;
      if (group !== 'all' && !(user.groupIds || []).includes(group)) return false;
      if (status !== 'all' && statusOf(user) !== status) return false;
      if (!q) return true;
      return [user.username, user.displayName, user.email, user.phone, user.instagram, user.mattermost, user.telegram?.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [users, query, role, group, status]);

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
          can('users.manage') && (
            <Button type="primary" onClick={() => setOpen(true)} icon={<PlusOutlined />}>
              {t('users.create')}
            </Button>
          )
        }
      />
      <section className="panel">
        <header className="panel__head panel__head--filters">
          <Input.Search
            allowClear
            placeholder={t('users.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="panel__search"
          />
          <Select
            value={role}
            onChange={setRole}
            className="panel__filter"
            options={[
              { value: 'all', label: t('users.allRoles') },
              ...access.roles.map((item) => ({ value: item.id, label: roleLabel(item, t) })),
            ]}
          />
          <Select
            value={group}
            onChange={setGroup}
            className="panel__filter"
            options={[
              { value: 'all', label: t('users.allGroups') },
              ...access.groups.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            className="panel__filter"
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
          scroll={{ x: 980 }}
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
                      <SourceBadge source={row.authSource} />
                    </div>
                  </div>
                </div>
              ),
            },
            { title: t('users.access'), width: 230, render: (_, row) => <AccessTags user={row} /> },
            {
              title: t('users.groups'),
              width: 200,
              responsive: ['xxl'],
              render: (_, row) =>
                row.groups?.length ? (
                  <span className="muted-list">{row.groups.map((item) => item.name).join(', ')}</span>
                ) : (
                  <span className="muted">—</span>
                ),
            },
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
                // Same rule as the API: people with more access than you cannot be deleted by you.
                row.id === me?.id || !can('users.delete') || !isSubset(row.permissions || [], me?.permissions || []) ? null : (
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
        roles={access.roles}
        groups={access.groups}
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
