import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Checkbox, Form, Input, InputNumber, Switch } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';

const CHECKLIST = ['notified', 'workOnly', 'indicator', 'scope', 'responsible'];

function RemoteForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.remote || { enabled: false, settings: {} };
  const acked = Boolean(state.settings?.policyAckAt);
  const [checks, setChecks] = useState(() => (acked ? CHECKLIST : []));
  const allChecked = CHECKLIST.every((key) => checks.includes(key));

  const initial = useMemo(() => ({
    enabled: state.enabled,
    guacdHost: state.settings?.guacdHost || '',
    guacdPort: state.settings?.guacdPort || 4822,
    requireConsentForControl: state.settings?.requireConsentForControl !== false,
    recording: Boolean(state.settings?.recording),
    retentionDays: state.settings?.retentionDays || 30,
    passbolt: Boolean(state.settings?.passbolt),
    policyAck: acked,
  }), [state]);

  const { dirty, saving, submit, reset, formProps, form, recompute } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { remote: { enabled, settings: rest } } })
  );

  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('remoteSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('remoteSettings.catalogue')} description={t('remoteSettings.catalogueDesc')}>
          <Link to="/app/remote">{t('apps.remote.name')} →</Link>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('remoteSettings.guacd')} description={t('remoteSettings.guacdDesc')}>
        <SettingRow label={t('remoteSettings.guacdHost')} description={t('remoteSettings.guacdHostDesc')}>
          <Form.Item name="guacdHost" noStyle><Input placeholder="guacd" style={{ width: 220 }} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('remoteSettings.guacdPort')}>
          <Form.Item name="guacdPort" noStyle><InputNumber min={1} max={65535} style={{ width: 120 }} /></Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('remoteSettings.conduct')} description={t('remoteSettings.conductDesc')}>
        <SettingRow label={t('remoteSettings.consent')} description={t('remoteSettings.consentDesc')}>
          <Form.Item name="requireConsentForControl" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('remoteSettings.recording')} description={t('remoteSettings.recordingDesc')}>
          <Form.Item name="recording" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('remoteSettings.retention')} description={t('remoteSettings.retentionDesc')}>
          <Form.Item name="retentionDays" noStyle><InputNumber min={1} max={3650} style={{ width: 120 }} addonAfter={t('remoteSettings.days')} /></Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('remoteSettings.passwords')} description={t('remoteSettings.passwordsDesc')}>
        <SettingRow label={t('remoteSettings.vault')} description={t('remoteSettings.vaultDesc')}>
          <Link to="/app/remote/vault">{t('remote.vault.title')} →</Link>
        </SettingRow>
        <SettingRow label={t('remoteSettings.passbolt')} description={t('remoteSettings.passboltDesc')}>
          <Form.Item name="passbolt" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('remoteSettings.policy')} description={t('remoteSettings.policyDesc')}>
        <Alert
          type={acked ? 'success' : 'warning'}
          showIcon
          icon={<SafetyCertificateOutlined />}
          message={acked ? t('remoteSettings.policyAcked') : t('remoteSettings.policyNeeded')}
          description={t('remoteSettings.policyIntro')}
          style={{ marginBottom: 12 }}
        />
        <div className="rm-checklist">
          {CHECKLIST.map((key) => (
            <Checkbox
              key={key}
              checked={checks.includes(key)}
              onChange={(e) => {
                const next = e.target.checked ? [...checks, key] : checks.filter((k) => k !== key);
                setChecks(next);
                const all = CHECKLIST.every((k) => next.includes(k));
                form.setFieldValue('policyAck', all);
                recompute();
              }}
            >
              {t(`remoteSettings.checklist.${key}`)}
            </Checkbox>
          ))}
        </div>
        <Form.Item name="policyAck" valuePropName="checked" hidden><Switch /></Form.Item>
        {!allChecked && <p className="rm-muted">{t('remoteSettings.policyPartial')}</p>}
      </SettingsSection>

      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function RemoteSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <RemoteForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
