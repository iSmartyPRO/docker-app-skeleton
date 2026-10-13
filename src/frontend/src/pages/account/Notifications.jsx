import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { App, Button, Checkbox, Dropdown, Skeleton, Switch, Tooltip } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { IconBell, IconMail, IconMattermost, IconTelegram, IconWhatsapp } from '../../components/icons/AdminIcons';
import { MenuIcon } from '../../components/icons/menuIcons';
import { moduleById } from '../../modules/registry';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { getRegional, nowInZone, useRegional, zoneLabel } from '../../lib/datetime';
import { TimeField } from '../../components/ui/DateTimeField';
import api, { getNotificationPrefs, saveNotificationPrefs } from '../../services/api';
import { currentSubscription, disablePush, enablePush, pushSupport } from '../../pwa/push';
import { forgetReach } from '../../components/ui/WhenPicker';
import { Hint } from '../../help/Hint';
import QuickConnect from '../../components/ui/QuickConnect';
import { useAuth } from '../../context/AuthContext';
import './notifications.css';

/*
 * Notification preferences, built around three questions:
 *   where do my notifications go (channels, with a test),
 *   when should they stay quiet (pause, quiet hours),
 *   about what (events × channels, subscriptions).
 */

const EXTERNAL = ['push', 'email', 'telegram', 'whatsapp', 'mattermost'];
const CHANNEL_ICON = { email: IconMail, telegram: IconTelegram, whatsapp: IconWhatsapp, mattermost: IconMattermost };
const key = (kind) => kind.replace(/\./g, '_');

/** Presets for the events table. */
const PRESETS = {
  recommended: () => ({}),
  important: (catalog) => {
    const keep = new Set(['tasks.assigned', 'tasks.overdue', 'tasks.reminder', 'calendar.invited', 'calendar.cancelled', 'calendar.reminder', 'chat.mention']);
    return Object.fromEntries(catalog.flatMap((group) => group.events).filter((event) => !event.urgent).map((event) => [event.kind, Object.fromEntries(EXTERNAL.map((c) => [c, keep.has(event.kind)]))]));
  },
  everything: (catalog) => Object.fromEntries(catalog.flatMap((group) => group.events).map((event) => [event.kind, { inbox: true, ...Object.fromEntries(EXTERNAL.map((c) => [c, true])) }])),
  bellOnly: (catalog) => Object.fromEntries(catalog.flatMap((group) => group.events).filter((event) => !event.urgent).map((event) => [event.kind, Object.fromEntries(EXTERNAL.map((c) => [c, false]))])),
};

function ChannelCard({ id, data, onToggle, result, onConnected }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const Icon = CHANNEL_ICON[id];
  const configured = data.configured?.[id] !== false;
  const reach = data.reach[id];
  const on = data.prefs.channels?.[id] ?? data.prefs[id];
  const state = !configured ? 'admin' : !reach ? 'disconnected' : on ? 'on' : 'off';
  return (
    <div className={`np-channel is-${state}`}>
      <div className="np-channel__head">
        <span className="np-channel__icon">
          <Icon />
        </span>
        <strong>{t(`notifications.channel_${id}`)}</strong>
        <Switch size="small" checked={state === 'on'} disabled={state === 'admin' || state === 'disconnected'} onChange={(value) => onToggle(id, value)} />
      </div>
      <span className={`np-pill is-${state}`}>{t(`notifyPrefs.state.${state}`)}</span>
      {state === 'disconnected' ? (
        <QuickConnect channel={id} initial={{ email: data.contacts?.email, whatsapp: data.contacts?.phone, mattermost: data.contacts?.mattermost }[id] || ''} onConnected={onConnected} compact />
      ) : (
        <p>
          {state === 'admin' ? (
            <>
              {t('notifyPrefs.notConfigured')}
              {can('settings.integrations') && (
                <>
                  {' '}
                  <Link to="/admin/settings/notifications">{t('when.warn.setUp')} →</Link>
                </>
              )}
            </>
          ) : (
            t(`notifications.channel_${id}Desc`)
          )}
        </p>
      )}
      {result && <TestResult value={result} />}
    </div>
  );
}

/** Push on this very device: the browser asks for permission once. */
function DevicePush({ onChanged }) {
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
      if (next) await enablePush();
      else await disablePush();
      setOn(next);
      onChanged?.();
    } catch (err) {
      const key = `pwa.push.${err.code || 'error'}`;
      message.error(t(key) === key ? errorMessage(err) : t(key));
    } finally {
      setBusy(false);
    }
  };
  let note = null;
  if (support.needsInstall) note = <>{t('pwa.push.iosInstall')} <Link to="/install">{t('pwa.install.how')} →</Link></>;
  else if (!support.supported) note = t('pwa.push.unsupported');
  else if (support.permission === 'denied') note = t('pwa.push.blocked');
  return (
    <div className="np-device">
      <label>
        <Switch size="small" checked={on} loading={busy} disabled={!support.supported || support.permission === 'denied'} onChange={toggle} />
        <span>{t('notifyPrefs.thisDevice')}</span>
      </label>
      {note && <p>{note}</p>}
    </div>
  );
}

