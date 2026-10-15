import { useMemo } from 'react';
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { formatNumber } from './numbering';
import './contracts.css';

const COMMON_CURRENCIES = ['KGS', 'USD', 'RUB', 'EUR', 'KZT', 'CNY', 'UZS', 'TRY', 'AED', 'GBP'];

/** Contract types: stock ones keep their translated name unless renamed; custom ones need a name. */
function TypesEditor({ value = [], onChange }) {
  const { t } = useLocale();
  const stock = (key) => {
    const name = t(`contracts.types.${key}`);
    return name.startsWith('contracts.types.') ? '' : name;
  };
  const set = (index, patch) => onChange(value.map((type, i) => (i === index ? { ...type, ...patch } : type)));
  return (
    <div className="ctr-types-editor">
      {value.map((type, index) => (
        <div key={type.key} className="ctr-types-editor__row">
          <span className="ctr-types-editor__dot" aria-hidden="true" />
          <Input value={type.label} placeholder={stock(type.key) || t('contracts.settings.typeName')} onChange={(e) => set(index, { label: e.target.value })} maxLength={60} aria-label={t('contracts.settings.typeName')} />
          <Button
            type="text"
            disabled={index === 0}
            onClick={() => {
              const next = [...value];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onChange(next);
            }}
            aria-label={t('contracts.settings.up')}
          >
            ↑
          </Button>
          <Button type="text" danger onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('common.delete')} disabled={value.length <= 1}>
            ✕
          </Button>
        </div>
      ))}
      <Button onClick={() => onChange([...value, { key: `c${Date.now().toString(36)}`, label: '' }])} icon={<PlusOutlined />}>{t('contracts.settings.addType')}</Button>
    </div>
  );
}

/**
 * The settings form. `state` = { enabled, settings }; `onSave({ enabled, settings })`.
 * In the app (contracts.admin without console rights) the module switch is hidden.
 */
export function ContractsForm({ state, onSave, inApp }) {
  const { t } = useLocale();
  const initial = useMemo(
    () => ({
      enabled: Boolean(state.enabled),
      prefix: 'ДГ',
      types: [],
      currencies: ['USD', 'KGS', 'RUB'],
      defaultCurrency: 'KGS',
      reminderDays: [30, 7],
      expiringDays: 30,
      maxUploadMb: 50,
      paymentSoonDays: 7,
      paymentReminderDays: [3, 0],
      ...state.settings,
    }),
    [state]
  );
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, ({ enabled, types, ...rest }) =>
    onSave({ enabled, settings: { ...rest, types: (types || []).filter((type) => type.label?.trim() || !type.key.startsWith('c')).map((type) => ({ key: type.key, label: (type.label || '').trim() })) } })
  );
  const prefix = Form.useWatch('prefix', form) ?? initial.prefix;
  const currencies = Form.useWatch('currencies', form) || initial.currencies;

  return (
    <Form {...formProps}>
      <SettingsSection>
        {!inApp && (
          <SettingRow label={t('contracts.settings.enabled')} description={t('contracts.settings.enabledDesc')}>
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </SettingRow>
        )}
        {inApp && (
          <Form.Item name="enabled" hidden valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        <SettingRow label={t('contracts.settings.prefix')} description={t('contracts.settings.prefixDesc', { example: formatNumber(prefix, 1) })}>
          <Form.Item name="prefix" noStyle>
            <Input maxLength={12} style={{ width: 120 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('contracts.settings.currencies')} description={t('contracts.settings.currenciesDesc')}>
          <Form.Item name="currencies" noStyle>
            <Select mode="tags" style={{ minWidth: 240 }} options={COMMON_CURRENCIES.map((code) => ({ value: code, label: code }))} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('contracts.settings.defaultCurrency')}>
          <Form.Item name="defaultCurrency" noStyle>
            <Select style={{ width: 120 }} options={currencies.map((code) => ({ value: code, label: code }))} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('contracts.settings.terms')} description={t('contracts.settings.termsDesc')}>
        <SettingRow label={t('contracts.settings.expiringDays')} description={t('contracts.settings.expiringDaysDesc')}>
          <Form.Item name="expiringDays" noStyle>
            <InputNumber min={1} max={365} addonAfter={t('contracts.form.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('contracts.settings.reminderDays')} description={t('contracts.settings.reminderDaysDesc')}>
          <Form.Item name="reminderDays" noStyle>
            <Select mode="tags" style={{ minWidth: 200 }} options={[60, 30, 14, 7, 3, 1].map((n) => ({ value: n, label: t('contracts.settings.daysBefore', { n }) }))} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('contracts.settings.maxUpload')}>
          <Form.Item name="maxUploadMb" noStyle>
            <InputNumber min={1} max={500} addonAfter="MB" style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('contracts.pay.settings.title')} description={t('contracts.pay.settings.desc')}>
        <SettingRow label={t('contracts.pay.settings.soonDays')} description={t('contracts.pay.settings.soonDaysDesc')}>
          <Form.Item name="paymentSoonDays" noStyle>
            <InputNumber min={0} max={60} addonAfter={t('contracts.form.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('contracts.pay.settings.reminderDays')} description={t('contracts.pay.settings.reminderDaysDesc')}>
          <Form.Item name="paymentReminderDays" noStyle>
            <Select mode="tags" style={{ minWidth: 200 }} options={[7, 3, 1, 0].map((n) => ({ value: n, label: n === 0 ? t('contracts.pay.settings.onTheDay') : t('contracts.settings.daysBefore', { n }) }))} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('contracts.settings.types')} description={t('contracts.settings.typesDesc')}>
        <Form.Item name="types" noStyle>
          <TypesEditor />
        </Form.Item>
      </SettingsSection>

      <div className="ctr-settings-note">{t('contracts.settings.routeNote')}</div>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** /admin/settings/contracts — the Contracts module's settings. */
export default function ContractsSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId || 'contracts'} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && (
          <ContractsForm
            state={settings.modules?.contracts || { enabled: false, settings: {} }}
            onSave={({ enabled, settings: values }) => save({ modules: { contracts: { enabled, settings: values } } })}
          />
        )}
      </LoadState>
    </>
  );
}
