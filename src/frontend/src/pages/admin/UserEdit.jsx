import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Avatar, Button, Form, Input, Popconfirm, Segmented, Switch, Upload } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, initials } from '../../lib/format';
import {
  deleteAdminUser,
  getAdminUser,
  revokeAdminUserSessions,
  updateAdminUser,
  uploadAdminUserAvatar,
} from '../../services/api';
import { RoleTag, UserStatusTag } from './Users';

function UserForm({ user, onUpdated }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { user: me, setUser: setMe } = useAuth();
  const navigate = useNavigate();
  const isSelf = me?.id === user.id;
  const [busy, setBusy] = useState(false);

  const initial = useMemo(
    () => ({
      displayName: user.displayName || '',
      email: user.email || '',
      role: user.role,
      isActive: user.isActive,
      isBlocked: user.isBlocked,
      password: '',
    }),
    [user]
  );

  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    const patch = { ...values };
    if (!patch.password) delete patch.password;
    if (!patch.email) patch.email = null;
    const res = await updateAdminUser(user.id, patch);
    form.setFieldsValue({ password: '' });
    onUpdated(res.data.user);
    if (isSelf) setMe((prev) => ({ ...prev, ...res.data.user }));
  });

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
          <div className="profile-hero__name">{user.displayName || user.username}</div>
          <div className="profile-hero__meta">
            @{user.username} · <RoleTag role={user.role} /> <UserStatusTag user={user} />
          </div>
          <div className="profile-hero__meta">
            {t('users.lastLogin')}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('common.never')}
            {' · '}
            {t('users.created')}: {formatDateTime(user.createdAt, locale, { dateStyle: 'medium' })}
          </div>
        </div>
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
      </section>

      <Form {...formProps}>
        <SettingsSection title={t('users.profile')} description={t('users.profileDesc')}>
          <SettingRow label={t('users.displayName')}>
            <Form.Item name="displayName" noStyle>
              <Input maxLength={128} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('users.email')}>
            <Form.Item name="email" rules={[{ type: 'email' }]} style={{ margin: 0 }}>
              <Input />
            </Form.Item>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('users.access')} description={t('users.accessDesc')}>
          <SettingRow label={t('users.role')}>
            <Form.Item name="role" noStyle>
              <Segmented
                disabled={isSelf}
                options={[
                  { value: 'user', label: t('users.roleUser') },
                  { value: 'admin', label: t('users.roleAdmin') },
                ]}
              />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('users.active')} description={t('users.activeDesc')}>
            <Form.Item name="isActive" valuePropName="checked" noStyle>
              <Switch disabled={isSelf} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('users.blocked')} description={t('users.blockedDesc')}>
            <Form.Item name="isBlocked" valuePropName="checked" noStyle>
              <Switch disabled={isSelf} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('users.passwordReset')} description={t('users.passwordResetDesc')}>
          <SettingRow label={t('users.newPassword')}>
            <Form.Item name="password" rules={[{ min: 10 }]} style={{ margin: 0 }}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
      </Form>

      <SettingsSection title={t('users.sessions')} description={t('users.sessionsDesc')}>
        <Button
          loading={busy}
          onClick={() =>
            run(() => revokeAdminUserSessions(user.id), t('users.revoked')).then((res) => {
              if (res && isSelf) window.location.assign('/login');
            })
          }
        >
          {t('users.revoke')}
        </Button>
      </SettingsSection>

      {!isSelf && (
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
      <LoadState ready={ready} error={error} onRetry={load}>
        {user && <UserForm key={user.id} user={user} onUpdated={setUser} />}
      </LoadState>
    </div>
  );
}
