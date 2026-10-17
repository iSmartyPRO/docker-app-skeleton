import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { DatePicker, TimePicker } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { fromPicker, pickerFormat, toPicker, useRegional } from '../../lib/datetime';
import { formatDateTime } from '../../lib/format';
import { getNotificationPrefs } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import QuickConnect from './QuickConnect';
import { dayjsLocale } from '../../i18n/vendor';

/*
 * Choosing the moment of a reminder: quick presets, a date and a time apart
 * (so changing the time never silently keeps "tomorrow"), and a live line
 * "fires on 12 Oct, 15:00 — in 2 h 15 min" or a warning when it is in the past.
 *
 * Presets ("this evening 18:00", "tomorrow 9:00", "Monday 9:00") are counted in
 * the person's time zone (lib/datetime.js). `value` may be an ISO instant, a
 * Date or a dayjs; onChange gets a dayjs instant (call .toISOString()).
 * Internally everything is a picker value — the person's wall-clock time — and
 * is converted with toPicker/fromPicker.
 */

const round5 = (date) => date.minute(Math.ceil(date.minute() / 5) * 5).second(0).millisecond(0);

/** Picker value (wall-clock in the person's zone) → dayjs instant. */
const toInstant = (wall) => dayjs(fromPicker(wall));
const wallNow = () => toPicker(new Date());

/** Default moment: in an hour, on a 5-minute mark. */
export const defaultWhen = () => toInstant(round5(wallNow().add(1, 'hour')));

function presets(now) {
  const list = [
    ['m15', round5(now.add(15, 'minute'))],
    ['h1', round5(now.add(1, 'hour'))],
    ['h3', round5(now.add(3, 'hour'))],
  ];
  const evening = now.hour(18).minute(0).second(0).millisecond(0);
  if (evening.isAfter(now.add(10, 'minute'))) list.push(['evening', evening]);
  list.push(['tomorrow', now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0)]);
  const monday = now.add((8 - now.day()) % 7 || 7, 'day');
  list.push(['monday', monday.hour(9).minute(0).second(0).millisecond(0)]);
  return list;
}

export function relativeIn(date, t) {
  const minutes = Math.round(dayjs(date).diff(dayjs(), 'minute', true));
  if (minutes < 1) return t('when.now');
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(t('when.d', { n: days }));
  if (hours) parts.push(t('when.h', { n: hours }));
  if (mins && !days) parts.push(t('when.m', { n: mins }));
  return t('when.in', { time: parts.join(' ') });
}

export default function WhenPicker({ value, onChange }) {
  const { t, locale } = useLocale();
  const regional = useRegional();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const now = wallNow();
  const current = value ? toPicker(dayjs(value).toISOString(), regional) : null;
  const past = current && current.isBefore(now);
  const timeFormat = pickerFormat(regional).time;
  const emit = (wall) => onChange(toInstant(wall));
  const base = () => current || toPicker(defaultWhen().toISOString(), regional);
  const setDate = (date) => date && emit(base().year(date.year()).month(date.month()).date(date.date()));
  const setTime = (time) => time && emit(base().hour(time.hour()).minute(time.minute()).second(0));
  return (
    <div className="when">
      <div className="when__presets">
        {presets(now).map(([key, date]) => (
          <button key={key} type="button" className={current && current.isSame(date, 'minute') ? 'is-on' : ''} onClick={() => emit(date)}>
            {t(`when.presets.${key}`)}
            {/* `date` is the person's wall-clock time already: format it as is. */}
            <em>{key.startsWith('m') || key.startsWith('h') ? date.format(timeFormat) : date.locale(dayjsLocale(locale)).format(t('format.picker.weekdayDay'))}</em>
          </button>
        ))}
      </div>
      <div className="when__exact">
        <DatePicker value={current} onChange={setDate} allowClear={false} format={t('format.picker.longDate')} disabledDate={(date) => date.isBefore(now, 'day')} />
        <TimePicker value={current} onChange={setTime} allowClear={false} format={timeFormat} use12Hours={regional.timeFormat === '12'} minuteStep={5} needConfirm={false} />
      </div>
      {current && (
        <div className={`when__summary${past ? ' is-past' : ''}`}>
          {past
            ? t('when.past')
            : t('when.fires', {
                date: formatDateTime(fromPicker(current, regional), locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                rel: relativeIn(toInstant(current), t),
              })}
        </div>
      )}
    </div>
  );
}

// Cached per page and per signed-in person; forgetReach() makes every mounted
// useReach() load again (after a contact is connected, a setting changed…).
let reachCache = { userId: undefined, promise: null };
const reachListeners = new Set();

/** Which channels can reach the signed-in person right now. */
export function useReach() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [reach, setReach] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    reachListeners.add(bump);
    return () => reachListeners.delete(bump);
  }, []);
  useEffect(() => {
    if (!userId) {
      setReach(null);
      return undefined;
    }
    if (reachCache.userId !== userId || !reachCache.promise) {
      reachCache = { userId, promise: getNotificationPrefs().then((res) => res.data).catch(() => null) };
    }
    let alive = true;
    reachCache.promise.then((data) => alive && setReach(data));
    return () => {
      alive = false;
    };
  }, [userId, version]);
  return reach;
}
export const forgetReach = () => {
  reachCache = { userId: undefined, promise: null };
  reachListeners.forEach((bump) => bump());
};

/**
 * Under a channel choice: what will not arrive and how to fix it right here.
 * Only channels the portal actually offers are suggested.
 */
export function ChannelWarnings({ channels }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const data = useReach();
  if (!data) return null;
  const reach = data.reach || {};
  const available = data.configured || {};
  const prefs = data.prefs?.channels || data.prefs || {};
  const contacts = data.contacts || {};
  const reload = forgetReach;
  const blocks = [];
  if (channels.includes('app') && !reach.push) {
    blocks.push(
      <li key="push">
        ⚠ {t('when.warn.push')} <Link to="/account/notifications">{t('when.warn.fix')}</Link>
      </li>
    );
  }
  if (channels.includes('email') && !reach.email) {
    blocks.push(
      <li key="email">
        {available.email ? <QuickConnect channel="email" initial={contacts.email} onConnected={reload} compact /> : `⚠ ${t('when.warn.emailOff')}`}
      </li>
    );
  }
  if (channels.includes('messenger')) {
    const messengers = ['whatsapp', 'telegram', 'mattermost'].filter((channel) => available[channel]);
    const reached = messengers.filter((channel) => reach[channel]);
    if (!messengers.length) {
      blocks.push(
        <li key="none">
          ⚠ {t('when.warn.noMessengers')}
          {can?.('settings.integrations') && (
            <>
              {' '}
              <Link to="/admin/settings/notifications">{t('when.warn.setUp')}</Link>
            </>
          )}
        </li>
      );
    } else if (!reached.length) {
      blocks.push(
        <li key="connect" className="when__connect">
          <span>⚠ {t('when.warn.connectOne', { list: messengers.map((channel) => t(`notifications.channel_${channel}`)).join(', ') })}</span>
          {messengers.map((channel) => (
            <QuickConnect key={channel} channel={channel} initial={channel === 'whatsapp' ? contacts.phone : contacts.mattermost} onConnected={reload} compact />
          ))}
        </li>
      );
    } else if (reached.every((channel) => prefs[channel] === false)) {
      blocks.push(
        <li key="off">
          ⚠ {t('when.warn.messengerOff')} <Link to="/account/notifications">{t('when.warn.fix')}</Link>
        </li>
      );
    }
  }
  if (!blocks.length) return null;
  return <ul className="when__warn">{blocks}</ul>;
}
