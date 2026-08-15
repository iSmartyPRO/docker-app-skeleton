import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, InputNumber, Space, Typography, message } from 'antd';
import { TYPOGRAPHY_PRESETS, googleFontsHref, resolveTypography } from '../../theme/typography';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useThemeMode } from '../../context/ThemeContext';
import { saveAdminSettings } from '../../services/api';

const { Title, Paragraph } = Typography;

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

export default function AdminTypography() {
  const { t, locale } = useLocale();
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
    [current]
  );

  useEffect(() => {
    if (isPreviewing) return;
    form.setFieldsValue(initial);
  }, [form, initial, isPreviewing]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  useEffect(() => {
    const href = googleFontsHref(TYPOGRAPHY_PRESETS);
    let link = document.getElementById('da-fonts-preview');
    if (!link) {
      link = document.createElement('link');
      link.id = 'da-fonts-preview';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = href;
  }, []);

  const pushPreview = (values) => {
    setPreview({ typography: typographyFromValues(values) });
  };

  const onValuesChange = (_changed, all) => {
    pushPreview(all);
  };

  const onApply = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings({
        appearance: {
          typography: typographyFromValues(values),
        },
      });
      clearPreview();
      await refresh();
      message.success(t('admin.typographyApplied'));
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    clearPreview();
    form.setFieldsValue(initial);
  };

  return (
    <div>
      <Title level={2}>{t('admin.typography')}</Title>
      <Paragraph type="secondary">{t('admin.typographyPreviewHint')}</Paragraph>
      {isPreviewing && (
        <Alert
          type="info"
          showIcon
          message={t('admin.typographyPreview')}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="panel-card" bordered={false}>
        <Form
          form={form}
          layout="vertical"
          initialValues={initial}
          onValuesChange={onValuesChange}
          onFinish={onApply}
        >
          <Form.Item name="preset" label={t('admin.font')}>
            <TypographyPicker
              locale={locale}
              onPick={(preset) => {
                const next = {
                  preset: preset.id,
                  baseFontSize: preset.baseFontSize,
                  headingWeight: preset.headingWeight,
                };
                form.setFieldsValue(next);
                pushPreview(next);
              }}
            />
          </Form.Item>
          <Form.Item name="baseFontSize" label={t('admin.fontSize')}>
            <InputNumber min={13} max={20} />
          </Form.Item>
          <Form.Item name="headingWeight" label={t('admin.headingWeight')}>
            <InputNumber min={400} max={800} step={100} />
          </Form.Item>
          <div className="theme-apply-bar">
            <Space>
              <Button type="primary" htmlType="submit" loading={saving} disabled={!isPreviewing}>
                {t('common.apply')}
              </Button>
              <Button onClick={onDiscard} disabled={!isPreviewing}>
                {t('admin.discardPreview')}
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
}

function TypographyPicker({ value, onChange, onPick, locale }) {
  return (
    <div className="type-grid">
      {TYPOGRAPHY_PRESETS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`type-card ${value === item.id ? 'is-active' : ''}`}
          onClick={() => {
            onChange?.(item.id);
            onPick?.(item);
          }}
        >
          <span
            className="type-card__sample"
            style={{ fontFamily: `'${item.heading}', ${item.fallback}` }}
          >
            Ag
          </span>
          <strong>{item.name[locale] || item.name.en}</strong>
          <span>{item.summary[locale] || item.summary.en}</span>
        </button>
      ))}
    </div>
  );
}
