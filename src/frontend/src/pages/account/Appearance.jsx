import { useMemo } from 'react';
import { Form, Segmented } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import SaveBar from '../../components/ui/SaveBar';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { updateAccountProfile } from '../../services/api';
import { HintLabel } from '../../help/Hint';
import RegionalFields from '../../components/ui/RegionalFields';
import { useSettings } from '../../context/SettingsContext';
import AccountAssistant from '../../modules/assistant/AccountAssistant';

/** Form.Item adapter for the person's region overrides. */
const MyRegional = ({ value, onChange, portal }) => <RegionalFields personal portal={portal || {}} value={value || {}} onChange={onChange} />;

export default function AccountAppearance() {
  const { user, setUser } = useAuth();
  const { t, setLocale, portalDefault } = useLocale();
  const { setMode } = useThemeMode();

  const { settings } = useSettings();
  const initial = useMemo(
    () => ({ locale: user?.locale || 'auto', theme: user?.theme || 'system', regional: { timeZone: null, dateFormat: null, timeFormat: null, weekStart: null, ...(user?.regional || {}) } }),
    [user?.locale, user?.theme, user?.regional]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    const res = await updateAccountProfile(values);
    setUser(res.data.user);
    setLocale(values.locale === 'auto' ? null : values.locale);
    setMode(values.theme);
  });

  return (
    <div className="narrow-page">
      <PageHeader title={t('account.appearance')} description={t('account.appearanceLead')} />
      <Form {...formProps}>
        <SettingsSection>
          <SettingRow label={<HintLabel id="account.language">{t('account.language')}</HintLabel>} description={t('account.languageDesc')}>
            <Form.Item name="locale" noStyle>
              <Segmented
                options={[
                  { value: 'auto', label: t('account.languageAuto', { name: portalDefault === 'ru' ? 'Русский' : portalDefault === 'en' ? 'English' : t('account.languageBrowser') }) },
                  { value: 'ru', label: 'Русский' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Form.Item>
          </SettingRow>
          <SettingRow label={<HintLabel id="account.theme">{t('header.theme')}</HintLabel>} description={t('account.themeDesc')}>
            <Form.Item name="theme" noStyle>
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
        <SettingsSection title={<HintLabel id="account.regional">{t('regional.meTitle')}</HintLabel>} description={t('regional.meDesc')}>
          <Form.Item name="regional" noStyle>
            <MyRegional portal={settings?.regional} />
          </Form.Item>
        </SettingsSection>
      </Form>
      <AccountAssistant />
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </div>
  );
}
