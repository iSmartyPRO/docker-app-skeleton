import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox, Form, InputNumber, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { ICON_IDS, MenuIcon } from '../../components/icons/menuIcons';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { FOLDER_COLORS } from './fileTypes';
import { FolderIcon } from './components/Icons';
import { HintLabel } from '../../help/Hint';

const GROUPS = ['images', 'pdf', 'office', 'text', 'media', 'archives'];

function IconField({ value, onChange }) {
  return (
    <div className="icon-catalog icon-catalog--wide">
      {ICON_IDS.map((id) => (
        <button key={id} type="button" className={`icon-catalog__btn${value === id ? ' is-active' : ''}`} onClick={() => onChange?.(id)} title={id}>
          <MenuIcon name={id} variant="mono" />
        </button>
      ))}
    </div>
  );
}

function ColorField({ value, onChange }) {
  return (
    <div className="swatches">
      {FOLDER_COLORS.map((color) => (
        <button key={color} type="button" className={`swatch${value === color ? ' is-active' : ''}`} style={{ background: color }} onClick={() => onChange?.(color)} aria-label={color} />
      ))}
    </div>
  );
}

function KbForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.kb || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { kb: { enabled, settings: rest } } })
  );
  const icon = Form.useWatch('defaultIcon', form);
  const color = Form.useWatch('defaultColor', form);
  const conversion = settings.integrations?.documents;

  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('kbSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('kbSettings.access')} description={t('kbSettings.accessDesc')}>
          <Link to="/app/kb">{t('kbSettings.openAccess')} →</Link>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('kbSettings.look')} description={t('kbSettings.lookDesc')}>
        <div className="folder-preview">
          <FolderIcon folder={{}} config={{ defaultIcon: icon, defaultColor: color }} size={56} />
          <div>
            <strong>{t('kbSettings.example')}</strong>
            <span>{t('kbSettings.exampleDesc')}</span>
          </div>
        </div>
        <SettingRow label={t('kbSettings.defaultColor')} stacked>
          <Form.Item name="defaultColor" noStyle>
            <ColorField />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('kbSettings.defaultIcon')} stacked>
          <Form.Item name="defaultIcon" noStyle>
            <IconField />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('kbSettings.files')} description={t('kbSettings.filesDesc')}>
        <SettingRow label={t('kbSettings.maxUpload')}>
          <Form.Item name="maxUploadMb" noStyle>
            <InputNumber min={1} max={1024} suffix={t('format.bytes.mb')} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="kb.fileTypes">{t('kbSettings.types')}</HintLabel>} stacked>
          <Form.Item name="fileGroups" noStyle>
            <Checkbox.Group className="type-groups" options={GROUPS.map((group) => ({ value: group, label: t(`kbSettings.group_${group}`) }))} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="kb.conversion">{t('kbSettings.conversion')}</HintLabel>} description={t('kbSettings.conversionDesc')}>
          {conversion?.enabled && conversion?.serverUrl ? (
            <span className="readiness is-ready">● {t('signinSettings.integrationReady')}</span>
          ) : (
            <Link to="/admin/settings/documents" className="readiness">● {t('kbSettings.conversionSetup')} →</Link>
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('kbSettings.links')} description={t('kbSettings.linksDesc')}>
        <SettingRow label={t('kbSettings.publicLinks')} description={t('kbSettings.publicLinksDesc')}>
          <Form.Item name="publicLinks" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('kbSettings.requirePassword')} description={t('kbSettings.requirePasswordDesc')}>
          <Form.Item name="requireSharePassword" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="kb.maxShareDays">{t('kbSettings.maxDays')}</HintLabel>} description={t('kbSettings.maxDaysDesc')}>
          <Form.Item name="maxShareDays" noStyle>
            <InputNumber min={0} max={3650} suffix={t('settings.login.days')} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** Settings → Modules → Knowledge base: system settings of the module. */
export default function KbSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="kb" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <KbForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
