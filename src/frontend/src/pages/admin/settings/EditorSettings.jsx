import { useMemo, useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Select, Switch, Tag, Typography } from 'antd';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import SaveBar from '../../../components/ui/SaveBar';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { testAdminIntegration } from '../../../services/api';

const { Text } = Typography;
const TYPES = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'xls', 'ppt', 'rtf', 'csv', 'txt', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx', 'odg'];

/**
 * Settings → Documents → «Онлайн-редактор»: Collabora Online over WOPI
 * (integrations.documents.editing; see docs/office-editing.md).
 */
export default function EditorSettings({ settings, save }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const current = settings.integrations?.documents?.editing || {};
  const initial = useMemo(
    () => ({
      enabled: Boolean(current.enabled),
      serverUrl: current.serverUrl || '',
      discoveryUrl: current.discoveryUrl || '',
      wopiBaseUrl: current.wopiBaseUrl || '',
      allowedTypes: current.allowedTypes || ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'],
      openByDefault: current.openByDefault !== false,
      tokenHours: current.tokenHours || 10,
    }),
    [current]
  );
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (values) => save({ integrations: { documents: { editing: values } } }));
  const enabled = Form.useWatch('enabled', form);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const onTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await testAdminIntegration('documentsEditor', { editing: form.getFieldsValue(true) });
      setResult(res.data);
      message.success(res.data?.message || 'OK');
    } catch (err) {
      setResult({ error: errorMessage(err) });
      message.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form {...formProps}>
      <SettingsSection
        title={t('office.settings.title')}
        description={t('office.settings.desc')}
        extra={
          <Button onClick={onTest} loading={testing}>
            {t('office.settings.test')}
          </Button>
        }
      >
        <SettingRow label={t('office.settings.enabled')} description={t('office.settings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <div className={enabled ? '' : 'is-muted'}>
          <SettingRow label={t('office.settings.serverUrl')} description={t('office.settings.serverUrlDesc')}>
            <Form.Item name="serverUrl" noStyle>
              <Input placeholder="https://collabora.example.com" />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('office.settings.discoveryUrl')} description={t('office.settings.discoveryUrlDesc')}>
            <Form.Item name="discoveryUrl" noStyle>
              <Input placeholder="http://collabora:9980" />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('office.settings.wopiBaseUrl')} description={t('office.settings.wopiBaseUrlDesc')}>
            <Form.Item name="wopiBaseUrl" noStyle>
              <Input placeholder="https://portal.example.com" />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('office.settings.types')} description={t('office.settings.typesDesc')}>
            <Form.Item name="allowedTypes" noStyle>
              <Select mode="multiple" style={{ minWidth: 260, maxWidth: '100%' }} options={TYPES.map((ext) => ({ value: ext, label: `.${ext}` }))} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('office.settings.openByDefault')} description={t('office.settings.openByDefaultDesc')}>
            <Form.Item name="openByDefault" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('office.settings.tokenHours')} description={t('office.settings.tokenHoursDesc')}>
            <Form.Item name="tokenHours" noStyle>
              <InputNumber min={1} max={24} style={{ width: 100 }} />
            </Form.Item>
          </SettingRow>
        </div>
        {result?.error && <Alert type="error" showIcon message={result.error} style={{ marginTop: 12 }} />}
        {result?.ok && (
          <div style={{ marginTop: 12 }}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label={t('office.settings.product')}>{result.product ? `${result.product.name} ${result.product.version || ''}` : '—'}</Descriptions.Item>
              <Descriptions.Item label={t('office.settings.formats')}>
                {(result.allowed || []).map((ext) => (
                  <Tag key={ext} color="green">.{ext}</Tag>
                ))}
                {(result.missing || []).map((ext) => (
                  <Tag key={ext} color="red">.{ext}</Tag>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label={t('office.settings.callback')}>
                {result.callback?.ok ? <Tag color="green">{t('office.settings.callbackOk')}</Tag> : <Tag color="orange">{result.callback?.error || t('office.settings.callbackBad')}</Tag>}
                <Text type="secondary"> {result.callback?.url}</Text>
              </Descriptions.Item>
            </Descriptions>
            {result.collabora && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={t('office.settings.collaboraTitle')}
                description={
                  <div className="office-collabora-values">
                    <div>{t('office.settings.collaboraText')}</div>
                    <code>aliasgroupN={result.collabora.aliasgroup}</code>
                    <code>--o:storage.wopi.host[N]={result.collabora.wopiHost}</code>
                  </div>
                }
              />
            )}
          </div>
        )}
        <Text type="secondary" className="section-footnote">
          {t('office.settings.footnote')}
        </Text>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}
