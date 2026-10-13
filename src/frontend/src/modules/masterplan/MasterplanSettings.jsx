import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ColorPicker, Form, InputNumber, Select, Switch } from 'antd';
import api from '../../services/api';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { DEFAULT_COLORS, STATUSES } from './lib';
import '../shared/module.css';
import './masterplan.css';

const COMMON = ['USD', 'KGS', 'RUB', 'EUR', 'KZT', 'CNY', 'UZS', 'AED'];
const STAGE_ACTIONS = ['booking', 'deposit', 'contract', 'sold', 'free'];

/** CRM deal stage → unit status (settings.stageMap), per pipeline. */
function StageMap({ value = {}, onChange }) {
  const { t } = useLocale();
  const [pipelines, setPipelines] = useState(null);
  useEffect(() => {
    api
      .get('/app/crm/pipelines')
      .then((res) => setPipelines(res.data.pipelines || []))
      .catch(() => setPipelines([]));
  }, []);
  if (!pipelines) return null;
  if (!pipelines.length) return <p className="mp-muted">{t('mpSettings.noCrm')}</p>;
  return (
    <div className="mp-stagemap">
      {pipelines.map((pipeline) => (
        <div key={pipeline.id} className="mp-stagemap__pipe">
          <b><span className="mod-dot" style={{ '--c': pipeline.color }} /> {pipeline.name}</b>
          {pipeline.stages.map((stage) => (
            <label key={stage.id} className="mp-stagemap__row">
              <span><span className="status-pip" style={{ '--c': stage.color }} /> {stage.name}</span>
              <Select
                size="small"
                allowClear
                value={value[String(stage.id)]}
                onChange={(action) => {
                  const next = { ...value };
                  if (action) next[String(stage.id)] = action;
                  else delete next[String(stage.id)];
                  onChange(next);
                }}
                placeholder={t('mpSettings.noAction')}
                options={STAGE_ACTIONS.map((key) => ({ value: key, label: key === 'free' ? t('mpSettings.release') : t(`mp.status.${key}`) }))}
                style={{ width: 200 }}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function Rates({ value = {}, onChange, currencies, base }) {
  return (
    <div className="mp-rates">
      {currencies.filter((code) => code !== base).map((code) => (
        <label key={code}>
          <span>1 {base} =</span>
          <InputNumber min={0} value={value[code]} onChange={(rate) => onChange({ ...value, [code]: rate })} addonAfter={code} style={{ width: 180 }} />
        </label>
      ))}
    </div>
  );
}

function Colors({ value = {}, onChange }) {
  const { t } = useLocale();
  return (
    <div className="mp-colors">
      {STATUSES.map((status) => (
        <label key={status}>
          <ColorPicker value={value[status] || DEFAULT_COLORS[status]} onChange={(color) => onChange({ ...value, [status]: color.toHexString().toUpperCase() })} disabledAlpha size="small" />
          <span>{t(`mp.status.${status}`)}</span>
        </label>
      ))}
    </div>
  );
}

/** The settings form; `inApp` hides the module switch (masterplan.admin without console rights). */
export function MasterplanForm({ state, onSave, inApp }) {
  const { t } = useLocale();
  const initial = useMemo(() => ({ enabled: Boolean(state.enabled), ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, ({ enabled, ...settings }) => onSave({ enabled, settings }));
  const currencies = Form.useWatch('currencies', form) || initial.currencies || [];
  const base = Form.useWatch('currency', form) || initial.currency;
  const num = (name, label, desc, props = {}) => (
    <SettingRow label={label} description={desc}>
      <Form.Item name={name} noStyle>
        <InputNumber min={0} style={{ width: 140 }} {...props} />
      </Form.Item>
    </SettingRow>
  );
  return (
    <Form {...formProps}>
      <SettingsSection>
        {!inApp && (
          <SettingRow label={t('modules.enabledLabel')} description={t('mpSettings.enabledDesc')}>
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </SettingRow>
        )}
        {inApp && <Form.Item name="enabled" hidden valuePropName="checked"><Switch /></Form.Item>}
        <SettingRow label={t('mpSettings.open')} description={t('mpSettings.openDesc')}>
          <span className="cs-links">
            <Link to="/app/masterplan">{t('apps.masterplan.name')} →</Link>
            {!inApp && <Link to="/admin/roles">{t('mpSettings.roles')} →</Link>}
          </span>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('mpSettings.booking')} description={t('mpSettings.bookingDesc')}>
        {num('reserveHours', t('mpSettings.reserveHours'), t('mpSettings.reserveHoursDesc'), { max: 336, addonAfter: t('mpSettings.hours') })}
        {num('bookingDays', t('mpSettings.bookingDays'), t('mpSettings.bookingDaysDesc'), { max: 120, addonAfter: t('mpSettings.days') })}
        {num('managerExtensions', t('mpSettings.extensions'), t('mpSettings.extensionsDesc'), { max: 10 })}
        {num('reserveLimit', t('mpSettings.limit'), t('mpSettings.limitDesc'), { max: 1000 })}
        <SettingRow label={t('mpSettings.warn')} description={t('mpSettings.warnDesc')}>
          <Form.Item name="warnHours" noStyle normalize={(list) => (list || []).map(Number).filter((n) => n > 0)}>
            <Select mode="tags" style={{ minWidth: 160 }} tokenSeparators={[',', ' ']} options={[48, 24, 12, 2, 1].map((n) => ({ value: n, label: `${n} ${t('mpSettings.hoursShort')}` }))} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('mpSettings.requireDeal')} description={t('mpSettings.requireDealDesc')}>
          <Form.Item name="requireDeal" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('mpSettings.prices')} description={t('mpSettings.pricesDesc')}>
        <SettingRow label={t('mpSettings.fixPrice')} description={t('mpSettings.fixPriceDesc')}>
          <Form.Item name="fixPriceOnBooking" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        {num('salesHeadMaxCutPct', t('mpSettings.cut'), t('mpSettings.cutDesc'), { max: 100, addonAfter: '%' })}
        <SettingRow label={t('mpSettings.currency')}>
          <Form.Item name="currency" noStyle>
            <Select options={currencies.map((code) => ({ value: code, label: code }))} style={{ width: 120 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('mpSettings.currencies')} description={t('mpSettings.currenciesDesc')} stacked>
          <Form.Item name="currencies" noStyle>
            <Select mode="tags" options={COMMON.map((code) => ({ value: code, label: code }))} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('mpSettings.rates')} description={t('mpSettings.ratesDesc')} stacked>
          <Form.Item name="rates" noStyle>
            <Rates currencies={currencies} base={base} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('mpSettings.statuses')} description={t('mpSettings.statusesDesc')}>
        <Form.Item name="statusColors" noStyle>
          <Colors />
        </Form.Item>
      </SettingsSection>

      <SettingsSection title={t('mpSettings.construction')} description={t('mpSettings.constructionDesc')}>
        {num('staleReportDays', t('mpSettings.stale'), t('mpSettings.staleDesc'), { max: 365, addonAfter: t('mpSettings.days') })}
        {num('delayAlertDays', t('mpSettings.delay'), t('mpSettings.delayDesc'), { max: 365, addonAfter: t('mpSettings.days') })}
        {num('maxUploadMb', t('mpSettings.upload'), t('mpSettings.uploadDesc'), { max: 500, addonAfter: 'MB' })}
      </SettingsSection>

      <SettingsSection title={t('mpSettings.crm')} description={t('mpSettings.crmDesc')}>
        <SettingRow label={t('mpSettings.syncAmount')} description={t('mpSettings.syncAmountDesc')}>
          <Form.Item name="syncDealAmount" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('mpSettings.stageMap')} description={t('mpSettings.stageMapDesc')} stacked>
          <Form.Item name="stageMap" noStyle>
            <StageMap />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** /admin/settings/masterplan — the module's settings in the console. */
export default function MasterplanSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && (
          <MasterplanForm
            state={settings.modules?.masterplan || { enabled: false, settings: {} }}
            onSave={({ enabled, settings: values }) => save({ modules: { masterplan: { enabled, settings: values } } })}
          />
        )}
      </LoadState>
    </>
  );
}
