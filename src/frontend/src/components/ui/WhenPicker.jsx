import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { DatePicker, TimePicker } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { getNotificationPrefs } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import QuickConnect from './QuickConnect';

/*
 * Choosing the moment of a reminder: quick presets, a date and a time apart
 * (so changing the time never silently keeps "tomorrow"), and a live line
 * "fires on 12 Oct, 15:00 — in 2 h 15 min" or a warning when it is in the past.
 */

const round5 = (date) => date.minute(Math.ceil(date.minute() / 5) * 5).second(0).millisecond(0);

/** Default moment: in an hour, on a 5-minute mark. */
export const defaultWhen = () => round5(dayjs().add(1, 'hour'));

function presets(now) {
  const list = [
    ['m15', round5(now.add(15, 'minute'))],
    ['h1', round5(now.add(1, 'hour'))],
    ['h3', round5(now.add(3, 'hour'))],
  ];
  const evening = now.hour(18).minute(0).second(0).millisecond(0);
  if (evening.isAfter(now.add(10, 'minute'))) list.push(['evening', evening]);
  list.push(['tomorrow', now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0)]);
  const monday = now.day() === 1 ? now.add(7, 'day') : now.day(8);
  list.push(['monday', monday.hour(9).minute(0).second(0).millisecond(0)]);
  return list;
}

export function relativeIn(date, t) {
  const minutes = Math.round(date.diff(dayjs(), 'minute', true));
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
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const now = dayjs();
  const current = value ? dayjs(value) : null;
  const past = current && current.isBefore(now);
  const tag = locale === 'ru' ? 'ru-RU' : 'en-GB';
  const setDate = (date) => date && onChange((current || defaultWhen()).year(date.year()).month(date.month()).date(date.date()));
  const setTime = (time) => time && onChange((current || defaultWhen()).hour(time.hour()).minute(time.minute()).second(0));
  return (
    <div className="when">
      <div className="when__presets">
        {presets(now).map(([key, date]) => (
          <button key={key} type="button" className={current && current.isSame(date, 'minute') ? 'is-on' : ''} onClick={() => onChange(date)}>
            {t(`when.presets.${key}`)}
            <em>{key.startsWith('m') || key.startsWith('h') ? date.format('HH:mm') : date.toDate().toLocaleDateString(tag, { weekday: 'short', day: 'numeric' })}</em>
          </button>
        ))}
      </div>
      <div className="when__exact">
        <DatePicker value={current} onChange={setDate} allowClear={false} format={locale === 'ru' ? 'D MMMM YYYY, dd' : 'ddd, D MMM YYYY'} disabledDate={(date) => date.isBefore(now, 'day')} />
        <TimePicker value={current} onChange={setTime} allowClear={false} format="HH:mm" minuteStep={5} needConfirm={false} />
      </div>
      {current && (
        <div className={`when__summary${past ? ' is-past' : ''}`}>
          {past
            ? t('when.past')
            : t('when.fires', {
                date: current.toDate().toLocaleString(tag, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                rel: relativeIn(current, t),
              })}
        </div>
      )}
    </div>
  );
}

let reachPromise = null;
/** Which channels can reach the signed-in person right now (cached per page). */
export function useReach() {
  const [reach, setReach] = useState(null);
  useEffect(() => {
    if (!reachPromise) reachPromise = getNotificationPrefs().then((res) => res.data).catch(() => null);
    let alive = true;
    reachPromise.then((data) => alive && setReach(data));
    return () => {
      alive = false;
    };
  }, []);
  return reach;
}
export const forgetReach = () => {
  reachPromise = null;
};

/**
 * Under a channel choice: what will not arrive and how to fix it right here.
 * Only channels the portal actually offers are suggested.
 */
export function ChannelWarnings({ channels }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const data = useReach();
  const [, refresh] = useState(0);
  if (!data) return null;
  const reach = data.reach || {};
  const available = data.configured || {};
  const prefs = data.prefs?.channels || data.prefs || {};
  const contacts = data.contacts || {};
  const reload = () => {
    forgetReach();
    refresh((n) => n + 1);
  };
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
