import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Steps,
  Typography,
} from 'antd';
import PublicLayout from '../layouts/PublicLayout';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';
import { useSettings } from '../context/SettingsContext';
import {
  completeSetup,
  getSetupStatus,
  saveSetupAccess,
  saveSetupDatabase,
  setSetupToken,
  testSetupDatabase,
} from '../services/api';

const { Title, Paragraph, Text } = Typography;

const stepIndex = (step) => {
  if (step === 'admin') return 1;
  if (step === 'access') return 2;
  if (step === 'done') return 3;
  return 0;
};

export default function SetupWizard() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { refresh } = useSettings();
  const [setupToken, setSetupTokenValue] = useState(() => sessionStorage.getItem('da_setup_token') || '');
  const [tokenRequired, setTokenRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [current, setCurrent] = useState(0);
  const [dbForm] = Form.useForm();
  const [adminForm] = Form.useForm();

  const refreshStatus = async () => {
    const res = await getSetupStatus();
    const data = res.data;
    setStatus(data);
    setTokenRequired(Boolean(data.setupTokenRequired));
    if (!data.needsSetup) {
      navigate('/', { replace: true });
      return data;
    }
    if (data.setupTokenRequired && !data.database) {
      return data;
    }
    setCurrent(stepIndex(data.step));
    if (data.database) {
      dbForm.setFieldsValue({
        host: data.database.host || 'postgres-18',
        port: data.database.port || 5432,
        database: data.database.database || 'docker_app_skeleton',
        user: data.database.user || 'docker_app_skeleton',
        password: '',
      });
    }
    return data;
  };

  useEffect(() => {
    refreshStatus()
      .catch((err) => message.error(errorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo(
    () => [
      { title: t('setup.database') },
      { title: t('setup.admin') },
      { title: t('setup.access') },
      { title: t('setup.done') },
    ],
    [t]
  );

  const onTestDb = async () => {
    try {
      const values = await dbForm.validateFields();
      setTesting(true);
      const res = await testSetupDatabase(values);
      message.success(res.data.database);
    } catch (err) {
      if (err.errorFields) return;
      message.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const onSaveDb = async () => {
    try {
      const values = await dbForm.validateFields();
      setSaving(true);
      await saveSetupDatabase(values);
      const next = await refreshStatus();
      if (next?.step === 'admin') setCurrent(1);
    } catch (err) {
      if (err.errorFields) return;
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onCreateAdmin = async () => {
    try {
      const values = await adminForm.validateFields();
      setSaving(true);
      await completeSetup(values);
      const next = await refreshStatus();
      if (next?.step === 'access') setCurrent(2);
    } catch (err) {
      if (err.errorFields) return;
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onSaveAccess = async (accessMode) => {
    setSaving(true);
    try {
      await saveSetupAccess({ accessMode });
      await refresh();
      navigate(accessMode === 'closed' ? '/login' : '/', { replace: true });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="auth-wrap">
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="setup-wrap">
        <Title level={2}>{t('setup.title')}</Title>
        <Paragraph type="secondary">{t('setup.lead')}</Paragraph>

        {tokenRequired && (
          <Card className="panel-card" variant="borderless" style={{ marginBottom: 16 }}>
            <Form layout="vertical">
              <Form.Item label={t('setup.token')} extra={t('setup.tokenHint')}>
                <Input.Password
                  value={setupToken}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSetupTokenValue(value);
                    setSetupToken(value);
                  }}
                  onPressEnter={() => {
                    setLoading(true);
                    refreshStatus()
                      .catch((err) => message.error(errorMessage(err)))
                      .finally(() => setLoading(false));
                  }}
                  autoComplete="off"
                />
              </Form.Item>
              <Button
                onClick={() => {
                  setLoading(true);
                  refreshStatus()
                    .catch((err) => message.error(errorMessage(err)))
                    .finally(() => setLoading(false));
                }}
              >
                {t('setup.unlock')}
              </Button>
            </Form>
          </Card>
        )}

        {tokenRequired && !status?.database && !status?.databaseConnected && status?.needsSetup && (
          <Alert type="info" showIcon message={t('setup.tokenRequired')} style={{ marginBottom: 16 }} />
        )}

        {status?.databaseError && current === 0 && (
          <Alert type="warning" showIcon message={status.databaseError} style={{ marginBottom: 16 }} />
        )}

        <Card className="panel-card" variant="borderless">
          <Steps current={current} items={steps} style={{ marginBottom: 32 }} />

          {current === 0 && (
            <Form
              form={dbForm}
              layout="vertical"
              initialValues={{
                host: 'postgres-18',
                port: 5432,
                database: 'docker_app_skeleton',
                user: 'docker_app_skeleton',
              }}
            >
              <Form.Item name="host" label="Host" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="port" label="Port" rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="database" label="Database" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="user" label="User" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
              <Space>
                <Button onClick={onTestDb} loading={testing}>
                  {t('common.test')}
                </Button>
                <Button type="primary" onClick={onSaveDb} loading={saving}>
                  {t('common.save')}
                </Button>
              </Space>
            </Form>
          )}

          {current === 1 && (
            <Form form={adminForm} layout="vertical">
              <Form.Item
                name="username"
                label={t('users.username')}
                rules={[
                  { required: true, min: 3, max: 32 },
                  { pattern: /^[a-zA-Z0-9._-]+$/, message: t('users.usernameHint') },
                ]}
              >
                <Input autoComplete="username" />
              </Form.Item>
              <Form.Item name="email" label={t('users.email')}>
                <Input type="email" />
              </Form.Item>
              <Form.Item
                name="password"
                label={t('users.password')}
                rules={[{ required: true, min: 10 }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="passwordConfirm"
                label={t('users.password')}
                dependencies={['password']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Passwords do not match'));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" onClick={onCreateAdmin} loading={saving}>
                {t('common.save')}
              </Button>
            </Form>
          )}

          {current === 2 && (
            <div className="mode-grid">
              <button type="button" className="mode-card" onClick={() => onSaveAccess('closed')} disabled={saving}>
                <strong>{t('setup.closedTitle')}</strong>
                <span>{t('setup.closedText')}</span>
              </button>
              <button type="button" className="mode-card" onClick={() => onSaveAccess('open')} disabled={saving}>
                <strong>{t('setup.openTitle')}</strong>
                <span>{t('setup.openText')}</span>
              </button>
            </div>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
}
