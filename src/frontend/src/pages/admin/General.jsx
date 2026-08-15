import { useState } from 'react';
import { Button, Card, Form, Input, Radio, Space, Typography, Upload, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { removeProjectLogo, saveAdminSettings, uploadProjectLogo } from '../../services/api';

const { Title, Paragraph } = Typography;

export default function AdminGeneral() {
  const { t } = useLocale();
  const { settings, refresh, setSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoUrl = settings?.appearance?.logoUrl;

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings(values);
      await refresh();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const applySettings = (next) => {
    if (next) setSettings(next);
  };

  return (
    <div>
      <Title level={2}>{t('admin.general')}</Title>
      <Card className="panel-card" bordered={false} style={{ marginBottom: 16 }}>
        <Title level={4}>{t('admin.logo')}</Title>
        <Paragraph type="secondary">{t('admin.logoHint')}</Paragraph>
        <div className="logo-field">
          <div className="logo-field__preview">
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <span className="chrome__mark" />
            )}
          </div>
          <Space wrap>
            <Upload
              accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
              showUploadList={false}
              beforeUpload={async (file) => {
                const form = new FormData();
                form.append('logo', file);
                setUploading(true);
                try {
                  const res = await uploadProjectLogo(form);
                  applySettings(res.data?.settings);
                  await refresh();
                  message.success(t('common.saved'));
                } catch (err) {
                  message.error(err.response?.data?.error || err.message);
                } finally {
                  setUploading(false);
                }
                return false;
              }}
            >
              <Button loading={uploading}>{t('admin.logoUpload')}</Button>
            </Upload>
            {logoUrl && (
              <Button
                onClick={async () => {
                  try {
                    const res = await removeProjectLogo();
                    applySettings(res.data?.settings);
                    await refresh();
                    message.success(t('common.saved'));
                  } catch (err) {
                    message.error(err.response?.data?.error || err.message);
                  }
                }}
              >
                {t('admin.logoRemove')}
              </Button>
            )}
          </Space>
        </div>
      </Card>
      <Card className="panel-card" bordered={false}>
        <Form
          layout="vertical"
          initialValues={{
            appName: settings?.appName,
            appDescription: settings?.appDescription,
            accessMode: settings?.accessMode || 'closed',
          }}
          onFinish={onFinish}
        >
          <Form.Item name="appName" label={t('admin.appName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="appDescription" label={t('admin.appDescription')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="accessMode" label={t('admin.accessMode')}>
            <Radio.Group>
              <Radio.Button value="closed">{t('common.closed')}</Radio.Button>
              <Radio.Button value="open">{t('common.open')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
