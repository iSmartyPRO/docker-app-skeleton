import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { App, Button, Form, Input, Popconfirm } from 'antd';
import TelegramLoginButton from '../../components/TelegramLoginButton';
import { IconTelegram } from '../../components/icons/AdminIcons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import PageHeader from '../../components/ui/PageHeader';
import { SettingsSection } from '../../components/ui/SettingsSection';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { changeAccountPassword, listAccountSessions, revokeAccountSession, revokeOtherSessions, unlinkAccountTelegram } from '../../services/api';
import { HintLabel } from '../../help/Hint';
import SessionList from '../../components/sessions/SessionList';

export default function AccountSecurity() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { user, setUser } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const botUsername = settings?.auth?.telegram?.botUsername;
  const hasPassword = user?.hasPassword !== false;

  useEffect(() => {
    if (location.state?.telegramLinked) message.success(t('account.telegramLinked'));
  }, [location.state, message, t]);

  const unlink = async () => {
    try {
      const res = await unlinkAccountTelegram();
      setUser(res.data.user);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onFinish = async ({ currentPassword, password }) => {
    setSaving(true);
    try {
      const res = await changeAccountPassword({ currentPassword, password });
      if (res.data?.user) setUser(res.data.user);
      form.resetFields();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="narrow-page">
      <PageHeader title={t('account.security')} description={t('account.securityLead')} />
      <SettingsSection
        title={hasPassword ? t('account.password') : t('account.setPassword')}
        description={hasPassword ? t('account.passwordDesc') : t('account.setPasswordDesc')}
      >
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} style={{ maxWidth: 420 }}>
          {hasPassword && (
            <Form.Item name="currentPassword" label={t('account.currentPassword')} rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
          )}
          <Form.Item name="password" label={<HintLabel id="account.password">{t('account.newPassword')}</HintLabel>} rules={[{ required: true, min: 10 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t('account.confirmPassword')}
            dependencies={['password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('password') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('account.passwordMismatch'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </SettingsSection>
      {(botUsername || user?.telegram) && (
        <SettingsSection title={<HintLabel id="account.telegram">Telegram</HintLabel>} description={t('account.telegramDesc')}>
          {user?.telegram ? (
            <div className="linked-account">
              <IconTelegram />
              <span>{user.telegram.username ? `@${user.telegram.username}` : `ID ${user.telegram.id}`}</span>
              <Popconfirm title={t('users.unlinkTelegram')} onConfirm={unlink}>
                <Button size="small" type="text" danger>{t('users.unlink')}</Button>
              </Popconfirm>
            </div>
          ) : (
            <TelegramLoginButton botUsername={botUsername} intent="link" size="medium" />
          )}
        </SettingsSection>
      )}
      <SettingsSection title={<HintLabel id="account.sessions">{t('account.sessions')}</HintLabel>} description={t('account.sessionsDesc')}>
        <SessionList
          load={listAccountSessions}
          revoke={revokeAccountSession}
          revokeAll={revokeOtherSessions}
          revokeAllLabel={t('sessions.endOthers')}
          revokeAllConfirm={t('sessions.endOthersConfirm')}
          revokeAllDone={t('sessions.endOthersDone')}
          canRevoke={!user?.impersonator}
        />
      </SettingsSection>
    </div>
  );
}
