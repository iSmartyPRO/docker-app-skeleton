import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Descriptions, Form, InputNumber } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes, formatDuration } from '../../../lib/format';
import { getAdminSystem } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';
import { HintLabel } from '../../../help/Hint';
import SystemReport from './SystemReport';

function RateLimitForm({ settings, save }) {
  const { t } = useLocale();
  const rate = settings.rateLimit || {};
  const initial = useMemo(
    () => ({
      max: rate.max || 300,
      userMax: rate.userMax || 5000,
      windowMinutes: Math.round((rate.windowMs || 900000) / 60000),
    }),
    [rate.max, rate.userMax, rate.windowMs]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (values) =>
    save({ rateLimit: { max: values.max, userMax: values.userMax, windowMs: values.windowMinutes * 60000 } })
  );
  return (
    <Form {...formProps}>
      <SettingsSection title={<HintLabel id="admin.rateLimit">{t('settings.system.limits')}</HintLabel>} description={t('settings.system.limitsDesc')}>
        <SettingRow label={t('settings.system.max')}>
          <Form.Item name="max" noStyle>
            <InputNumber min={20} max={100000} step={50} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('settings.system.userMax')} description={t('settings.system.userMaxDesc')}>
          <Form.Item name="userMax" noStyle>
            <InputNumber min={200} max={1000000} step={500} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('settings.system.windowMinutes')}>
          <Form.Item name="windowMinutes" noStyle>
            <InputNumber min={1} max={1440} suffix={t('settings.login.minutes')} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function SystemSettings() {
  const { t, locale } = useLocale();
  const admin = useAdminSettings();
  const [system, setSystem] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminSystem();
      setSystem(res.data.system);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const yesNo = (value) => (value ? t('settings.system.yes') : t('settings.system.no'));
  const db = system?.database || {};

  return (
    <>
      <SettingsPageHeader id="system" extra={<Button onClick={load} loading={loading}>{t('admin.historyRefresh')}</Button>} />
      <LoadState ready={Boolean(system) || !loading} error={error} onRetry={load}>
        {system && (
          <div className="system-grid">
            <SettingsSection title={t('settings.system.runtime')}>
              <Descriptions column={1} size="small" colon={false} className="kv">
                <Descriptions.Item label={t('settings.system.version')}>v{system.version}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.node')}>{system.node}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.environment')}>{system.environment}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.uptime')}>
                  {formatDuration(system.uptimeSeconds, locale)}
                </Descriptions.Item>
                <Descriptions.Item label={t('settings.system.timezone')}>{system.timezone}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.cookies')}>{yesNo(system.secureCookies)}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.setupToken')}>
                  {yesNo(system.setupTokenConfigured)}
                </Descriptions.Item>
              </Descriptions>
            </SettingsSection>
            <SettingsSection
              title={t('settings.system.database')}
              extra={
                <Badge
                  status={db.connected ? 'success' : 'error'}
                  text={db.connected ? t('settings.system.connected') : t('settings.system.disconnected')}
                />
              }
            >
              <Descriptions column={1} size="small" colon={false} className="kv">
                <Descriptions.Item label={t('settings.system.dbName')}>{db.name || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.dbHost')}>{db.host || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.dbVersion')}>{db.version || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('settings.system.dbSize')}>
                  {db.connected ? formatBytes(db.sizeBytes) : '—'}
                </Descriptions.Item>
              </Descriptions>
            </SettingsSection>
          </div>
        )}
      </LoadState>
      <LoadState ready={admin.ready} error={admin.error} onRetry={admin.refresh}>
        {admin.settings && <RateLimitForm settings={admin.settings} save={admin.save} />}
      </LoadState>
      <SystemReport />
    </>
  );
}
