import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, ColorPicker, Form, Radio, Space, Typography, message } from 'antd';
import { THEME_TEMPLATES, resolveColors } from '../../theme/templates';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useThemeMode } from '../../context/ThemeContext';
import { saveAdminSettings } from '../../services/api';

const { Title, Paragraph } = Typography;

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

export default function AdminAppearance() {
  const { t, locale } = useLocale();
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

  const onApply = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings({
        appearance: {
          template: values.template,
          defaultTheme: values.defaultTheme,
          customColors: customDiff(values.template, values, mode),
        },
      });
      clearPreview();
      await refresh();
      message.success(t('admin.themeApplied'));
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
      <Title level={2}>{t('admin.theme')}</Title>
      <Paragraph type="secondary">{t('admin.themePreviewHint')}</Paragraph>
      {isPreviewing && (
        <Alert
          type="info"
          showIcon
          message={t('admin.themePreview')}
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
          <Form.Item name="template" label={t('admin.template')}>
            <Radio.Group className="theme-picker">
              {Object.values(THEME_TEMPLATES).map((item) => (
                <Radio.Button key={item.id} value={item.id} className="theme-picker__btn">
                  <span className="theme-picker__swatches">
                    <i style={{ background: item.light.colorPrimary }} />
                    <i style={{ background: item.light.colorBgLayout }} />
                    <i style={{ background: item.light.colorTextBase }} />
                  </span>
                  {item.name[locale] || item.name.en}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="defaultTheme" label={t('admin.defaultTheme')}>
            <Radio.Group>
              <Radio.Button value="light">{t('header.light')}</Radio.Button>
              <Radio.Button value="dark">{t('header.dark')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Paragraph type="secondary">{t('admin.customColors')}</Paragraph>
          {COLOR_FIELDS.map((field) => (
            <Form.Item key={field} name={field} label={field}>
              <ColorPicker showText />
            </Form.Item>
          ))}
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
