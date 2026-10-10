import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, ColorPicker, Form, Segmented } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { THEME_TEMPLATES, resolveColors } from '../../../theme/templates';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { errorMessage } from '../../../lib/errors';
import { saveAdminSettings } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

const COLOR_FIELDS = [
  'colorPrimary',
  'colorBgBase',
  'colorTextBase',
  'colorSuccess',
  'colorWarning',
  'colorError',
];

function hexOf(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : value.toHexString();
}

function colorsFromValues(values) {
  const customColors = {};
  for (const key of COLOR_FIELDS) {
    const hex = hexOf(values[key]);
    if (hex) customColors[key] = hex;
  }
  return customColors;
}

/** Only the colors that differ from the template are stored as overrides. */
function customDiff(templateId, values, mode) {
  const template = THEME_TEMPLATES[templateId] || THEME_TEMPLATES.navy;
  const base = template[mode] || template.light;
  const custom = {};
  for (const key of COLOR_FIELDS) {
    const hex = hexOf(values[key]);
    if (hex && hex.toLowerCase() !== String(base[key] || '').toLowerCase()) {
      custom[key] = hex;
    }
  }
  return custom;
}

function TemplatePicker({ value, onChange, mode }) {
  const { locale } = useLocale();
  return (
    <div className="template-grid" role="radiogroup">
      {Object.values(THEME_TEMPLATES).map((item) => {
        const palette = item[mode] || item.light;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={value === item.id}
            className={`template-card${value === item.id ? ' is-active' : ''}`}
            onClick={() => onChange?.(item.id)}
          >
            <span className="template-card__preview" style={{ background: palette.colorBgLayout }}>
              <span className="template-card__side" style={{ background: palette.colorBgContainer, borderColor: palette.colorBorder }}>
                <i style={{ background: palette.colorPrimary }} />
                <i style={{ background: palette.colorBorder }} />
                <i style={{ background: palette.colorBorder }} />
              </span>
              <span className="template-card__main" style={{ background: palette.colorBgContainer, borderColor: palette.colorBorder }}>
                <i style={{ background: palette.colorTextBase, width: '58%' }} />
                <i style={{ background: palette.colorBorder, width: '82%' }} />
                <b style={{ background: palette.colorPrimary }} />
              </span>
            </span>
            <span className="template-card__name">{item.name[locale] || item.name.en}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ThemeSettings() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings, refresh } = useSettings();
  const { mode, setPreview, clearPreview, isPreviewing, savedAppearance } = useThemeMode();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const skipColorSync = useRef(false);
  const appearance = savedAppearance || settings?.appearance || {};

  const initial = useMemo(() => {
    const colors = resolveColors(appearance, mode);
    return {
      template: appearance.template || 'navy',
      defaultTheme: appearance.defaultTheme || 'light',
      ...Object.fromEntries(COLOR_FIELDS.map((key) => [key, colors[key]])),
    };
  }, [appearance, mode]);

  useEffect(() => {
    if (isPreviewing) return;
    form.setFieldsValue(initial);
  }, [form, initial, isPreviewing]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const pushPreview = (values, customColors) => {
    setPreview({
      template: values.template,
      defaultTheme: values.defaultTheme,
      customColors,
    });
  };

  const onValuesChange = (changed, all) => {
    if (changed.template) {
      const template = THEME_TEMPLATES[changed.template] || THEME_TEMPLATES.navy;
      const palette = template[mode] || template.light;
      const nextColors = Object.fromEntries(COLOR_FIELDS.map((key) => [key, palette[key]]));
      skipColorSync.current = true;
      form.setFieldsValue(nextColors);
      pushPreview({ ...all, template: changed.template, ...nextColors }, {});
      return;
    }
    if (skipColorSync.current) {
      skipColorSync.current = false;
      return;
    }
    pushPreview(all, colorsFromValues(all));
  };

  const onApply = async () => {
    const values = form.getFieldsValue(true);
    setSaving(true);
    try {
      await saveAdminSettings({
        appearance: {
          template: values.template,
          defaultTheme: values.defaultTheme,
          customColors: customDiff(values.template, values, mode),
        },
      });
      await refresh();
      clearPreview();
      message.success(t('admin.themeApplied'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    clearPreview();
    form.setFieldsValue(initial);
  };

  return (
    <>
      <SettingsPageHeader id="theme" />
      {isPreviewing && (
        <Alert type="info" showIcon message={t('settings.theme.previewing')} className="page-alert" />
      )}
      <Form form={form} layout="vertical" initialValues={initial} onValuesChange={onValuesChange}>
        <SettingsSection title={t('settings.theme.palette')} description={t('settings.theme.paletteDesc')}>
          <Form.Item name="template" noStyle>
            <TemplatePicker mode={mode} />
          </Form.Item>
        </SettingsSection>
        <SettingsSection>
          <SettingRow label={t('settings.theme.mode')} description={t('settings.theme.modeDesc')}>
            <Form.Item name="defaultTheme" noStyle>
              <Segmented
                options={[
                  { value: 'light', label: t('header.light') },
                  { value: 'dark', label: t('header.dark') },
                  { value: 'system', label: t('common.system') },
                ]}
              />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('settings.theme.custom')} description={t('settings.theme.customDesc')}>
          <div className="color-grid">
            {COLOR_FIELDS.map((field) => (
              <div key={field} className="color-grid__item">
                <span>{t(`settings.theme.${field}`)}</span>
                <Form.Item name={field} noStyle>
                  <ColorPicker showText disabledAlpha />
                </Form.Item>
              </div>
            ))}
          </div>
        </SettingsSection>
      </Form>
      <SaveBar
        visible={isPreviewing}
        saving={saving}
        onSave={onApply}
        onReset={onDiscard}
        message={t('settings.theme.previewing')}
        saveLabel={t('common.apply')}
      />
    </>
  );
}
