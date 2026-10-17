import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, ColorPicker, Form, Select, Slider, Spin, Switch } from 'antd';
import Segmented from '../../components/ui/Segmented';
import PageHeader from '../../components/ui/PageHeader';
import SaveBar from '../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import api, { updateAccountProfile } from '../../services/api';
import { HintLabel } from '../../help/Hint';
import RegionalFields from '../../components/ui/RegionalFields';
import { useSettings } from '../../context/SettingsContext';
import AccountAssistant from '../../modules/assistant/AccountAssistant';
import ThemePicker from '../../theme/ThemePicker';
import { cleanCustom, selectableThemes } from '../../theme/themes';
import { ensureContrast } from '../../theme/contrast';
import { useTour } from '../../tour/TourContext';
import { TourIcon } from '../../tour/TourButton';
import { errorMessage } from '../../lib/errors';
import { languageInfo } from '../../i18n/languages';

/** Form.Item adapter for the person's region overrides. */
const MyRegional = ({ value, onChange, portal }) => <RegionalFields personal portal={portal || {}} value={value || {}} onChange={onChange} />;

const hexOf = (value) => (!value ? null : typeof value === 'string' ? value : value.toHexString());

/** Picture, accent colour, panels, dimming and blur of the custom theme (a Form.Item value). */
function CustomTheme({ value, onChange }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { tokens } = useThemeMode();
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const custom = cleanCustom(value);
  const set = (patch) => onChange?.({ ...custom, ...patch });
  const accent = custom.accent || tokens.colorPrimary;
  const readable = custom.accent ? ensureContrast(custom.accent, [tokens.colorBgContainer, tokens.colorBgLayout], 4.5) : null;

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      message.error(t('themes.errors.BG_TOO_LARGE'));
      return;
    }
    const body = new FormData();
    body.append('image', file);
    setBusy(true);
    try {
      const res = await api.post('/account/background', body);
      const { image } = res.data;
      // A bright picture reads best under light panels, a dark one under dark panels.
      set({ image: image.id, scheme: image.scheme });
    } catch (err) {
      const code = err?.response?.data?.code;
      const known = code ? t(`themes.errors.${code}`) : null;
      message.error(known && !known.startsWith('themes.') ? known : errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="ts-custom">
      <div
        className={`ts-custom__pic${custom.image ? ' has-image' : ''}`}
        style={custom.image ? { backgroundImage: `url(/api/account/background/${custom.image}/mobile)` } : undefined}
      >
        {!custom.image && !busy && <span>{t('themes.custom.limits')}</span>}
        {busy && <Spin tip={t('themes.custom.uploading')} />}
      </div>
      <div className="ts-custom__fields">
        <div className="ts-custom__actions">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" onChange={(event) => upload(event.target.files?.[0])} />
          <Button onClick={() => input.current?.click()} loading={busy}>
            {custom.image ? t('themes.custom.replace') : t('themes.custom.upload')}
          </Button>
          {custom.image && <Button onClick={() => set({ image: null })}>{t('themes.custom.remove')}</Button>}
        </div>
        <label className="ts-custom__row">
          <span>{t('themes.custom.accent')}</span>
          <ColorPicker value={accent} disabledAlpha showText onChangeComplete={(color) => set({ accent: hexOf(color)?.toUpperCase() })} />
          {readable && readable.toUpperCase() !== custom.accent.toUpperCase() && (
            <span className="ts-custom__hint">
              {t('themes.custom.accentAuto')}: {readable}
            </span>
          )}
        </label>
        <div className="ts-custom__row">
          <span>{t('themes.custom.scheme')}</span>
          <Segmented
            value={custom.scheme}
            onChange={(scheme) => set({ scheme })}
            options={[
              { value: 'light', label: t('header.light') },
              { value: 'dark', label: t('header.dark') },
            ]}
          />
        </div>
        {custom.image && (
          <>
            <div className="ts-custom__row">
              <span>{t('themes.custom.dim')}</span>
              <Slider min={60} max={92} value={custom.dim} onChange={(dim) => set({ dim })} tooltip={{ formatter: (v) => `${v}%` }} />
              <span className="ts-custom__hint">{t('themes.custom.dimDesc')}</span>
            </div>
            <div className="ts-custom__row">
              <span>{t('themes.custom.blur')}</span>
              <Slider min={0} max={24} value={custom.blur} onChange={(blur) => set({ blur })} tooltip={{ formatter: (v) => `${v}px` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AccountAppearance() {
  const { user, setUser } = useAuth();
  const { t, setLocale, portalDefault, languages, localization } = useLocale();
  const { setMode, policy, appearance, setPersonalPreview, clearPersonalPreview, isPersonalPreview } = useThemeMode();
  const { message } = App.useApp();
  const tour = useTour();
  const { settings } = useSettings();
  const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const offered = useMemo(() => selectableThemes(policy, { portalDefault: appearance.defaultTheme }).map((theme) => theme.id), [policy, appearance.defaultTheme]);
  const initial = useMemo(
    () => ({
      // A language that has since been disabled reads as «As the portal».
      locale: languages.some((language) => language.code === user?.locale) ? user.locale : 'auto',
      theme: user?.theme || 'system',
      motion: user?.ui?.motion === 'off' ? 'off' : 'auto',
      custom: cleanCustom(user?.ui?.custom),
      regional: { timeZone: null, dateFormat: null, timeFormat: null, weekStart: null, ...(user?.regional || {}) },
    }),
    [user?.locale, user?.theme, user?.regional, user?.ui, languages]
  );
  const { form, dirty, saving, submit, reset, formProps, recompute } = useSettingsForm(initial, async (values) => {
    // The language only when it was changed here: a stored language that is disabled at the moment
    // reads as «As the portal» above and must survive a save of the theme (it returns when re-enabled).
    const localeChanged = values.locale !== initial.locale;
    const res = await updateAccountProfile({ ...(localeChanged ? { locale: values.locale } : {}), theme: values.theme, regional: values.regional });
    const ui = await api.put('/account/ui', { motion: values.motion, custom: values.custom });
    setUser(ui.data.user || res.data.user);
    if (localeChanged) setLocale(values.locale === 'auto' ? null : values.locale);
    setMode(values.theme);
    clearPersonalPreview();
  });

  // Live preview of theme, picture and motion while the person decides.
  const onValuesChange = (changed, all) => {
    recompute();
    if ('theme' in changed || 'custom' in changed || 'motion' in changed) {
      setPersonalPreview({ theme: all.theme, custom: all.custom, motion: all.motion });
    }
  };
  useEffect(() => () => clearPersonalPreview(), [clearPersonalPreview]);
  const onReset = () => {
    reset();
    clearPersonalPreview();
  };

  const theme = Form.useWatch('theme', form);
  const custom = Form.useWatch('custom', form);
  const customCard = policy.allowCustom ? { ...cleanCustom(custom), thumb: custom?.image ? `/api/account/background/${custom.image}/placeholder` : null } : null;

  return (
    <div className="narrow-page">
      <PageHeader title={t('account.appearance')} description={t('account.appearanceLead')} />
      <Form {...formProps} onValuesChange={onValuesChange}>
        <SettingsSection>
          <SettingRow label={<HintLabel id="account.language">{t('account.language')}</HintLabel>} description={t('account.languageDesc')}>
            <Form.Item name="locale" noStyle>
              {(() => {
                const options = [
                  { value: 'auto', label: t('account.languageAuto', { name: localization.default === 'browser' ? t('account.languageBrowser') : languageInfo(portalDefault).name }) },
                  ...languages.map((language) => ({ value: language.code, label: <span lang={language.tag}>{language.name}</span> })),
                ];
                return languages.length > 3 ? <Select options={options} style={{ minWidth: 220 }} /> : <Segmented options={options} />;
              })()}
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={<HintLabel id="account.theme">{t('themes.title')}</HintLabel>} description={t('themes.desc')}>
          {isPersonalPreview && dirty && <Alert type="info" showIcon message={t('themes.preview')} className="page-alert" />}
          <Form.Item name="theme" noStyle>
            <ThemePicker themes={offered} custom={customCard} />
          </Form.Item>
          <div style={{ display: theme === 'custom' ? 'block' : 'none', marginTop: 18 }}>
            <h4 className="settings-section__title">{t('themes.custom.title')}</h4>
            <p className="settings-section__desc">{t('themes.custom.desc')}</p>
            <Form.Item name="custom" noStyle>
              <CustomTheme />
            </Form.Item>
          </div>
          <SettingRow
            label={t('themes.motion')}
            description={reduced ? t('themes.motionReduced') : policy.allowMotion === false ? t('themes.motionPolicyOff') : t('themes.motionDesc')}
          >
            <Form.Item name="motion" noStyle getValueProps={(value) => ({ checked: value === 'off' })} getValueFromEvent={(checked) => (checked ? 'off' : 'auto')}>
              <Switch aria-label={t('themes.motionOff')} checkedChildren={t('themes.motionOff')} unCheckedChildren={t('themes.motionOff')} />
            </Form.Item>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={<HintLabel id="account.regional">{t('regional.meTitle')}</HintLabel>} description={t('regional.meDesc')}>
          <Form.Item name="regional" noStyle>
            <MyRegional portal={settings?.regional} />
          </Form.Item>
        </SettingsSection>
      </Form>
      <SettingsSection title={t('themes.tours.title')}>
        <SettingRow label={t('themes.tours.off')} description={t('themes.tours.offDesc')}>
          <Switch
            checked={Boolean(tour.state?.disabled)}
            disabled={!tour.state || Boolean(user?.impersonator)}
            aria-label={t('themes.tours.off')}
            onChange={(checked) => tour.setDisabled(checked).catch((err) => message.error(errorMessage(err)))}
          />
        </SettingRow>
        <div style={{ marginTop: 12 }}>
          <Button icon={<TourIcon />} onClick={() => tour.startTour('portal')} disabled={Boolean(tour.running)}>
            {t('themes.tours.replay')}
          </Button>
        </div>
      </SettingsSection>
      <AccountAssistant />
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={onReset} />
    </div>
  );
}
