import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Avatar, Button, Form, Input, Popconfirm, Select, Switch, Tag, Upload } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import UserLinks from './UserLinks';
import UserPlacement from '../../modules/org/UserPlacement';
import '../../modules/org/org.css';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useAccessData } from '../../hooks/useAccessData';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, initials } from '../../lib/format';
import { isSubset, permKey, roleLabel } from '../../lib/access';
import {
  deleteAdminUser,
  getAdminUser,
  listAdminUserSessions,
  revokeAdminUserSession,
  revokeAdminUserSessions,
  updateAdminUser,
  uploadAdminUserAvatar,
} from '../../services/api';
import { AccessTags, SourceBadge, UserStatusTag } from './Users';
import { HintLabel } from '../../help/Hint';
import SessionList from '../../components/sessions/SessionList';

/** Sign-in method name; an unknown (newer) method shows as stored, not as an i18n key. */
function methodLabel(method, t) {
  const key = `users.method_${method}`;
  const label = t(key);
  return label === key ? method : label;
}

function UserForm({ user, onUpdated, roles, groups }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { user: me, setUser: setMe, can } = useAuth();
  const navigate = useNavigate();
  const isSelf = me?.id === user.id;
  const holder = me?.permissions || [];
  // Managing a user requires holding everything they hold (same rule as the API).
  const canManage = can('users.manage') && (isSelf || isSubset(user.permissions, holder));
  const [busy, setBusy] = useState(false);

  const groupPerms = (groupId) =>
    (groups.find((group) => group.id === groupId)?.roleIds || []).flatMap(
      (roleId) => roles.find((role) => role.id === roleId)?.permissions || []
    );

  const initial = useMemo(
    () => ({
      displayName: user.displayName || '',
      email: user.email || '',
      phone: user.phone || '',
      instagram: user.instagram || '',
      mattermost: user.mattermost || '',
      groupIds: user.groupIds || [],
      roleIds: user.roleIds || [],
      isActive: user.isActive,
      isBlocked: user.isBlocked,
      password: '',
    }),
    [user]
  );

  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    const patch = { ...values };
    if (!patch.password) delete patch.password;
    for (const key of ['email', 'phone', 'instagram', 'mattermost']) if (!patch[key]) patch[key] = null;
    if (isSelf) {
      delete patch.groupIds;
      delete patch.roleIds;
    }
    const res = await updateAdminUser(user.id, patch);
    form.setFieldsValue({ password: '' });
    onUpdated(res.data.user);
    if (isSelf) setMe((prev) => ({ ...prev, ...res.data.user }));
  });

  const loadSessions = useCallback(() => listAdminUserSessions(user.id), [user.id]);
  const revokeSession = useCallback((sid) => revokeAdminUserSession(user.id, sid), [user.id]);
  const revokeAll = useCallback(() => revokeAdminUserSessions(user.id), [user.id]);

  const run = async (request, success) => {
    setBusy(true);
    try {
      const result = await request();
      if (success) message.success(success);
      return result;
    } catch (err) {
      message.error(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="profile-hero">
        <Avatar size={72} src={user.avatarUrl}>
          {initials(user.displayName || user.username)}
        </Avatar>
        <div className="profile-hero__text">
          <div className="profile-hero__name">
            {user.displayName || user.username} <SourceBadge source={user.authSource} />
          </div>
          <div className="profile-hero__meta">
            @{user.username} · <UserStatusTag user={user} /> <AccessTags user={user} max={3} />
          </div>
          <div className="profile-hero__meta">
            {t('users.lastLogin')}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('common.never')}
            {user.lastLoginMethod ? ` · ${methodLabel(user.lastLoginMethod, t)}` : ''}
            {' · '}
            {t('users.created')}: {formatDateTime(user.createdAt, locale, { dateStyle: 'medium' })}
          </div>
        </div>
        {canManage && (
          <Upload
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              const data = new FormData();
              data.append('avatar', file);
              run(() => uploadAdminUserAvatar(user.id, data), t('common.saved')).then((res) => {
                if (res) onUpdated(res.data.user);
              });
              return false;
            }}
          >
            <Button loading={busy}>{t('account.changeAvatar')}</Button>
          </Upload>
        )}
      </section>

      {!canManage && <div className="callout">{t('users.readOnly')}</div>}

      <Form {...formProps} disabled={!canManage}>
        <SettingsSection title={t('users.profile')} description={t('users.profileDesc')}>
          <SettingRow label={t('users.displayName')}>
            <Form.Item name="displayName" noStyle>
              <Input maxLength={128} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('users.email')} description={t('users.emailSignIn')}>
            <Form.Item name="email" rules={[{ type: 'email' }]} style={{ margin: 0 }}>
              <Input />
            </Form.Item>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('users.contacts')} description={t('users.contactsDesc')}>
          <SettingRow label={t('users.phone')} description={t('users.phoneDesc')}>
            <Form.Item
              name="phone"
              style={{ margin: 0 }}
              validateStatus={user.phoneValid === false ? 'error' : undefined}
              help={user.phoneValid === false ? t('users.phoneInvalid') : undefined}
            >
              <Input placeholder="+996 700 123 456" inputMode="tel" />
            </Form.Item>
          </SettingRow>
          <SettingRow label="Mattermost" description={t('users.mattermostDesc')}>
            <Form.Item name="mattermost" style={{ margin: 0 }}>
              <Input prefix="@" placeholder="username" />
            </Form.Item>
          </SettingRow>
          <SettingRow label="Instagram">
            <Form.Item name="instagram" style={{ margin: 0 }}>
              <Input prefix="@" placeholder="username" />
            </Form.Item>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('users.access')} description={t('users.accessDesc')}>
          {isSelf && <div className="callout">{t('users.ownAccess')}</div>}
          <SettingRow label={<HintLabel id="admin.groups">{t('users.groups')}</HintLabel>} description={t('users.groupsDesc')}>
            <Form.Item name="groupIds" noStyle>
              <Select
                mode="multiple"
                style={{ width: '100%', maxWidth: 420 }}
                disabled={isSelf || !canManage}
                options={groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                  disabled: !isSubset(groupPerms(group.id), holder),
                }))}
              />
            </Form.Item>
          </SettingRow>
          <SettingRow label={<HintLabel id="admin.directRoles">{t('users.directRoles')}</HintLabel>} description={t('users.directRolesHint')}>
            <Form.Item name="roleIds" noStyle>
              <Select
                mode="multiple"
                style={{ width: '100%', maxWidth: 420 }}
                disabled={isSelf || !canManage}
                options={roles.map((role) => ({
                  value: role.id,
                  label: roleLabel(role, t),
                  disabled: !isSubset(role.permissions, holder),
                }))}
              />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('users.effective')} description={t('users.effectiveDesc')}>
            <span className="effective">
              {(user.permissions || []).includes('*') ? (
                <Tag color="gold" bordered={false}>{t('roles.fullAccess')}</Tag>
              ) : user.permissions?.length ? (
                user.permissions.map((perm) => (
                  <Tag key={perm} bordered={false}>{t(permKey(perm))}</Tag>
                ))
              ) : (
                <span className="muted">{t('users.cabinetOnly')}</span>
              )}
            </span>
          </SettingRow>
          <SettingRow label={t('users.active')} description={t('users.activeDesc')}>
            <Form.Item name="isActive" valuePropName="checked" noStyle>
              <Switch disabled={isSelf || !canManage} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={<HintLabel id="admin.blocked">{t('users.blocked')}</HintLabel>} description={t('users.blockedDesc')}>
            <Form.Item name="isBlocked" valuePropName="checked" noStyle>
              <Switch disabled={isSelf || !canManage} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>

        {!isSelf && (
        <SettingsSection
          title={t('users.passwordReset')}
          description={user.hasPassword ? t('users.passwordResetDesc') : t('users.noPasswordDesc')}
        >
          <SettingRow label={t('users.newPassword')}>
            <Form.Item name="password" rules={[{ min: 10 }]} style={{ margin: 0 }}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        )}
      </Form>

      <SettingsSection title={t('org.placement.title')} description={t('org.placement.desc')}>
        <UserPlacement userId={user.id} canEdit={can('users.manage') || can('org.manage')} />
      </SettingsSection>

      <UserLinks user={user} canManage={canManage} isSelf={isSelf} />

      {canManage && (
        <SettingsSection title={<HintLabel id="admin.sessions">{t('users.sessions')}</HintLabel>} description={t('users.sessionsDesc')}>
          <SessionList
            load={loadSessions}
            revoke={revokeSession}
            revokeAll={revokeAll}
            revokeAllScope="all"
            revokeAllLabel={t('users.revoke')}
            revokeAllConfirm={t('sessions.endAllConfirm')}
            revokeAllDone={t('users.revoked')}
            onRevokedAll={isSelf ? () => window.location.assign('/login') : undefined}
          />
        </SettingsSection>
      )}

      {!isSelf && canManage && can('users.delete') && (
        <SettingsSection title={t('users.danger')} description={t('users.dangerDesc')} danger>
          <Popconfirm
            title={t('users.confirmDelete', { name: user.displayName || user.username })}
            okText={t('common.delete')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
            onConfirm={() =>
              run(() => deleteAdminUser(user.id), t('users.deleted')).then((res) => {
                if (res) navigate('/admin/users');
              })
            }
          >
            <Button danger>{t('common.delete')}</Button>
          </Popconfirm>
        </SettingsSection>
      )}

      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </>
  );
}

export default function AdminUserEdit() {
  const { id } = useParams();
  const { t } = useLocale();
  const access = useAccessData();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getAdminUser(id);
      setUser(res.data.user);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setReady(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="narrow-page">
      <PageHeader
        back={{ to: '/admin/users', label: t('users.title') }}
        title={user ? user.displayName || user.username : t('common.loading')}
      />
      <LoadState ready={ready && access.ready} error={error || access.error} onRetry={load}>
        {user && (
          <UserForm
            key={user.id}
            user={user}
            onUpdated={setUser}
            roles={access.roles}
            groups={access.groups}
          />
        )}
      </LoadState>
    </div>
  );
}
