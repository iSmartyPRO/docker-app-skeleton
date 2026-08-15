import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Popover, Radio, Space, Typography, message } from 'antd';
import {
  ICON_IDS,
  MENU_SLOTS,
  MenuIcon,
  defaultMenuIcons,
} from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { useThemeMode } from '../../context/ThemeContext';
import { saveAdminSettings } from '../../services/api';

const { Title, Paragraph } = Typography;

function iconsFromValues(values) {
  return {
    style: values.iconStyle === 'mono' ? 'mono' : 'colored',
    menu: values.menuIcons || {},
  };
}

export default function AdminMenuIcons() {
  const { t } = useLocale();
  const { settings, refresh } = useSettings();
  const { setPreview, clearPreview, isPreviewing, savedAppearance } = useThemeMode();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const appearance = savedAppearance || settings?.appearance || {};

  const initial = useMemo(
    () => ({
      iconStyle: appearance.icons?.style === 'mono' ? 'mono' : 'colored',
      menuIcons: { ...defaultMenuIcons(), ...(appearance.icons?.menu || {}) },
    }),
    [appearance]
  );

  useEffect(() => {
    if (isPreviewing) return;
    form.setFieldsValue(initial);
  }, [form, initial, isPreviewing]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const pushPreview = (values) => {
    setPreview({ icons: iconsFromValues(values) });
  };

  const onValuesChange = (_changed, all) => {
    pushPreview(all);
  };

  const onApply = async (values) => {
    setSaving(true);
    try {
      await saveAdminSettings({
        appearance: {
          icons: iconsFromValues(values),
        },
      });
      clearPreview();
      await refresh();
      message.success(t('admin.iconsApplied'));
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
      <Title level={2}>{t('admin.iconStyle')}</Title>
      <Paragraph type="secondary">{t('admin.iconsPreviewHint')}</Paragraph>
      {isPreviewing && (
        <Alert
          type="info"
          showIcon
          message={t('admin.iconsPreview')}
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
          <Form.Item name="iconStyle" label={t('admin.iconMode')}>
            <Radio.Group>
              <Radio.Button value="colored">{t('admin.iconColored')}</Radio.Button>
              <Radio.Button value="mono">{t('admin.iconMono')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="menuIcons" label={t('admin.menuIcons')}>
            <MenuIconEditor t={t} />
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

function MenuIconEditor({ value = {}, onChange, t }) {
  const iconStyle = Form.useWatch('iconStyle') || 'colored';
  const menu = { ...defaultMenuIcons(), ...value };

  const setIcon = (slotKey, iconId) => {
    onChange?.({ ...menu, [slotKey]: iconId });
  };

  return (
    <div className="icon-slots">
      {MENU_SLOTS.map((slot) => (
        <div
          key={slot.key}
          className="icon-slot"
          style={{ paddingLeft: (slot.depth || 0) * 18 }}
        >
          <span className="icon-slot__label">{t(slot.labelKey)}</span>
          <Popover
            trigger="click"
            placement="bottomLeft"
            overlayClassName="icon-catalog-pop"
            content={
              <div className="icon-catalog">
                {ICON_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`icon-catalog__btn ${menu[slot.key] === id ? 'is-active' : ''}`}
                    onClick={() => setIcon(slot.key, id)}
                    title={id}
                  >
                    <MenuIcon name={id} variant={iconStyle} />
                  </button>
                ))}
              </div>
            }
          >
            <button type="button" className="icon-slot__pick">
              <MenuIcon name={menu[slot.key]} variant={iconStyle} />
            </button>
          </Popover>
        </div>
      ))}
    </div>
  );
}
