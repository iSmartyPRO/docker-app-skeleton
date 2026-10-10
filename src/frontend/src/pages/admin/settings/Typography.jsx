import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Form, InputNumber, Slider } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { TYPOGRAPHY_PRESETS, googleFontsHref, resolveTypography } from '../../../theme/typography';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { errorMessage } from '../../../lib/errors';
import { saveAdminSettings } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

function typographyFromValues(values) {
  const preset = TYPOGRAPHY_PRESETS.find((item) => item.id === values.preset) || TYPOGRAPHY_PRESETS[0];
  return {
    preset: preset.id,
    fontFamily: preset.body,
    headingFamily: preset.heading,
    baseFontSize: values.baseFontSize ?? preset.baseFontSize,
    headingWeight: values.headingWeight ?? preset.headingWeight,
  };
}

function TypographyPicker({ value, onPick }) {
  const { locale } = useLocale();
  return (
    <div className="type-grid" role="radiogroup">
      {TYPOGRAPHY_PRESETS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          className={`type-card ${value === item.id ? 'is-active' : ''}`}
          onClick={() => onPick(item)}
        >
          <span className="type-card__sample" style={{ fontFamily: `'${item.heading}', ${item.fallback}` }}>
            Ag
          </span>
          <strong>{item.name[locale] || item.name.en}</strong>
          <span>{item.summary[locale] || item.summary.en}</span>
        </button>
      ))}
    </div>
  );
}

export default function TypographySettings() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings, refresh } = useSettings();
  const { setPreview, clearPreview, isPreviewing, savedAppearance } = useThemeMode();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const current = resolveTypography(savedAppearance || settings?.appearance);

  const initial = useMemo(
    () => ({
      preset: current.preset,
      baseFontSize: current.baseFontSize,
      headingWeight: current.headingWeight,
    }),
    [current.preset, current.baseFontSize, current.headingWeight]
  );

  useEffect(() => {
    if (isPreviewing) return;
    form.setFieldsValue(initial);
  }, [form, initial, isPreviewing]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  // Load every preset's fonts once so the picker cards render in their own face.
  useEffect(() => {
    let link = document.getElementById('da-fonts-preview');
    if (!link) {
      link = document.createElement('link');
      link.id = 'da-fonts-preview';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = googleFontsHref(TYPOGRAPHY_PRESETS);
  }, []);

  const preset = Form.useWatch('preset', form);

  const pushPreview = (values) => setPreview({ typography: typographyFromValues(values) });

  const onApply = async () => {
    setSaving(true);
    try {
      await saveAdminSettings({
        appearance: { typography: typographyFromValues(form.getFieldsValue(true)) },
      });
      await refresh();
      clearPreview();
      message.success(t('admin.typographyApplied'));
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
      <SettingsPageHeader id="typography" />
      {isPreviewing && <Alert type="info" showIcon message={t('admin.typographyPreview')} className="page-alert" />}
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={(_changed, all) => pushPreview(all)}
      >
        <Form.Item name="preset" hidden>
          <input />
        </Form.Item>
        <SettingsSection title={t('settings.typography.scale')} description={t('settings.typography.scaleDesc')}>
          <SettingRow label={t('admin.fontSize')}>
            <div className="slider-field">
              <Form.Item name="baseFontSize" noStyle>
                <Slider min={13} max={20} style={{ flex: 1 }} />
              </Form.Item>
              <Form.Item name="baseFontSize" noStyle>
                <InputNumber min={13} max={20} suffix="px" style={{ width: 110 }} />
              </Form.Item>
            </div>
          </SettingRow>
          <SettingRow label={t('admin.headingWeight')}>
            <Form.Item name="headingWeight" noStyle>
              <InputNumber min={400} max={800} step={100} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('settings.typography.system')} description={t('settings.typography.systemDesc')}>
          <TypographyPicker
            value={preset}
            onPick={(item) => {
              const next = {
                preset: item.id,
                baseFontSize: item.baseFontSize,
                headingWeight: item.headingWeight,
              };
              form.setFieldsValue(next);
              pushPreview(next);
            }}
          />
        </SettingsSection>
      </Form>
      <SaveBar
        visible={isPreviewing}
        saving={saving}
        onSave={onApply}
        onReset={onDiscard}
        message={t('admin.typographyPreview')}
        saveLabel={t('common.apply')}
      />
    </>
  );
}
