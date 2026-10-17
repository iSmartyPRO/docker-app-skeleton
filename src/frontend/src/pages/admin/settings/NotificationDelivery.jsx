import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Input, Select, Skeleton, Switch } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { IconBell, IconMail, IconMattermost, IconTelegram, IconWhatsapp } from '../../../components/icons/AdminIcons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import api from '../../../services/api';
import { HintLabel } from '../../../help/Hint';
import SettingsPageHeader from './SettingsPageHeader';
import './notification-delivery.css';

/*
 * Settings → Integrations → Notifications: which channels the portal uses for
 * notifications, how WhatsApp is sent (independently of sign-in codes), how
 * many people each channel reaches, and a test message to any recipient.
 */

const CHANNELS = [
  { id: 'push', icon: () => <span className="nd-emoji">📱</span>, setup: '/admin/settings/system' },
  { id: 'email', icon: IconMail, setup: '/admin/settings/email' },
  { id: 'whatsapp', icon: IconWhatsapp, setup: '/admin/settings/whatsapp' },
  { id: 'telegram', icon: IconTelegram, setup: '/admin/settings/telegram' },
  { id: 'mattermost', icon: IconMattermost, setup: '/admin/settings/mattermost' },
];
const RECIPIENT = { email: 'name@company.com', whatsapp: '+996 700 123 456', telegram: 'chat id', mattermost: 'user.name' };

