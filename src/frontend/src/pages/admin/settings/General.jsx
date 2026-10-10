import { useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Slider, Upload } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { errorMessage } from '../../../lib/errors';
import { removeProjectLogo, uploadProjectLogo } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';

const ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp';

/**
 * One logo slot. The preview sits on the background it will actually be shown
 * on (light or dark), so a black mark on a dark header is obvious right away.
 */
function LogoSlot({ variant, title, description, url, fallbackUrl, height, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const shown = url || fallbackUrl;

  const run = async (request) => {
    setBusy(true);
    try {
      await request();
      await onChanged();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="logo-slot">
      <div className={`logo-slot__stage is-${variant === 'dark' ? 'dark' : 'light'}`}>
        {shown ? (
          <img
            src={shown}
            alt=""
            style={{ height, opacity: url ? 1 : 0.45 }}
          />
        ) : (
          <span className="chrome__mark" />
        )}
      </div>
      <div className="logo-slot__body">
        <div className="logo-slot__title">{title}</div>
        <div className="logo-slot__desc">
          {!url && fallbackUrl ? t('settings.general.logoDarkFallback') : description}
        </div>
        <div className="logo-slot__actions">
          <Upload
            accept={ACCEPT}
            showUploadList={false}
            beforeUpload={(file) => {
              const form = new FormData();
              form.append('logo', file);
              run(() => uploadProjectLogo(form, variant));
              return false;
            }}
          >
            <Button size="small" loading={busy}>
              {t('admin.logoUpload')}
            </Button>
          </Upload>
          {url && (
            <Button size="small" type="text" danger disabled={busy} onClick={() => run(() => removeProjectLogo(variant))}>
              {t('admin.logoRemove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneralForm({ settings, appearance, save }) {
  const { t } = useLocale();
  const { refresh: refreshPublic } = useSettings();
  const initial = useMemo(
    () => ({
      appName: settings.appName || '',
      appDescription: settings.appDescription || '',
      logoHeight: Number(appearance.logoHeight) || 32,
    }),
    [settings.appName, settings.appDescription, appearance.logoHeight]
  );
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ logoHeight, ...rest }) =>
    save({ ...rest, appearance: { logoHeight } })
  );
  const height = Form.useWatch('logoHeight', form) || initial.logoHeight;

  return (
    <Form {...formProps}>
      <SettingsSection title={t('settings.general.identity')} description={t('settings.general.identityDesc')}>
        <SettingRow label={t('admin.appName')}>
          <Form.Item name="appName" rules={[{ required: true, max: 80 }]} noStyle>
            <Input maxLength={80} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('admin.appDescription')} stacked>
          <Form.Item name="appDescription" rules={[{ max: 400 }]} noStyle>
            <Input.TextArea rows={3} maxLength={400} showCount />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('settings.general.brand')} description={t('settings.general.brandDesc')}>
        <div className="logo-slots">
          <LogoSlot
            variant="primary"
            title={t('settings.general.logoPrimary')}
            description={t('settings.general.logoPrimaryDesc')}
            url={appearance.logoUrl}
            height={height}
            onChanged={refreshPublic}
          />
          <LogoSlot
            variant="dark"
            title={t('settings.general.logoDark')}
            description={t('settings.general.logoDarkDesc')}
            url={appearance.logoDarkUrl}
            fallbackUrl={appearance.logoUrl}
            height={height}
            onChanged={refreshPublic}
          />
        </div>
        <SettingRow label={t('settings.general.logoHeight')} description={t('settings.general.logoHeightDesc')}>
          <div className="slider-field">
            <Form.Item name="logoHeight" noStyle>
              <Slider min={20} max={64} style={{ flex: 1 }} />
            </Form.Item>
            <Form.Item name="logoHeight" noStyle>
              <InputNumber min={20} max={64} suffix="px" style={{ width: 96 }} />
            </Form.Item>
          </div>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function GeneralSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  const { settings: publicSettings } = useSettings();
  // Logos are uploaded outside the form; read them from the live public settings.
  const appearance = publicSettings?.appearance || settings?.appearance || {};
  return (
    <>
      <SettingsPageHeader id="general" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <GeneralForm settings={settings} appearance={appearance} save={save} />}
      </LoadState>
    </>
  );
}
