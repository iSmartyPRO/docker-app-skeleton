import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Avatar, Button, Checkbox, Popconfirm, Skeleton, Tag } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { SettingsSection } from '../../components/ui/SettingsSection';
import { IconGoogle } from '../../components/icons/AdminIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import {
  disconnectAccountGoogle,
  getAccountGoogle,
  getAccountGoogleCalendars,
  saveAccountGoogleCalendars,
  startGoogle,
} from '../../services/api';
import { HintLabel } from '../../help/Hint';

function GoogleCalendars() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAccountGoogleCalendars()
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const toggle = async (id, on) => {
    const selected = on ? [...data.selected, id] : data.selected.filter((item) => item !== id);
    setData((prev) => ({ ...prev, selected }));
    try {
      await saveAccountGoogleCalendars(selected);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  if (error) return <div className="signin__error">{error}</div>;
  if (!data) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  return (
    <div className="gcal-list">
      {data.calendars.map((calendar) => (
        <label key={calendar.id} className="gcal-list__row">
          <Checkbox checked={data.selected.includes(calendar.id)} onChange={(event) => toggle(calendar.id, event.target.checked)} />
          <span className="gcal-list__dot" style={{ background: calendar.color }} />
          <span className="gcal-list__name">{calendar.name}</span>
          {calendar.primary && <Tag bordered={false}>{t('connections.primary')}</Tag>}
          {!calendar.writable && <Tag bordered={false}>{t('connections.readOnly')}</Tag>}
        </label>
      ))}
    </div>
  );
}

/** Linked accounts: Google sign-in and Google Calendar access. */
export default function AccountConnections() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [google, setGoogle] = useState(null);

  const load = useCallback(() => getAccountGoogle().then((res) => setGoogle(res.data.google)), []);

  useEffect(() => {
    load().catch((err) => message.error(errorMessage(err)));
  }, [load, message]);

  useEffect(() => {
    if (params.get('google') === 'connected') message.success(t('connections.connected'));
    const code = params.get('google_error');
    if (code) {
      const key = `signin.errors.${code}`;
      message.error(t(key) === key ? t('signin.errors.GOOGLE_ERROR') : t(key));
    }
    if (params.toString()) setParams({}, { replace: true });
  }, [params, setParams, message, t]);

  const disconnect = async () => {
    try {
      const res = await disconnectAccountGoogle();
      setGoogle(res.data.google);
      message.success(t('connections.disconnected'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="narrow-page">
      <PageHeader title={t('connections.title')} description={t('connections.lead')} />
      {!google ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : !google.available && !google.connected ? (
        <SettingsSection>
          <div className="connection-empty">{t('connections.none')}</div>
        </SettingsSection>
      ) : (
        <>
          <SettingsSection title={<HintLabel id="account.google">Google</HintLabel>} description={t('connections.googleDesc')}>
            <div className="connection">
              <span className="connection__logo"><IconGoogle size={40} /></span>
              <div className="connection__text">
                {google.connected ? (
                  <>
                    <strong className="connection__who">
                      {google.picture && <Avatar size={22} src={google.picture} />}
                      {google.email}
                    </strong>
                    <span className="connection__chips">
                      <Tag color="green" bordered={false}>{t('connections.signIn')}</Tag>
                      {google.calendarFeature &&
                        (google.calendar ? (
                          <Tag color="green" bordered={false}>{t('connections.calendarOn')}</Tag>
                        ) : (
                          <Tag color="orange" bordered={false}>{t(google.revoked ? 'connections.calendarRevoked' : 'connections.calendarOff')}</Tag>
                        ))}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>{t('connections.notConnected')}</strong>
                    <span>{t(google.calendarFeature ? 'connections.connectHintCalendar' : 'connections.connectHint')}</span>
                  </>
                )}
              </div>
              <div className="connection__actions">
                {(!google.connected || (google.calendarFeature && !google.calendar)) && google.available && (
                  <Button type="primary" onClick={() => startGoogle('connect', '/account/connections')}>
                    {google.connected ? t('connections.grantCalendar') : t('connections.connect')}
                  </Button>
                )}
                {google.connected && (
                  <Popconfirm title={t('connections.disconnectConfirm')} onConfirm={disconnect}>
                    <Button danger>{t('connections.disconnect')}</Button>
                  </Popconfirm>
                )}
              </div>
            </div>
          </SettingsSection>
          {google.calendar && (
            <SettingsSection title={t('connections.calendarsTitle')} description={t('connections.calendarsDesc')}>
              <GoogleCalendars />
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}
