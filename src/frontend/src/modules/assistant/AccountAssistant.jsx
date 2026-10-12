import { App, Button, Segmented, Skeleton, Switch } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import Cast from './Cast';
import { savePrefs, useAssistantPrefs, writePosition } from './store';
import './assistant.css';

/** Account → Appearance: the person's own robot. Changes apply at once. */
export default function AccountAssistant() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { message } = App.useApp();
  const moduleOn = Boolean(settings?.modules?.assistant?.enabled);
  const prefs = useAssistantPrefs(moduleOn ? user?.id : null);
  if (!moduleOn) return null;
  const orgAvatar = settings.modules.assistant.avatar || prefs?.defaultAvatar || 'pixel';

  const change = async (patch, done) => {
    try {
      await savePrefs(patch);
      if (done) message.success(done);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div id="assistant">
      <SettingsSection title={`🤖 ${t('assistant.account.title')}`} description={t('assistant.account.desc')}>
        {!prefs ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          <>
            <SettingRow label={t('assistant.account.show')} description={t('assistant.account.showDesc')}>
              <Switch checked={prefs.enabled} onChange={(enabled) => change({ enabled })} />
            </SettingRow>
            <div className="asst-account-picker">
              <Cast
                value={prefs.avatar || orgAvatar}
                colors={prefs.colors}
                onPick={(avatar) => change({ avatar })}
                onTint={(avatar, color) => change({ colors: { [avatar]: color } })}
              />
              <p className="asst-account-note">
                {prefs.avatar ? (
                  <>
                    {t('assistant.account.ownChoice')}{' '}
                    <Button size="small" type="link" onClick={() => change({ avatar: null })}>
                      {t('assistant.account.useDefault', { name: t(`assistant.robots.${orgAvatar}.name`) })}
                    </Button>
                  </>
                ) : (
                  t('assistant.account.defaultChoice', { name: t(`assistant.robots.${orgAvatar}.name`) })
                )}
              </p>
            </div>
            <SettingRow label={t('assistant.account.size')}>
              <Segmented
                value={prefs.size}
                onChange={(size) => change({ size })}
                options={['S', 'M', 'L'].map((value) => ({ value, label: t(`assistant.sizes.${value}`) }))}
              />
            </SettingRow>
            <SettingRow label={t('assistant.account.place')} description={t('assistant.account.placeDesc')}>
              <Button onClick={() => writePosition(null)}>{t('assistant.menu.corner')}</Button>
            </SettingRow>
            <SettingRow label={t('assistant.account.again')} description={t('assistant.account.againDesc')}>
              <Button onClick={() => change({ resetGreetings: true }, t('assistant.account.againDone'))}>{t('assistant.account.againButton')}</Button>
            </SettingRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
