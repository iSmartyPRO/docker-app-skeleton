import { useState } from 'react';
import { App, Button, Form, Input } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { SettingsSection } from '../../components/ui/SettingsSection';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { changeAccountPassword, revokeOtherSessions } from '../../services/api';

export default function AccountSecurity() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const onFinish = async ({ currentPassword, password }) => {
    setSaving(true);
    try {
      await changeAccountPassword({ currentPassword, password });
      form.resetFields();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onRevoke = async () => {
    setRevoking(true);
    try {
      await revokeOtherSessions();
      message.success(t('account.revoked'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="narrow-page">
      <PageHeader title={t('account.security')} description={t('account.securityLead')} />
      <SettingsSection title={t('account.password')} description={t('account.passwordDesc')}>
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} style={{ maxWidth: 420 }}>
          <Form.Item name="currentPassword" label={t('account.currentPassword')} rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="password" label={t('account.newPassword')} rules={[{ required: true, min: 10 }]}>
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
      <SettingsSection title={t('account.sessions')} description={t('account.sessionsDesc')}>
        <Button onClick={onRevoke} loading={revoking}>
          {t('account.revokeOthers')}
        </Button>
      </SettingsSection>
    </div>
  );
}
