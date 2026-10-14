import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox, DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { userOptions } from '../../shared/People';
import { whApi } from '../api';

const COMMON_CURRENCIES = ['USD', 'KGS', 'RUB', 'EUR', 'KZT', 'CNY', 'UZS', 'TRY', 'AED'];
const TYPES = ['receipt', 'supplier_return', 'transfer', 'issue', 'return', 'writeoff', 'opening', 'correction', 'inventory', 'discrepancy', 'handover', 'storno'];

/** Rates «units per 1 base», one input per non-base currency. */
function RatesEditor({ value = {}, onChange, currencies = [], base }) {
  return (
    <div className="wh-rates">
      {currencies.filter((code) => code !== base).map((code) => (
        <div key={code} className="wh-rates__row">
          <span>1 {base} =</span>
          <InputNumber min={0} value={value[code]} onChange={(n) => onChange({ ...value, [code]: n })} style={{ width: 140 }} />
          <span>{code}</span>
        </div>
      ))}
    </div>
  );
}

function PrefixesEditor({ value = {}, onChange }) {
  const { t } = useLocale();
  return (
    <div className="wh-prefixes">
      {TYPES.map((type) => (
        <label key={type}>
          <span>{t(`wh.types.${type}`)}</span>
          <Input value={value[type]} onChange={(e) => onChange({ ...value, [type]: e.target.value })} maxLength={8} style={{ width: 90 }} />
        </label>
      ))}
    </div>
  );
}

/** The module settings form; `save(settings)` persists (module API or admin settings). */
export default function SettingsForm({ settings, save }) {
  const { t } = useLocale();
  const [people, setPeople] = useState(null);
  useEffect(() => {
    whApi.people().then((res) => setPeople(res.data.people)).catch(() => setPeople(null));
  }, []);
  const initial = useMemo(
    () => ({
      currency: settings.currency,
      currencies: settings.currencies || [],
      rates: settings.rates || {},
      approvalThreshold: settings.approvalThreshold,
      approvalThresholdCurrency: settings.approvalThresholdCurrency,
      approvalTypes: settings.approvalTypes || [],
      units: settings.units || [],
      numberPrefixes: settings.numberPrefixes || {},
      numberDigits: settings.numberDigits,
      everyoneCanView: Boolean(settings.everyoneCanView),
      closedUntil: settings.closedUntil || null,
      expiryWarnDays: settings.expiryWarnDays,
      serviceWarnDays: settings.serviceWarnDays,
      staleDays: settings.staleDays,
      lowStockDigest: Boolean(settings.lowStockDigest),
      lowStockRecipients: settings.lowStockRecipients || [],
    }),
    [settings]
  );
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, (values) => save(values));
  const currencies = Form.useWatch('currencies', form) || initial.currencies;
  const base = Form.useWatch('currency', form) || initial.currency;
  return (
    <Form {...formProps}>
      <SettingsSection title={t('wh.settings.access')}>
        <SettingRow label={t('wh.settings.everyoneCanView')} description={t('wh.settings.everyoneCanViewDesc')}>
          <Form.Item name="everyoneCanView" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.closedUntil')} description={t('wh.settings.closedUntilDesc')}>
          <Form.Item name="closedUntil" noStyle getValueProps={(value) => ({ value: dayToPicker(value) })} getValueFromEvent={(d) => dayFromPicker(d)}>
            <DatePicker allowClear />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('wh.settings.money')}>
        <SettingRow label={t('wh.settings.currencies')} description={t('wh.settings.currenciesDesc')} stacked>
          <Form.Item name="currencies" noStyle><Select mode="tags" options={COMMON_CURRENCIES.map((code) => ({ value: code, label: code }))} tokenSeparators={[',', ' ']} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.baseCurrency')} description={t('wh.settings.baseCurrencyDesc')}>
          <Form.Item name="currency" noStyle><Select options={currencies.map((code) => ({ value: code, label: code }))} style={{ minWidth: 120 }} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.rates')} description={t('wh.settings.ratesDesc')} stacked>
          <Form.Item name="rates" noStyle><RatesEditor currencies={currencies} base={base} /></Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('wh.settings.approval')} description={t('wh.settings.approvalDesc')}>
        <SettingRow label={t('wh.settings.threshold')} description={t('wh.settings.thresholdDesc')}>
          <div className="wh-inline">
            <Form.Item name="approvalThreshold" noStyle><InputNumber min={0} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="approvalThresholdCurrency" noStyle><Select options={[...new Set([...currencies, 'USD'])].map((code) => ({ value: code, label: code }))} style={{ width: 100 }} /></Form.Item>
          </div>
        </SettingRow>
        <SettingRow label={t('wh.settings.approvalTypes')} stacked>
          <Form.Item name="approvalTypes" noStyle><Checkbox.Group options={['writeoff', 'correction', 'inventory', 'supplier_return', 'issue'].map((value) => ({ value, label: t(`wh.types.${value}`) }))} /></Form.Item>
        </SettingRow>
        <Link to="/app/approvals/settings">{t('wh.settings.routeLink')} →</Link>
      </SettingsSection>
      <SettingsSection title={t('wh.settings.directories')}>
        <SettingRow label={t('wh.settings.units')} description={t('wh.settings.unitsDesc')} stacked>
          <Form.Item name="units" noStyle><Select mode="tags" tokenSeparators={[',']} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.numbering')} description={t('wh.settings.numberingDesc')} stacked>
          <Form.Item name="numberPrefixes" noStyle><PrefixesEditor /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.digits')}>
          <Form.Item name="numberDigits" noStyle><InputNumber min={1} max={8} style={{ width: 90 }} /></Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('wh.settings.notifications')}>
        <SettingRow label={t('wh.settings.lowStockDigest')} description={t('wh.settings.lowStockDigestDesc')}>
          <Form.Item name="lowStockDigest" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        {people && (
          <SettingRow label={t('wh.settings.lowStockRecipients')} description={t('wh.settings.lowStockRecipientsDesc')} stacked>
            <Form.Item name="lowStockRecipients" noStyle>
              <Select mode="multiple" options={userOptions(people)} filterOption={(input, option) => option.search.includes(input.toLowerCase())} />
            </Form.Item>
          </SettingRow>
        )}
        <SettingRow label={t('wh.settings.expiryWarnDays')}>
          <Form.Item name="expiryWarnDays" noStyle><InputNumber min={0} max={365} addonAfter={t('wh.days')} style={{ width: 160 }} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.serviceWarnDays')}>
          <Form.Item name="serviceWarnDays" noStyle><InputNumber min={0} max={90} addonAfter={t('wh.days')} style={{ width: 160 }} /></Form.Item>
        </SettingRow>
        <SettingRow label={t('wh.settings.staleDays')} description={t('wh.settings.staleDaysDesc')}>
          <Form.Item name="staleDays" noStyle><InputNumber min={7} max={3650} addonAfter={t('wh.days')} style={{ width: 160 }} /></Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}
