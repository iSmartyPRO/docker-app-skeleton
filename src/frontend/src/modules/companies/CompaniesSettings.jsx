import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, ColorPicker, Form, Input, Radio, Select, Switch, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { cmpApi, relationLabel } from './api';
import { HintLabel } from '../../help/Hint';
import './companies.css';

function RelationsEditor({ value = [], onChange }) {
  const { t } = useLocale();
  const update = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="cmp-set-list">
      {value.map((item, index) => (
        <div key={item.key || index} className="cmp-set-row">
          <ColorPicker size="small" value={item.color} onChangeComplete={(color) => update(index, { color: color.toHexString().toUpperCase() })} />
          <Input value={item.label} placeholder={relationLabel(t, { key: item.key })} onChange={(event) => update(index, { label: event.target.value })} />
          <Tag color={item.color} bordered={false}>{relationLabel(t, item)}</Tag>
          <Button type="text" onClick={() => onChange(value.filter((_, i) => i !== index))}>✕</Button>
        </div>
      ))}
      <Button type="dashed" size="small" onClick={() => onChange([...value, { key: '', label: '', color: '#64748B' }])} icon={<PlusOutlined />}>{t('companiesSettings.addRelation')}</Button>
    </div>
  );
}

function FieldsEditor({ value = [], onChange, countries }) {
  const { t } = useLocale();
  const update = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="cmp-set-list">
      {value.map((item, index) => (
        <div key={item.key || index} className="cmp-set-field">
          <Input value={item.label} placeholder={t('companiesSettings.fieldLabel')} onChange={(event) => update(index, { label: event.target.value })} />
          <Select value={item.entity || 'company'} onChange={(entity) => update(index, { entity })} options={[{ value: 'company', label: t('companies.company') }, { value: 'person', label: t('companies.contact') }]} />
          <Select value={item.type || 'text'} onChange={(type) => update(index, { type })} options={['text', 'textarea', 'number', 'date', 'select', 'url'].map((type) => ({ value: type, label: t(`companiesSettings.type.${type}`) }))} />
          <Select mode="multiple" allowClear value={item.countries || []} onChange={(list) => update(index, { countries: list })} placeholder={t('companiesSettings.allCountries')} options={countries} maxTagCount={2} />
          {item.type === 'select' && (
            <Select mode="tags" value={item.options || []} onChange={(options) => update(index, { options })} placeholder={t('companiesSettings.options')} className="cmp-set-field__options" />
          )}
          <Button type="text" onClick={() => onChange(value.filter((_, i) => i !== index))}>✕</Button>
        </div>
      ))}
      <Button type="dashed" size="small" onClick={() => onChange([...value, { label: '', type: 'text', entity: 'company', countries: [], options: [] }])} icon={<PlusOutlined />}>{t('companiesSettings.addField')}</Button>
    </div>
  );
}

function DadataKey() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [meta, setMeta] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    cmpApi.meta().then((res) => setMeta(res.data)).catch(() => setMeta(null));
  }, []);
  const save = async (value) => {
    setBusy(true);
    try {
      const { data } = await cmpApi.setDadataKey(value);
      setMeta(data);
      setKey('');
      message.success(value ? t('companiesSettings.keySaved') : t('companiesSettings.keyRemoved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cmp-dadata">
      {meta?.integrations?.dadata ? (
        <div className="cmp-dadata__on">
          <span>✓ {t('companiesSettings.keyActive', { hint: meta.integrations.dadataHint })}</span>
          <Button size="small" danger type="text" loading={busy} onClick={() => save('')}>{t('companiesSettings.removeKey')}</Button>
        </div>
      ) : (
        <span className="cmp-muted">{t('companiesSettings.keyMissing')}</span>
      )}
      <div className="cmp-dadata__row">
        <Input.Password value={key} onChange={(event) => setKey(event.target.value.trim())} placeholder={t('companiesSettings.keyPlaceholder')} autoComplete="off" />
        <Button type="primary" disabled={!key} loading={busy} onClick={() => save(key)}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

function CompaniesForm({ settings, save }) {
  const { t, locale } = useLocale();
  const state = settings.modules?.companies || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { companies: { enabled, settings: rest } } }));
  const [countryOptions, setCountryOptions] = useState([]);
  useEffect(() => {
    cmpApi
      .meta()
      .then((res) => setCountryOptions(Object.entries(res.data.countries).map(([code, profile]) => ({ value: code, label: `${profile.flag}  ${profile.name[locale] || profile.name.en}` }))))
      .catch(() => {});
  }, [locale]);
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('companiesSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle><Switch /></Form.Item>
        </SettingRow>
        <SettingRow label={t('companiesSettings.open')}>
          <Link to="/app/companies">{t('apps.companies.name')} →</Link>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('companiesSettings.countries')} description={t('companiesSettings.countriesDesc')}>
        <SettingRow label={t('companiesSettings.defaultCountry')}>
          <Form.Item name="defaultCountry" noStyle>
            <Select options={countryOptions} style={{ width: 240 }} showSearch optionFilterProp="label" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('companiesSettings.countryList')} description={t('companiesSettings.countryListDesc')} stacked>
          <Form.Item name="countries" noStyle>
            <Select mode="multiple" options={countryOptions} optionFilterProp="label" />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('companiesSettings.access')} description={t('companiesSettings.accessDesc')}>
        <SettingRow label={<HintLabel id="companies.editPolicy">{t('companiesSettings.editPolicy')}</HintLabel>}>
          <Form.Item name="editPolicy" noStyle>
            <Radio.Group optionType="button" options={[{ value: 'everyone', label: t('companiesSettings.everyone') }, { value: 'owners', label: t('companiesSettings.owners') }]} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={<HintLabel id="companies.relationTypes">{t('companiesSettings.relations')}</HintLabel>} description={t('companiesSettings.relationsDesc')}>
        <Form.Item name="relations" noStyle><RelationsEditor /></Form.Item>
      </SettingsSection>
      <SettingsSection title={t('companiesSettings.fields')} description={t('companiesSettings.fieldsDesc')}>
        <Form.Item name="customFields" noStyle><FieldsEditor countries={countryOptions} /></Form.Item>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function CompaniesSettings({ itemId }) {
  const { t } = useLocale();
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <CompaniesForm settings={settings} save={save} />}
        {settings?.modules?.companies?.enabled && (
          <SettingsSection title={t('companiesSettings.registries')} description={t('companiesSettings.registriesDesc')}>
            <div className="cmp-registries">
              <div className="cmp-registry"><strong>🇰🇬 {t('companiesSettings.kg')}</strong><span>{t('companiesSettings.kgDesc')}</span><Tag color="green" bordered={false}>{t('companiesSettings.noKey')}</Tag></div>
              <div className="cmp-registry"><strong>🇷🇺 {t('companiesSettings.egrul')}</strong><span>{t('companiesSettings.egrulDesc')}</span><Tag color="green" bordered={false}>{t('companiesSettings.noKey')}</Tag></div>
              <div className="cmp-registry"><strong><HintLabel id="companies.dadataKey">🇷🇺 DaData</HintLabel></strong><span>{t('companiesSettings.dadataDesc')}</span><DadataKey /></div>
            </div>
          </SettingsSection>
        )}
      </LoadState>
    </>
  );
}