export default function NotificationDelivery() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { message } = App.useApp();
  const editable = can('settings.integrations');
  const [data, setData] = useState(null);
  const [test, setTest] = useState({ channel: 'whatsapp', to: '', provider: '' });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/notifications');
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [message]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch) => {
    try {
      const res = await api.put('/admin/notifications', patch);
      setData(res.data);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await api.post('/admin/notifications/test', { channel: test.channel, to: test.to, provider: test.channel === 'whatsapp' ? test.provider || undefined : undefined });
      setResult(res.data.result);
    } catch (err) {
      setResult({ ok: false, error: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!data) {
    return (
      <div>
        <SettingsPageHeader id="notifications" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }
  const { config, integration, providers, coverage, signinWhatsapp, duplicates = [] } = data;
  const percent = (n) => (coverage.total ? Math.round((n / coverage.total) * 100) : 0);

  return (
    <div className="nd">
      <SettingsPageHeader id="notifications" extra={<Button onClick={load}>{t('admin.historyRefresh')}</Button>} />

      <SettingsSection title={<HintLabel id="admin.notifyChannels">{t('notifyAdmin.channelsTitle')}</HintLabel>} description={t('notifyAdmin.channelsDesc')}>
        <div className="nd-channels">
          <div className="nd-channel is-on">
            <div className="nd-channel__head">
              <IconBell />
              <strong>{t('notifications.inApp')}</strong>
              <Switch size="small" checked disabled />
            </div>
            <span className="nd-muted">{t('notifyAdmin.bellAlways')}</span>
          </div>
          {CHANNELS.map(({ id, icon: Icon, setup }) => {
            const ready = integration[id];
            const on = config.channels[id] !== false;
            const reached = coverage[id] || 0;
            return (
              <div key={id} className={`nd-channel ${!ready ? 'is-missing' : on ? 'is-on' : 'is-off'}`}>
                <div className="nd-channel__head">
                  <Icon />
                  <strong>{t(`notifications.channel_${id}`)}</strong>
                  <Switch size="small" checked={ready && on} disabled={!ready || !editable} onChange={(value) => save({ channels: { [id]: value } })} />
                </div>
                {ready ? (
                  <>
                    <div className="nd-bar" title={`${reached} / ${coverage.total}`}>
                      <i style={{ width: `${percent(reached)}%` }} />
                    </div>
                    <span className="nd-muted">{t(`notifyAdmin.coverage.${id}`, { n: reached, total: coverage.total })}</span>
                  </>
                ) : (
                  <span className="nd-muted">
                    {t('notifyAdmin.notReady')}{' '}
                    {id !== 'push' && <Link to={setup}>{t('notifyAdmin.setUp')} →</Link>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="nd-note">{t('notifyAdmin.coverageNote')}</p>
      </SettingsSection>

      {duplicates.length > 0 && (
        <SettingsSection title={`⚠ ${t('notifyAdmin.dupTitle')}`} description={t('notifyAdmin.dupDesc')}>
          <ul className="nd-dups">
            {duplicates.map((row) => (
              <li key={`${row.field}:${row.value}`}>
                <span className="nd-dups__what">
                  <span className="nd-muted">{t(`notifyAdmin.dupField.${row.field}`)}</span> <strong>{row.value}</strong>
                </span>
                <span className="nd-dups__who">
                  {row.users.map((u) => (
                    <Link key={u.id} to={`/admin/users/${u.id}`} className="nd-dups__user">
                      @{u.username}
                      {!u.active && <span className="nd-muted"> · {t('notifyAdmin.dupInactive')}</span>}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      <SettingsSection title={<HintLabel id="admin.notifyWhatsapp">{t('notifyAdmin.whatsappTitle')}</HintLabel>} description={t('notifyAdmin.whatsappDesc')}>
        <SettingRow label={t('notifyAdmin.provider')} description={t('notifyAdmin.providerDesc', { signin: t(`notifyAdmin.providers.${signinWhatsapp.provider || 'gateway'}`) })}>
          <Segmented
            value={config.whatsapp.provider}
            disabled={!editable || !integration.whatsapp}
            onChange={(provider) => save({ whatsapp: { provider } })}
            options={[
              { value: 'auto', label: t('notifyAdmin.providers.auto') },
              { value: 'gateway', label: t('notifyAdmin.providers.gateway'), disabled: !providers.gateway },
              { value: 'wazzup', label: t('notifyAdmin.providers.wazzup'), disabled: !providers.wazzup },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('notifyAdmin.fallback')} description={t('notifyAdmin.fallbackDesc')}>
          <Switch checked={config.whatsapp.fallback} disabled={!editable || config.whatsapp.provider === 'auto' || !(providers.gateway && providers.wazzup)} onChange={(fallback) => save({ whatsapp: { fallback } })} />
        </SettingRow>
        <div className="nd-providers">
          {['gateway', 'wazzup'].map((id) => (
            <span key={id} className={`nd-provider ${providers[id] ? 'is-ok' : 'is-off'}`}>
              {providers[id] ? '●' : '○'} {t(`notifyAdmin.providers.${id}`)} — {providers[id] ? t('notifyAdmin.connected') : t('notifyAdmin.notConnected')}{' '}
              <Link to={id === 'gateway' ? '/admin/settings/whatsapp' : '/admin/settings/wazzup'}>{t('notifyAdmin.open')}</Link>
            </span>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('notifyAdmin.testTitle')} description={t('notifyAdmin.testDesc')}>
        <div className="nd-test">
          <Select
            value={test.channel}
            onChange={(channel) => setTest({ ...test, channel, to: '' })}
            style={{ width: 160 }}
            options={CHANNELS.filter((item) => item.id !== 'push').map((item) => ({ value: item.id, label: t(`notifications.channel_${item.id}`), disabled: !integration[item.id] }))}
          />
          {test.channel === 'whatsapp' && (
            <Select
              value={test.provider}
              onChange={(provider) => setTest({ ...test, provider })}
              style={{ minWidth: 170 }}
              popupMatchSelectWidth={false}
              options={[
                { value: '', label: t('notifyAdmin.asConfigured') },
                { value: 'gateway', label: t('notifyAdmin.providers.gateway'), disabled: !providers.gateway },
                { value: 'wazzup', label: t('notifyAdmin.providers.wazzup'), disabled: !providers.wazzup },
              ]}
            />
          )}
          <Input value={test.to} onChange={(event) => setTest({ ...test, to: event.target.value })} onPressEnter={runTest} placeholder={RECIPIENT[test.channel]} style={{ flex: 1, minWidth: 180 }} />
          <Button type="primary" loading={testing} disabled={!test.to.trim() || !editable} onClick={runTest}>
            {t('notifyAdmin.send')}
          </Button>
        </div>
        {result && (
          <div className={`nd-result ${result.ok ? 'is-ok' : 'is-bad'}`}>
            {result.ok ? t('notifyAdmin.sentVia', { via: result.via, ms: result.ms }) : `✕ ${result.error}`}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('notifyAdmin.howTitle')}>
        <ol className="nd-how">
          <li>{t('notifyAdmin.how1')}</li>
          <li>{t('notifyAdmin.how2')}</li>
          <li>{t('notifyAdmin.how3')}</li>
          <li>{t('notifyAdmin.how4')}</li>
        </ol>
      </SettingsSection>
    </div>
  );
}
