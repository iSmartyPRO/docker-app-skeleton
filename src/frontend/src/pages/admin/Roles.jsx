import { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Drawer, Form, Input, Popconfirm, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/ui/PageHeader';
import LoadState from '../../components/ui/LoadState';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useAccessData } from '../../hooks/useAccessData';
import { errorMessage } from '../../lib/errors';
import { isSubset, permKey, roleDescription, roleLabel } from '../../lib/access';
import { createRole, deleteRole, getPermissionCatalog, updateRole } from '../../services/api';
import { HintLabel } from '../../help/Hint';

const ROLE_TONE = {
  superadmin: 'tone-gold',
  admin: 'tone-blue',
  moderator: 'tone-teal',
  auditor: 'tone-violet',
  user: 'tone-gray',
};

/** Checkbox matrix grouped by area; every row explains what it allows. */
function PermissionMatrix({ catalog, value = [], onChange, disabled, holder }) {
  const { t } = useLocale();
  const full = value.includes('*');
  const toggle = (perm, checked) => {
    const next = new Set(value);
    if (checked) next.add(perm);
    else next.delete(perm);
    onChange?.([...next]);
  };
  return (
    <div className="perm-matrix">
      {catalog.map((group) => (
        <div key={group.group} className="perm-matrix__group">
          <div className="perm-matrix__title">{t(`permissions.groups.${group.group}`)}</div>
          {group.permissions.map((perm) => {
            const allowed = isSubset([perm], holder);
            const row = (
              <label key={perm} className={`perm-row${!allowed ? ' is-locked' : ''}`}>
                <Checkbox
                  checked={full || value.includes(perm)}
                  disabled={disabled || full || !allowed}
                  onChange={(event) => toggle(perm, event.target.checked)}
                />
                <span>
                  <strong>{t(permKey(perm))}</strong>
                  <small>{t(permKey(perm, 'desc'))}</small>
                </span>
                <code>{perm}</code>
              </label>
            );
            return allowed ? row : (
              <Tooltip key={perm} title={t('roles.notYours')}>
                {row}
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RoleDrawer({ role, catalog, open, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isNew = !role?.id;
  const locked = role?.isLocked;
  const editable = can('roles.manage') && !locked;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: role ? roleLabel(role, t) : '',
      description: role ? roleDescription(role, t) : '',
      permissions: role?.permissions || ['console.access'],
    });
  }, [open, role, form, t]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = role?.isSystem ? { permissions: values.permissions } : values;
      if (isNew) await createRole(payload);
      else await updateRole(role.id, payload);
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
      await deleteRole(role.id);
      message.success(t('roles.deleted'));
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
      title={isNew ? t('roles.create') : roleLabel(role, t)}
      extra={
        role?.isSystem && <Tag bordered={false}>{t('roles.system')}</Tag>
      }
      footer={
        editable && (
          <div className="drawer-footer">
            {!isNew && !role.isSystem && (
              <Popconfirm title={t('roles.confirmDelete')} okButtonProps={{ danger: true }} onConfirm={remove}>
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
      {locked && <div className="callout">{t('roles.lockedHint')}</div>}
      <Form form={form} layout="vertical" requiredMark={false} disabled={!editable}>
        <Form.Item name="name" label={t('roles.name')} rules={[{ required: true, max: 80 }]}>
          <Input disabled={role?.isSystem} maxLength={80} />
        </Form.Item>
        <Form.Item name="description" label={t('roles.description')}>
          <Input.TextArea rows={2} maxLength={300} disabled={role?.isSystem} />
        </Form.Item>
        <Form.Item name="permissions" label={<HintLabel id="admin.permissions">{t('roles.permissions')}</HintLabel>}>
          <PermissionMatrix catalog={catalog} disabled={!editable} holder={user?.permissions || []} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export default function AdminRoles() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { roles, ready, error, refresh } = useAccessData();
  const [catalog, setCatalog] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    getPermissionCatalog().then((res) => setCatalog(res.data.catalog || [])).catch(() => {});
  }, []);

  const totalPerms = useMemo(() => catalog.reduce((sum, group) => sum + group.permissions.length, 0), [catalog]);

  return (
    <div>
      <PageHeader
        title={t('roles.title')}
        description={t('roles.lead')}
        extra={
          can('roles.manage') && (
            <Button type="primary" onClick={() => setEditing({})} icon={<PlusOutlined />}>
              {t('roles.create')}
            </Button>
          )
        }
      />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        <div className="role-grid">
          {roles.map((role) => {
            const count = role.permissions.includes('*') ? totalPerms : role.permissions.length;
            return (
              <button key={role.id} type="button" className="role-card" onClick={() => setEditing(role)}>
                <span className={`role-card__badge ${ROLE_TONE[role.key] || 'tone-indigo'}`}>
                  {roleLabel(role, t).slice(0, 1)}
                </span>
                <span className="role-card__body">
                  <span className="role-card__title">
                    {roleLabel(role, t)}
                    {role.isSystem && <Tag bordered={false}>{t('roles.system')}</Tag>}
                  </span>
                  <span className="role-card__desc">{roleDescription(role, t)}</span>
                  <span className="role-card__meta">
                    <span>
                      {role.permissions.includes('*')
                        ? t('roles.fullAccess')
                        : t('roles.permCount', { count, total: totalPerms })}
                    </span>
                    <span>·</span>
                    <span>{t('roles.userCount', { direct: role.directUsers, groups: role.groupUsers })}</span>
                  </span>
                  {role.groups.length > 0 && (
                    <span className="role-card__groups">
                      {t('roles.viaGroups')}: {role.groups.map((group) => group.name).join(', ')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </LoadState>
      <RoleDrawer
        open={Boolean(editing)}
        role={editing?.id ? editing : null}
        catalog={catalog}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}
