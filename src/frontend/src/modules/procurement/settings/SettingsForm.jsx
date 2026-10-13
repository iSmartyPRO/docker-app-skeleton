import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { ColorSwatches } from '../../shared/People';

const COMMON_CURRENCIES = ['USD', 'KGS', 'RUB', 'EUR', 'KZT', 'CNY', 'UZS', 'TRY', 'AED', 'GBP'];

/** Category directory: name and colour; keys stay stable (routes test them), archived ones stay readable. */
function CategoriesEditor({ value = [], onChange }) {
  const { t } = useLocale();
  const set = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="prc-cats-edit">
      {value.map((item, index) => (
        <div key={item.key || index} className={`prc-cats-edit__row${item.archived ? ' is-archived' : ''}`}>
          <ColorSwatches value={item.color} onChange={(color) => set(index, { color })} small />
          <Input value={item.name} onChange={(event) => set(index, { name: event.target.value })} maxLength={60} placeholder={t('procurement.settings.categoryName')} />
          <Switch size="small" checked={!item.archived} onChange={(on) => set(index, { archived: !on })} aria-label={t('procurement.settings.categoryActive')} />
          {!item.key && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('common.delete')} />}
        </div>
      ))}
      <Button icon={<PlusOutlined />} onClick={() => onChange([...value, { name: '', color: '#3B82F6' }])}>
        {t('procurement.settings.addCategory')}
      </Button>
      <p className="setting-row__desc">{t('procurement.settings.categoriesNote')}</p>
    </div>
  );
}

/** The module settings form; `save(settings)` persists (module API or admin settings). */
export default function SettingsForm({ settings, save }) {
  const { t } = useLocale();
  const initial = useMemo(
    () => ({
      categories: settings.categories || [],
      currencies: settings.currencies || [],
      currency: settings.currency,
      numberPrefix: settings.numberPrefix,
      numberDigits: settings.numberDigits,
      invoiceRequired: Boolean(settings.invoiceRequired),
      anyoneCanCreate: Boolean(settings.anyoneCanCreate),
      groupVisibility: Boolean(settings.groupVisibility),
      reminderDays: settings.reminderDays,
      units: settings.units || [],
    }),
    [settings]
  );
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, (values) => save({ ...values, categories: (values.categories || []).filter((item) => String(item.name || '').trim()) }));
  const currencies = Form.useWatch('currencies', form) || initial.currencies;
  const prefix = Form.useWatch('numberPrefix', form) ?? initial.numberPrefix;
  const digits = Form.useWatch('numberDigits', form) ?? initial.numberDigits;
  return (
    <Form {...formProps}>
      <SettingsSection title={t('procurement.settings.requests')}>
        <SettingRow label={t('procurement.settings.invoiceRequired')} description={t('procurement.settings.invoiceRequiredDesc')}>
          <Form.Item name="invoiceRequired" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('procurement.settings.anyoneCanCreate')} description={t('procurement.settings.anyoneCanCreateDesc')}>
          <Form.Item name="anyoneCanCreate" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('procurement.settings.groupVisibility')} description={t('procurement.settings.groupVisibilityDesc')}>
          <Form.Item name="groupVisibility" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('procurement.settings.numbering')} description={t('procurement.settings.numberingDesc', { example: `${prefix ? `${prefix}-` : ''}${'1'.padStart(digits || 4, '0')}` })}>
          <div className="prc-inline">
            <Form.Item name="numberPrefix" noStyle><Input maxLength={10} style={{ width: 110 }} /></Form.Item>
            <Form.Item name="numberDigits" noStyle><InputNumber min={1} max={8} style={{ width: 80 }} /></Form.Item>
          </div>
        </SettingRow>
        <SettingRow label={t('procurement.settings.reminderDays')} description={t('procurement.settings.reminderDaysDesc')}>
          <Form.Item name="reminderDays" noStyle><InputNumber min={0} max={30} addonAfter={t('procurement.settings.days')} style={{ width: 160 }} /></Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('procurement.settings.money')}>
        <SettingRow label={t('procurement.settings.currencies')} description={t('procurement.settings.currenciesDesc')} stacked>
          <Form.Item name="currencies" noStyle>
            <Select mode="tags" options={COMMON_CURRENCIES.map((code) => ({ value: code, label: code }))} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('procurement.settings.defaultCurrency')}>
          <Form.Item name="currency" noStyle>
            <Select options={currencies.map((code) => ({ value: code, label: code }))} style={{ minWidth: 120 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('procurement.settings.units')} description={t('procurement.settings.unitsDesc')} stacked>
          <Form.Item name="units" noStyle><Select mode="tags" tokenSeparators={[',']} /></Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('procurement.settings.categories')}>
        <Form.Item name="categories" noStyle><CategoriesEditor /></Form.Item>
      </SettingsSection>
      <SettingsSection title={t('procurement.settings.route')} description={t('procurement.settings.routeDesc')}>
        <Link to="/app/approvals/settings">{t('procurement.settings.routeLink')} →</Link>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}
