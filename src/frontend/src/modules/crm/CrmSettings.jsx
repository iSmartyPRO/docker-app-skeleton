import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, Radio, Select, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { HintLabel } from '../../help/Hint';
import { FieldsEditor, MOVABLE_BUILTINS, SectionsEditor, strip } from './settings/FieldsEditor';
import '../shared/module.css';
import './crm.css';

const COMMON_CURRENCIES = ['KGS', 'USD', 'EUR', 'RUB', 'KZT', 'CNY', 'UZS', 'TRY', 'GBP', 'AED', 'BYN', 'TJS'];

/** Where each movable built-in field sits (section key; «О сделке» by default). */
function BuiltinSections({ value = {}, onChange, sections }) {
  const { t } = useLocale();
  return (
    <div className="cs-builtins">
      {MOVABLE_BUILTINS.map((key) => (
        <label key={key} className="cs-builtin">
          <span>{t(`crmSettings.builtin.${key}`)}</span>
          <Select
            size="small"
            value={value[key] || 'about'}
            onChange={(section) => onChange({ ...value, [key]: section === 'about' ? undefined : section })}
            options={sections.filter((section) => section.key).map((section) => ({ value: section.key, label: section.title }))}
            style={{ minWidth: 180 }}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * The settings form. `state` = { enabled, settings }; `onSave({ enabled, settings })`.
 * In the app (crm.admin without console rights) the module switch is hidden.
 */
export function CrmForm({ state, onSave, inApp }) {
  const { t } = useLocale();
  const initial = useMemo(
    () => ({
      enabled: Boolean(state.enabled),
      currency: 'KGS',
      currencies: ['KGS', 'USD', 'EUR', 'RUB', 'KZT', 'CNY'],
      visibility: 'all',
      sources: [],
      lostReasons: [],
      sections: [{ key: 'about', title: 'О сделке' }],
      fields: [],
      builtinSections: {},
      activityReminders: true,
      ...state.settings,
    }),
    [state]
  );
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, ({ enabled, sections, fields, builtinSections, ...rest }) =>
    onSave({
      enabled,
      settings: {
        ...rest,
        sections: strip(sections || []),
        fields: strip(fields || []),
        builtinSections: Object.fromEntries(Object.entries(builtinSections || {}).filter(([, section]) => section)),
      },
    })
  );
  const currencies = Form.useWatch('currencies', form) || initial.currencies;
  const sections = Form.useWatch('sections', form) || initial.sections;

  return (
    <Form {...formProps}>
      {inApp && (
        <Form.Item name="enabled" hidden valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
      <SettingsSection>
        {!inApp && (
          <SettingRow label={t('modules.enabledLabel')} description={t('crmSettings.enabledDesc')}>
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </SettingRow>
        )}
        <SettingRow label={t('crmSettings.open')} description={t('crmSettings.openDesc')}>
          <span className="cs-links">
            {!inApp && <Link to="/app/crm">{t('apps.crm.name')} →</Link>}
            <Link to="/app/crm/pipelines">{t('crm.pipelines.title')} →</Link>
          </span>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('crmSettings.money')} description={t('crmSettings.moneyDesc')}>
        <SettingRow label={t('crmSettings.currency')}>
          <Form.Item name="currency" noStyle>
            <Select options={currencies.map((code) => ({ value: code, label: code }))} style={{ width: 140 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('crmSettings.currencies')} description={t('crmSettings.currenciesDesc')} stacked>
          <Form.Item name="currencies" noStyle>
            <Select mode="tags" options={COMMON_CURRENCIES.map((code) => ({ value: code, label: code }))} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('crmSettings.access')} description={t('crmSettings.accessDesc')}>
        <Form.Item name="visibility" noStyle>
          <Radio.Group className="visibility-options">
            <Radio value="all">
              <span>
                <strong>{t('crmSettings.visibilityAll')}</strong>
                <span>{t('crmSettings.visibilityAllDesc')}</span>
              </span>
            </Radio>
            <Radio value="own">
              <span>
                <strong>{t('crmSettings.visibilityOwn')}</strong>
                <span>{t('crmSettings.visibilityOwnDesc')}</span>
              </span>
            </Radio>
          </Radio.Group>
        </Form.Item>
      </SettingsSection>

      <SettingsSection title={t('crmSettings.lists')} description={t('crmSettings.listsDesc')}>
        <SettingRow label={t('crmSettings.sources')} description={t('crmSettings.sourcesDesc')} stacked>
          <Form.Item name="sources" noStyle>
            <Select mode="tags" open={false} suffixIcon={null} placeholder={t('crmSettings.typeEnter')} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="crm.lostReasons">{t('crmSettings.lostReasons')}</HintLabel>} description={t('crmSettings.lostReasonsDesc')} stacked>
          <Form.Item name="lostReasons" noStyle>
            <Select mode="tags" open={false} suffixIcon={null} placeholder={t('crmSettings.typeEnter')} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('crmSettings.reminders')} description={t('crmSettings.remindersDesc')}>
        <SettingRow label={t('crmSettings.remindersOn')} description={t('crmSettings.remindersOnDesc')}>
          <Form.Item name="activityReminders" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('crmSettings.sections')} description={t('crmSettings.sectionsDesc')}>
        <Form.Item name="sections" noStyle>
          <SectionsEditor />
        </Form.Item>
        <div className="cs-sub">{t('crmSettings.builtinTitle')}</div>
        <Form.Item name="builtinSections" noStyle>
          <BuiltinSections sections={sections} />
        </Form.Item>
      </SettingsSection>

      <SettingsSection title={<HintLabel id="crm.customFields">{t('crmSettings.fields')}</HintLabel>} description={t('crmSettings.fieldsDesc')}>
        <Form.Item name="fields" noStyle>
          <FieldsEditor sections={sections} />
        </Form.Item>
      </SettingsSection>

      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** /admin/settings/crm — the CRM module's settings. */
export default function CrmSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && (
          <CrmForm
            state={settings.modules?.crm || { enabled: true, settings: {} }}
            onSave={({ enabled, settings: values }) => save({ modules: { crm: { enabled, settings: values } } })}
          />
        )}
      </LoadState>
    </>
  );
}