function TestResult({ value }) {
  const { t } = useLocale();
  const ok = value === 'sent';
  const failed = value.startsWith('failed');
  return (
    <span className={`np-test ${ok ? 'is-ok' : failed ? 'is-bad' : 'is-skip'}`}>
      {ok ? `✓ ${t('notifyPrefs.delivery.sent')}` : failed ? `✕ ${value.replace(/^failed: /, '')}` : `— ${t(`notifyPrefs.delivery.${value}`)}`}
    </span>
  );
}

function DeliveryIcons({ delivery }) {
  const { t } = useLocale();
  if (!delivery) return <span className="np-muted">—</span>;
  return (
    <span className="np-dicons">
      {EXTERNAL.map((channel) => {
        const value = delivery[channel];
        if (!value || value === 'skipped') return null;
        const ok = value === 'sent';
        const bad = value.startsWith('failed');
        return (
          <Tooltip key={channel} title={`${t(`notifications.channel_${channel}`)}: ${bad ? value.replace(/^failed: /, '') : t(`notifyPrefs.delivery.${value}`)}`}>
            <span className={`np-dicon ${ok ? 'is-ok' : bad ? 'is-bad' : 'is-skip'}`}>{t(`notifyPrefs.short.${channel}`)}</span>
          </Tooltip>
        );
      })}
    </span>
  );
}

