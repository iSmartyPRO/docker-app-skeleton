import { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Checkbox, Drawer, Empty, Form, Input, Popconfirm, Select, Switch, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/ui/PageHeader';
import LoadState from '../../components/ui/LoadState';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useAccessData } from '../../hooks/useAccessData';
import { errorMessage } from '../../lib/errors';
import { initials } from '../../lib/format';
import { isSubset, roleDescription, roleLabel } from '../../lib/access';
import { createGroup, deleteGroup, listAdminUsers, updateGroup } from '../../services/api';
import { HintLabel } from '../../help/Hint';

/** Role picker as a list of checkboxes with explanations. */
function RoleChecklist({ roles, value = [], onChange, holder, disabled }) {
  const { t } = useLocale();
  return (
    <div className="role-checklist">
      {roles.map((role) => {
        const allowed = isSubset(role.permissions, holder);
        return (
          <label key={role.id} className={`perm-row${!allowed ? ' is-locked' : ''}`}>
            <Checkbox
              checked={value.includes(role.id)}
              disabled={disabled || !allowed}
              onChange={(event) =>
                onChange?.(event.target.checked ? [...value, role.id] : value.filter((id) => id !== role.id))
              }
            />
            <span>
              <strong>{roleLabel(role, t)}</strong>
              <small>{roleDescription(role, t)}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function GroupDrawer({ group, roles, users, open, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user: me, can } = useAuth();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isNew = !group?.id;
  const editable = can('groups.manage');

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: group?.name || '',
      description: group?.description || '',
      isDefault: Boolean(group?.isDefault),
      roleIds: group?.roleIds || [],
      memberIds: group?.memberIds || [],
    });
  }, [open, group, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values };
      if (group?.isDefault) delete payload.isDefault;
      if (isNew) await createGroup(payload);
      else await updateGroup(group.id, payload);
      message.success(t('common.saved'));
      onSaved();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteGroup(group.id);
      message.success(t('groups.deleted'));
      onSaved();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      destroyOnHidden
      title={isNew ? t('groups.create') : group.name}
      footer={
        editable && (
          <div className="drawer-footer">
            {!isNew && !group.isDefault && (
              <Popconfirm title={t('groups.confirmDelete')} okButtonProps={{ danger: true }} onConfirm={remove}>
                <Button danger type="text">{t('common.delete')}</Button>
              </Popconfirm>
            )}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="primary" loading={saving} onClick={save}>
              {isNew ? t('common.create') : t('common.save')}
            </Button>
          </div>
        )
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} disabled={!editable}>
        <Form.Item name="name" label={t('groups.name')} rules={[{ required: true, max: 80 }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="description" label={t('groups.description')}>
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
        <Form.Item
          name="isDefault"
          label={<HintLabel id="admin.defaultGroup">{t('groups.default')}</HintLabel>}
          extra={group?.isDefault ? t('groups.defaultLocked') : t('groups.defaultHint')}
          valuePropName="checked"
        >
          <Switch disabled={!editable || group?.isDefault} />
        </Form.Item>
        <Form.Item name="roleIds" label={<HintLabel id="admin.groupRoles">{t('groups.roles')}</HintLabel>} extra={t('groups.rolesHint')}>
          <RoleChecklist roles={roles} holder={me?.permissions || []} disabled={!editable} />
        </Form.Item>
        <Form.Item name="memberIds" label={t('groups.members')}>
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="search"
            placeholder={t('groups.addMembers')}
            options={users.map((user) => ({
              value: user.id,
              search: `${user.displayName} ${user.username} ${user.email || ''}`,
              disabled: user.id === me?.id,
              label: (
                <span className="member-option">
                  <Avatar size={20} src={user.avatarUrl}>{initials(user.displayName)}</Avatar>
                  {user.displayName}
                  <small>@{user.username}</small>
                </span>
              ),
            }))}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export default function AdminGroups() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { roles, groups, ready, error, refresh } = useAccessData();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    listAdminUsers().then((res) => setUsers(res.data.users || [])).catch(() => {});
  }, []);

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  return (
    <div>
      <PageHeader
        title={t('groups.title')}
        description={t('groups.lead')}
        extra={
          can('groups.manage') && (
            <Button type="primary" onClick={() => setEditing({})} icon={<PlusOutlined />}>
              {t('groups.create')}
            </Button>
          )
        }
      />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {groups.length === 0 ? (
          <Empty description={t('groups.empty')} />
        ) : (
          <div className="group-grid">
            {groups.map((group) => (
              <button key={group.id} type="button" className="group-card" onClick={() => setEditing(group)}>
                <span className="group-card__head">
                  <strong>{group.name}</strong>
                  {group.isDefault && <Tag color="blue" bordered={false}>{t('groups.defaultTag')}</Tag>}
                </span>
                <span className="group-card__desc">{group.description || '—'}</span>
                <span className="group-card__roles">
                  {group.roles.length ? (
                    group.roles.map((role) => (
                      <Tag key={role.id} bordered={false}>{roleLabel(role, t)}</Tag>
                    ))
                  ) : (
                    <span className="muted">{t('groups.noRoles')}</span>
                  )}
                </span>
                <span className="group-card__members">
                  <Avatar.Group max={{ count: 5 }} size={28}>
                    {group.memberIds.map((id) => {
                      const user = userById.get(id);
                      return (
                        <Avatar key={id} src={user?.avatarUrl}>
                          {initials(user?.displayName || '?')}
                        </Avatar>
                      );
                    })}
                  </Avatar.Group>
                  <span>{t('groups.memberCount', { count: group.memberCount })}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </LoadState>
      <GroupDrawer
        open={Boolean(editing)}
        group={editing?.id ? editing : null}
        roles={roles}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

export { RoleChecklist };
