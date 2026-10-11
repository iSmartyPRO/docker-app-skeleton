import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Skeleton, Switch } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { IconBell, IconMail, IconMattermost, IconTelegram } from '../../components/icons/AdminIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { getNotificationPrefs, saveNotificationPrefs } from '../../services/api';
import PushSetting from '../../pwa/PushSetting';

const CHANNELS = [
  { id: 'email', icon: IconMail, fix: '/account' },
  { id: 'telegram', icon: IconTelegram, fix: '/account/security' },
  { id: 'mattermost', icon: IconMattermost, fix: '/account' },
];

/** Where notifications are delivered: the bell always, other channels by choice. */
export default function AccountNotifications() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    getNotificationPrefs()
      .then((res) => setData(res.data))
      .catch((err) => message.error(errorMessage(err)));
  }, [message]);

  const toggle = async (channel, on) => {
    setData((prev) => ({ ...prev, prefs: { ...prev.prefs, [channel]: on } }));
    try {
      const res = await saveNotificationPrefs({ [channel]: on });
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="narrow-page">
      <PageHeader title={t('notifications.prefsTitle')} description={t('notifications.prefsLead')} />
      {!data ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <>
          <SettingsSection title={t('notifications.channels')} description={t('notifications.channelsDesc')}>
            <SettingRow
              label={<span className="channel-label"><IconBell />{t('notifications.inApp')}</span>}
              description={t('notifications.inAppDesc')}
            >
              <Switch checked disabled />
            </SettingRow>
            <PushSetting />
            {CHANNELS.map(({ id, icon: Icon, fix }) => (
              <SettingRow
                key={id}
                label={<span className="channel-label"><Icon />{t(`notifications.channel_${id}`)}</span>}
                description={
                  data.reach[id] ? (
                    t(`notifications.channel_${id}Desc`)
                  ) : (
                    <>
                      {t(`notifications.unreachable_${id}`)} <Link to={fix}>{t('notifications.fix')} →</Link>
                    </>
                  )
                }
              >
                <Switch checked={data.prefs[id] && data.reach[id]} disabled={!data.reach[id]} onChange={(on) => toggle(id, on)} />
              </SettingRow>
            ))}
          </SettingsSection>
          <SettingsSection title={t('notifications.whatTitle')} description={t('notifications.whatDesc')}>
            <ul className="notify-kinds">
              {['tasksAssigned', 'tasksStatus', 'tasksComment', 'tasksDue', 'calendarInvite', 'calendarReminder', 'filesShared'].map((kind) => (
                <li key={kind}>{t(`notifications.kind_${kind}`)}</li>
              ))}
            </ul>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
