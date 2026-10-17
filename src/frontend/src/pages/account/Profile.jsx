import { useMemo, useState } from 'react';
import { App, Avatar, Button, Form, Input, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/ui/PageHeader';
import SaveBar from '../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { errorMessage } from '../../lib/errors';
import { initials } from '../../lib/format';
import { updateAccountProfile, uploadAccountAvatar } from '../../services/api';
import { Hint, HintLabel } from '../../help/Hint';

export default function AccountProfile() {
  const { user, setUser } = useAuth();
  const { t } = useLocale();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const initial = useMemo(
    () => ({
      displayName: user?.displayName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      instagram: user?.instagram || '',
      mattermost: user?.mattermost || '',
    }),
    [user?.displayName, user?.email, user?.phone, user?.instagram, user?.mattermost]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    const res = await updateAccountProfile({
      ...values,
      email: values.email || null,
      phone: values.phone || null,
      instagram: values.instagram || null,
      mattermost: values.mattermost || null,
    });
    setUser(res.data.user);
  });

  return (
    <div className="narrow-page">
      <PageHeader title={t('account.profile')} description={t('account.profileLead')} />
      <section className="profile-hero">
        <Avatar size={72} src={user?.avatarUrl}>
          {initials(user?.displayName || user?.username)}
        </Avatar>
        <div className="profile-hero__text">
          <div className="profile-hero__name">{user?.displayName || user?.username}</div>
          <div className="profile-hero__meta">@{user?.username}</div>
          <div className="profile-hero__meta">{t('account.avatarHint')} <Hint id="account.avatar" /></div>
          <div className="profile-hero__actions">
            <Upload
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={async (file) => {
                const form = new FormData();
                form.append('avatar', file);
                setUploading(true);
                try {
                  const res = await uploadAccountAvatar(form);
                  setUser(res.data.user);
                  message.success(t('common.saved'));
                } catch (err) {
                  message.error(errorMessage(err));
                } finally {
                  setUploading(false);
                }
                return false;
              }}
            >
              <Button loading={uploading} icon={<UploadOutlined />}>{t('account.changeAvatar')}</Button>
            </Upload>
          </div>
        </div>
      </section>
      <Form {...formProps}>
        <SettingsSection>
          <SettingRow label={t('users.displayName')}>
            <Form.Item name="displayName" noStyle>
              <Input maxLength={128} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={<HintLabel id="account.email">{t('users.email')}</HintLabel>}>
            <Form.Item name="email" rules={[{ type: 'email' }]} style={{ margin: 0 }}>
              <Input />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('users.contacts')} description={t('account.contactsDesc')}>
          <SettingRow label={<HintLabel id="account.phone">{t('users.phone')}</HintLabel>} description={t('users.phoneDesc')}>
            <Form.Item
              name="phone"
              style={{ margin: 0 }}
              validateStatus={user?.phoneValid === false ? 'error' : undefined}
              help={user?.phoneValid === false ? t('users.phoneInvalid') : undefined}
            >
              <Input placeholder="+996 700 123 456" inputMode="tel" />
            </Form.Item>
          </SettingRow>
          <SettingRow label={<HintLabel id="account.mattermost">Mattermost</HintLabel>} description={t('users.mattermostDesc')}>
            <Form.Item name="mattermost" style={{ margin: 0 }}>
              <Input prefix="@" placeholder={t('common.a11y.username')} />
            </Form.Item>
          </SettingRow>
          <SettingRow label="Instagram">
            <Form.Item name="instagram" style={{ margin: 0 }}>
              <Input prefix="@" placeholder={t('common.a11y.username')} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
      </Form>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </div>
  );
}
