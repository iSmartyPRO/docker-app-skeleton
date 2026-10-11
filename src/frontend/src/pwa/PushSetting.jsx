import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Switch } from 'antd';
import { SettingRow } from '../components/ui/SettingsSection';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';
import { currentSubscription, disablePush, enablePush, pushSupport, testPush } from './push';

function PhoneIcon() {
  return (
    <svg className="da-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="#0EA5E9" />
      <rect x="8" y="4.6" width="8" height="14.8" rx="2" fill="#fff" />
      <circle cx="12" cy="17.2" r=".9" fill="#0EA5E9" />
    </svg>
  );
}

/** "Push on this device": per-device switch in notification preferences. */
export default function PushSetting() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!support.supported) return;
    currentSubscription().then((subscription) => setOn(Boolean(subscription) && Notification.permission === 'granted')).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (next) => {
    setBusy(true);
    try {
      if (next) {
        await enablePush();
        setOn(true);
        message.success(t('pwa.push.enabled'));
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (err) {
      const key = `pwa.push.${err.code || 'error'}`;
      message.error(t(key) === key ? errorMessage(err) : t(key));
    } finally {
      setBusy(false);
    }
  };

  let description = t('pwa.push.desc');
  if (support.needsInstall) {
    description = (
      <>
        {t('pwa.push.iosInstall')} <Link to="/install">{t('pwa.install.how')} →</Link>
      </>
    );
  } else if (!support.supported) description = t('pwa.push.unsupported');
  else if (support.permission === 'denied') description = t('pwa.push.blocked');

  return (
    <SettingRow
      label={<span className="channel-label"><PhoneIcon />{t('pwa.push.title')}</span>}
      description={description}
    >
      <span className="push-control">
        {on && (
          <Button size="small" onClick={() => testPush().then(() => message.success(t('pwa.push.testSent'))).catch((err) => message.error(errorMessage(err)))}>
            {t('pwa.push.test')}
          </Button>
        )}
        <Switch checked={on} loading={busy} disabled={!support.supported || support.permission === 'denied'} onChange={toggle} />
      </span>
    </SettingRow>
  );
}
