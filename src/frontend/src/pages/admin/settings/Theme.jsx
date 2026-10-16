import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, ColorPicker, Form, Switch } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { THEME_TEMPLATES, resolveColors } from '../../../theme/templates';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { errorMessage } from '../../../lib/errors';
import api, { saveAdminSettings } from '../../../services/api';
import ThemePicker from '../../../theme/ThemePicker';
import { OPTIONAL_THEME_IDS, THEMES, themePolicy } from '../../../theme/themes';
import { TourIcon } from '../../../tour/TourButton';
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

/** Employee theme rules from the form: every theme ticked is stored as "all" (an empty list). */
function themesOf(values) {
  const allowed = (values.allowed || []).filter((id) => OPTIONAL_THEME_IDS.includes(id));
  return {
    allowed: allowed.length === OPTIONAL_THEME_IDS.length ? [] : allowed,
    allowCustom: values.allowCustom !== false,
    allowMotion: values.allowMotion !== false,
  };
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
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const { settings, refresh } = useSettings();
  const { mode, setPreview, clearPreview, isPreviewing, savedAppearance } = useThemeMode();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const skipColorSync = useRef(false);
  const appearance = savedAppearance || settings?.appearance || {};

  const initial = useMemo(() => {
    const colors = resolveColors(appearance, mode);
    const policy = themePolicy(appearance);
    return {
      template: appearance.template || 'navy',
      defaultTheme: appearance.defaultTheme || 'light',
      allowed: policy.allowed || OPTIONAL_THEME_IDS,
      allowCustom: policy.allowCustom,
      allowMotion: policy.allowMotion,
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
      themes: themesOf(values),
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
          themes: themesOf(values),
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
          <SettingRow label={t('themes.admin.defaultTheme')} description={t('themes.admin.defaultThemeDesc')} stacked>
            <Form.Item name="defaultTheme" noStyle>
              <ThemePicker compact themes={THEMES.filter((theme) => theme.kind !== 'custom').map((theme) => theme.id)} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('themes.admin.title')} description={t('themes.admin.desc')}>
          <SettingRow label={t('themes.admin.allowed')} description={t('themes.admin.allowedDesc')} stacked>
            <Form.Item name="allowed" noStyle>
              <Checkbox.Group
                className="ts-allowed"
                options={THEMES.filter((theme) => OPTIONAL_THEME_IDS.includes(theme.id)).map((theme) => ({ value: theme.id, label: theme.name[locale] || theme.name.en }))}
              />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('themes.admin.allowCustom')} description={t('themes.admin.allowCustomDesc')}>
            <Form.Item name="allowCustom" valuePropName="checked" noStyle>
              <Switch aria-label={t('themes.admin.allowCustom')} />
            </Form.Item>
          </SettingRow>
          <SettingRow label={t('themes.admin.allowMotion')} description={t('themes.admin.allowMotionDesc')}>
            <Form.Item name="allowMotion" valuePropName="checked" noStyle>
              <Switch aria-label={t('themes.admin.allowMotion')} />
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
      <SettingsSection title={t('themes.admin.toursTitle')} description={t('themes.admin.toursDesc')}>
        <Button
          icon={<TourIcon />}
          onClick={() =>
            modal.confirm({
              title: t('themes.admin.reset'),
              content: t('themes.admin.resetConfirm'),
              okText: t('themes.admin.reset'),
              cancelText: t('common.cancel'),
              onOk: async () => {
                try {
                  const res = await api.post('/admin/tours/reset');
                  message.success(t('themes.admin.resetDone', { n: res.data.removed }));
                } catch (err) {
                  message.error(errorMessage(err));
                }
              },
            })
          }
        >
          {t('themes.admin.reset')}
        </Button>
      </SettingsSection>
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