export default function AccountNotifications() {
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const regional = useRegional();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [subs, setSubs] = useState([]);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const [prefs, subscriptions, log] = await Promise.all([getNotificationPrefs(), api.get('/account/notifications/subscriptions'), api.get('/account/notifications/history')]);
      setData(prefs.data);
      // Quiet hours follow the person's time zone (Account → Appearance → Date and time);
      // the server still reads notify_prefs.tz, so keep it in step.
      const zone = getRegional().timeZone;
      if (prefs.data?.prefs && prefs.data.prefs.tz !== zone) {
        saveNotificationPrefs({ tz: zone })
          .then((res) => setData(res.data))
          .catch(() => {});
      }
      setSubs(subscriptions.data.subscriptions);
      setHistory(log.data.items);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch) => {
    try {
      // Sent for older servers that read the zone from notify_prefs.tz.
      const res = await saveNotificationPrefs({ ...patch, tz: getRegional().timeZone });
      setData(res.data);
      forgetReach();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await api.post('/account/notifications/test');
      setTest(res.data.report);
      const log = await api.get('/account/notifications/history');
      setHistory(log.data.items);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const enabledModules = useMemo(() => new Set(Object.entries(settings?.modules || {}).filter(([, value]) => value?.enabled !== false).map(([id]) => id)), [settings]);

  if (!data) {
    return (
      <div className="narrow-page np">
        <PageHeader title={t('notifications.prefsTitle')} description={t('notifyPrefs.lead')} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const prefs = data.prefs;
  const channels = prefs.channels || prefs;
  const columns = ['inbox', ...EXTERNAL.filter((channel) => data.configured?.[channel] !== false)];
  const catalog = (data.catalog || []).filter((group) => !group.module || enabledModules.has(group.module) || !settings?.modules);
  const cell = (event, channel) => {
    if (channel === 'inbox') return event.urgent ? true : prefs.events?.[event.kind]?.inbox !== false;
    if (!event.channels.includes(channel)) return null;
    return prefs.events?.[event.kind]?.[channel] ?? Boolean(event.defaults[channel]);
  };
  const setCell = (event, channel, value) => save({ events: { [event.kind]: { [channel]: value } } });
  const paused = prefs.pausedUntil && new Date(prefs.pausedUntil) > new Date();
  // "Until tomorrow / Monday morning" means 9:00 in the person's time zone.
  const now = nowInZone(regional);
  const nineAt = (day) => dayjs.tz(`${day.format('YYYY-MM-DD')}T09:00:00`, regional.timeZone);
  const pauseItems = [
    ['h1', dayjs().add(1, 'hour')],
    ['h3', dayjs().add(3, 'hour')],
    ['tomorrow', nineAt(now.add(1, 'day'))],
    ['monday', nineAt(now.add((8 - now.day()) % 7 || 7, 'day'))],
  ];

  return (
    <div className="narrow-page np">
      <PageHeader title={t('notifications.prefsTitle')} description={t('notifyPrefs.lead')} />

      {paused && (
        <div className="np-banner">
          <span>⏸ {t('notifyPrefs.pausedUntil', { time: formatDateTime(prefs.pausedUntil, locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}</span>
          <Button size="small" onClick={() => save({ pausedUntil: null })}>
            {t('notifyPrefs.resume')}
          </Button>
        </div>
      )}

      <section className="np-card">
        <header className="np-card__head">
          <div>
            <h3>
              {t('notifyPrefs.whereTitle')}
              <Hint id="notifications.channels" />
            </h3>
            <p>{t('notifyPrefs.whereLead')}</p>
          </div>
          <Button type="primary" ghost loading={testing} onClick={runTest}>
            ✉ {t('notifyPrefs.test')}
          </Button>
        </header>
        <div className="np-channels">
          <div className="np-channel is-on">
            <div className="np-channel__head">
              <span className="np-channel__icon">
                <IconBell />
              </span>
              <strong>{t('notifications.inApp')}</strong>
              <Switch size="small" checked disabled />
            </div>
            <span className="np-pill is-on">{t('notifyPrefs.state.always')}</span>
            <p>{t('notifications.inAppDesc')}</p>
          </div>
          <div className={`np-channel ${data.reach.push ? (channels.push ? 'is-on' : 'is-off') : 'is-disconnected'}`}>
            <div className="np-channel__head">
              <span className="np-channel__icon is-push">📱</span>
              <strong>{t('notifications.channel_push')}</strong>
              <Switch size="small" checked={Boolean(channels.push && data.reach.push)} disabled={!data.reach.push} onChange={(value) => save({ channels: { push: value } })} />
            </div>
            <span className={`np-pill is-${data.reach.push ? (channels.push ? 'on' : 'off') : 'disconnected'}`}>
              {data.reach.push ? t('notifyPrefs.devices', { n: data.devices }) : t('notifyPrefs.state.disconnected')}
            </span>
            <DevicePush onChanged={load} />
            {test?.push && <TestResult value={test.push} />}
          </div>
          {['email', 'telegram', 'whatsapp', 'mattermost'].map((id) => (
            <ChannelCard key={id} id={id} data={data} result={test?.[id]} onConnected={load} onToggle={(channel, value) => save({ channels: { [channel]: value } })} />
          ))}
        </div>
        {test && <p className="np-test-note">{t('notifyPrefs.testNote')}</p>}
      </section>

      <section className="np-card">
        <header className="np-card__head">
          <div>
            <h3>
              {t('notifyPrefs.whenTitle')}
              <Hint id="notifications.quiet" />
            </h3>
            <p>{t('notifyPrefs.whenLead')}</p>
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...pauseItems.map(([id, until]) => ({ key: id, label: t(`notifyPrefs.pause.${id}`), onClick: () => save({ pausedUntil: until.toISOString() }) })),
                ...(paused ? [{ type: 'divider' }, { key: 'off', label: t('notifyPrefs.resume'), onClick: () => save({ pausedUntil: null }) }] : []),
              ],
            }}
          >
            <Button>⏸ {t('notifyPrefs.pauseButton')}</Button>
          </Dropdown>
        </header>
        <div className="np-quiet">
          <label className="np-quiet__switch">
            <Switch checked={prefs.quiet?.enabled} onChange={(enabled) => save({ quiet: { enabled } })} />
            <span>{t('notifyPrefs.quiet')}</span>
          </label>
          <div className={`np-quiet__range${prefs.quiet?.enabled ? '' : ' is-off'}${regional.timeFormat === '12' ? ' is-h12' : ''}`}>
            <span>{t('notifyPrefs.from')}</span>
            <TimeField value={prefs.quiet?.from || '22:00'} minuteStep={15} allowClear={false} needConfirm={false} disabled={!prefs.quiet?.enabled} onChange={(from) => from && save({ quiet: { from } })} />
            <span>{t('notifyPrefs.to')}</span>
            <TimeField value={prefs.quiet?.to || '08:00'} minuteStep={15} allowClear={false} needConfirm={false} disabled={!prefs.quiet?.enabled} onChange={(to) => to && save({ quiet: { to } })} />
            <Checkbox checked={prefs.quiet?.weekends} disabled={!prefs.quiet?.enabled} onChange={(event) => save({ quiet: { weekends: event.target.checked } })}>
              {t('notifyPrefs.weekends')}
            </Checkbox>
          </div>
          <p className="np-muted">{t('notifyPrefs.quietNote')}</p>
          <p className="np-muted">
            {t('notifyPrefs.zoneNote', { zone: `${regional.timeZone.replace(/_/g, ' ')} (${zoneLabel(regional.timeZone)})` })}{' '}
            <Link to="/account/appearance">{t('notifyPrefs.zoneChange')}</Link>
          </p>
        </div>
      </section>

      <section className="np-card">
        <header className="np-card__head">
          <div>
            <h3>
              {t('notifyPrefs.whatTitle')}
              <Hint id="notifications.events" />
            </h3>
            <p>{t('notifyPrefs.whatLead')}</p>
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: Object.keys(PRESETS).map((id) => ({
                key: id,
                label: (
                  <div className="np-preset">
                    <strong>{t(`notifyPrefs.presets.${id}`)}</strong>
                    <span>{t(`notifyPrefs.presets.${id}Desc`)}</span>
                  </div>
                ),
                onClick: () => save(id === 'recommended' ? { resetEvents: true } : { resetEvents: true, events: PRESETS[id](catalog) }),
              })),
            }}
          >
            <Button>{t('notifyPrefs.presetsButton')} ▾</Button>
          </Dropdown>
        </header>
        <div className="np-matrix" style={{ '--np-cols': columns.length }}>
          <div className="np-matrix__head">
            <span />
            {columns.map((channel) => (
              <span key={channel}>{t(`notifyPrefs.short.${channel}`)}</span>
            ))}
          </div>
          {catalog.map((group) => (
            <div key={group.key} className="np-matrix__group">
              <div className="np-matrix__gtitle">
                {group.module && <MenuIcon name={moduleById(group.module)?.icon || group.module} />}
                {t(`notifyPrefs.groups.${group.key}`)}
              </div>
              {group.events.map((event) => (
                <div key={event.kind} className="np-matrix__row">
                  <div className="np-matrix__label">
                    <strong>
                      {t(`notifyPrefs.events.${key(event.kind)}.title`)}
                      {event.urgent && <em className="np-tag">{t('notifyPrefs.alwaysTag')}</em>}
                      {event.subscription && <em className="np-tag is-sub">{t('notifyPrefs.subTag')}</em>}
                    </strong>
                    <span>{t(`notifyPrefs.events.${key(event.kind)}.desc`)}</span>
                  </div>
                  {columns.map((channel) => {
                    const value = cell(event, channel);
                    const reachable = channel === 'inbox' || (data.reach[channel] && channels[channel] !== false);
                    if (value === null) return <span key={channel} className="np-cell is-na">·</span>;
                    return (
                      <span key={channel} className={`np-cell${reachable ? '' : ' is-dim'}`}>
                        <Checkbox
                          checked={value}
                          disabled={event.urgent && channel === 'inbox'}
                          onChange={(change) => setCell(event, channel, change.target.checked)}
                          aria-label={`${t(`notifyPrefs.events.${key(event.kind)}.title`)} · ${t(`notifyPrefs.short.${channel}`)}`}
                        />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="np-muted np-matrix__note">{t('notifyPrefs.matrixNote')}</p>
      </section>

      <section className="np-card">
        <header className="np-card__head">
          <div>
            <h3>
              {t('notifyPrefs.subsTitle')}
              <Hint id="notifications.subscriptions" />
            </h3>
            <p>{t('notifyPrefs.subsLead')}</p>
          </div>
        </header>
        {subs.length ? (
          <ul className="np-subs">
            {subs.map((item) => (
              <li key={`${item.type}:${item.id}`}>
                <i style={{ background: item.color || 'var(--da-primary)' }} />
                <Link to={item.link}>{item.name}</Link>
                <em>{t(`notifyPrefs.subType.${key(item.type)}`)}</em>
                <Button
                  size="small"
                  type="text"
                  onClick={async () => {
                    await api.put('/account/notifications/subscriptions', { type: item.type, id: item.id, on: false });
                    setSubs((prev) => prev.filter((other) => other !== item));
                  }}
                >
                  {t('notifyPrefs.unsubscribe')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="np-empty">{t('notifyPrefs.noSubs')}</p>
        )}
      </section>

      <section className="np-card">
        <header className="np-card__head">
          <div>
            <h3>{t('notifyPrefs.historyTitle')}</h3>
            <p>{t('notifyPrefs.historyLead')}</p>
          </div>
        </header>
        {history.length ? (
          <ul className="np-history">
            {history.map((item) => (
              <li key={item.id}>
                <span className="np-history__title">{item.title}</span>
                <span className="np-muted">{formatRelative(item.createdAt, locale)}</span>
                <DeliveryIcons delivery={item.delivery} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="np-empty">{t('notifyPrefs.noHistory')}</p>
        )}
      </section>
    </div>
  );
}
