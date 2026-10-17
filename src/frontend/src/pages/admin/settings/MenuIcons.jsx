import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Form, Popover } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import SaveBar from '../../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import {
  ICON_IDS,
  MENU_SLOT_GROUPS,
  MENU_SLOTS,
  MenuIcon,
  resolveIconId,
} from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { errorMessage } from '../../../lib/errors';
import { saveAdminSettings } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

function iconsFromValues(values) {
  return {
    style: values.iconStyle === 'mono' ? 'mono' : 'colored',
    menu: values.menuIcons || {},
  };
}

function IconSlot({ slot, iconId, iconStyle, onPick }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="icon-slot">
      <span className="icon-slot__label">{t(slot.labelKey)}</span>
      <Popover
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomRight"
        overlayClassName="icon-catalog-pop"
        content={
          <div className="icon-catalog">
            {ICON_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`icon-catalog__btn ${iconId === id ? 'is-active' : ''}`}
                onClick={() => {
                  onPick(id);
                  setOpen(false);
                }}
                title={id}
              >
                <MenuIcon name={id} variant={iconStyle} />
              </button>
            ))}
          </div>
        }
      >
        <button type="button" className="icon-slot__pick" aria-label={t(slot.labelKey)}>
          <MenuIcon name={iconId} variant={iconStyle} />
        </button>
      </Popover>
    </div>
  );
}

function MenuIconEditor({ value = {}, onChange }) {
  const { t } = useLocale();
  const iconStyle = Form.useWatch('iconStyle') || 'colored';
  return (
    <div className="icon-groups">
      {MENU_SLOT_GROUPS.map((group) => (
        <div key={group.id} className="icon-group">
          <div className="icon-group__label">{t(group.labelKey)}</div>
          {group.slots.map((slot) => (
            <IconSlot
              key={slot.key}
              slot={slot}
              iconStyle={iconStyle}
              iconId={value[slot.key]}
              onPick={(id) => onChange?.({ ...value, [slot.key]: id })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function MenuIconSettings() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings, refresh } = useSettings();
  const { setPreview, clearPreview, isPreviewing, savedAppearance } = useThemeMode();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const appearance = savedAppearance || settings?.appearance || {};

  const initial = useMemo(
    () => ({
      iconStyle: appearance.icons?.style === 'mono' ? 'mono' : 'colored',
      menuIcons: Object.fromEntries(MENU_SLOTS.map((slot) => [slot.key, resolveIconId(appearance, slot.key)])),
    }),
    [appearance]
  );

  useEffect(() => {
    if (isPreviewing) return;
    form.setFieldsValue(initial);
  }, [form, initial, isPreviewing]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const onApply = async () => {
    setSaving(true);
    try {
      await saveAdminSettings({ appearance: { icons: iconsFromValues(form.getFieldsValue(true)) } });
      await refresh();
      clearPreview();
      message.success(t('admin.iconsApplied'));
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
      <SettingsPageHeader id="icons" />
      {isPreviewing && <Alert type="info" showIcon message={t('admin.iconsPreview')} className="page-alert" />}
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={(_changed, all) => setPreview({ icons: iconsFromValues(all) })}
      >
        <SettingsSection>
          <SettingRow label={t('settings.icons.style')} description={t('settings.icons.styleDesc')}>
            <Form.Item name="iconStyle" noStyle>
              <Segmented
                options={[
                  { value: 'colored', label: t('admin.iconColored') },
                  { value: 'mono', label: t('admin.iconMono') },
                ]}
              />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('settings.icons.slots')} description={t('settings.icons.slotsDesc')}>
          <Form.Item name="menuIcons" noStyle>
            <MenuIconEditor />
          </Form.Item>
        </SettingsSection>
      </Form>
      <SaveBar
        visible={isPreviewing}
        saving={saving}
        onSave={onApply}
        onReset={onDiscard}
        message={t('admin.iconsPreview')}
        saveLabel={t('common.apply')}
      />
    </>
  );
}
