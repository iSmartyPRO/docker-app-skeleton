import dayjs from 'dayjs';

/** "20261231T235959Z" → dayjs (no customParseFormat plugin needed). */
const ruleDate = (value) => dayjs(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const JS_TO_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function weekdayOf(date) {
  return JS_TO_RRULE[dayjs(date).day()];
}

export function parseRule(rule) {
  const parts = {};
  for (const pair of String(rule || '').split(';')) {
    const [key, value] = pair.split('=');
    if (key && value) parts[key] = value;
  }
  return parts;
}

/** Preset id for a rule, so the picker can show it ("weekly", "weekdays"…). */
export function presetOf(rule, start) {
  if (!rule) return 'none';
  const p = parseRule(rule);
  const plain = !p.INTERVAL && !p.COUNT && !p.UNTIL;
  if (plain && p.FREQ === 'DAILY' && !p.BYDAY) return 'daily';
  if (plain && p.FREQ === 'WEEKLY' && p.BYDAY === 'MO,TU,WE,TH,FR') return 'weekdays';
  if (plain && p.FREQ === 'WEEKLY' && (!p.BYDAY || p.BYDAY === weekdayOf(start))) return 'weekly';
  if (plain && p.FREQ === 'MONTHLY' && (!p.BYMONTHDAY || Number(p.BYMONTHDAY) === dayjs(start).date())) return 'monthly';
  if (plain && p.FREQ === 'YEARLY') return 'yearly';
  return 'custom';
}

export function ruleFromPreset(preset, start) {
  switch (preset) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${weekdayOf(start)}`;
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${dayjs(start).date()}`;
    case 'yearly':
      return 'FREQ=YEARLY';
    default:
      return null;
  }
}

/** Custom builder: { freq, interval, days[], end: 'never'|'until'|'count', until, count }. */
export function ruleFromCustom({ freq = 'WEEKLY', interval = 1, days = [], end = 'never', until, count }, start) {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === 'WEEKLY') parts.push(`BYDAY=${(days.length ? days : [weekdayOf(start)]).join(',')}`);
  if (freq === 'MONTHLY') parts.push(`BYMONTHDAY=${dayjs(start).date()}`);
  if (end === 'count' && count > 0) parts.push(`COUNT=${count}`);
  if (end === 'until' && until) parts.push(`UNTIL=${dayjs(until).format('YYYYMMDD')}T235959Z`);
  return parts.join(';');
}

export function customFromRule(rule, start) {
  const p = parseRule(rule);
  return {
    freq: p.FREQ || 'WEEKLY',
    interval: Number(p.INTERVAL) || 1,
    days: p.BYDAY ? p.BYDAY.split(',').map((day) => day.slice(-2)) : [weekdayOf(start)],
    end: p.COUNT ? 'count' : p.UNTIL ? 'until' : 'never',
    count: Number(p.COUNT) || 10,
    until: p.UNTIL ? ruleDate(p.UNTIL) : null,
  };
}

/** "Every 2 weeks on Mon, Wed, until 31 Dec" in the UI language. */
export function describeRule(rule, t, locale) {
  if (!rule) return '';
  const p = parseRule(rule);
  const interval = Number(p.INTERVAL) || 1;
  const unit = t(`calendar.repeat.unit_${p.FREQ}`, { count: interval });
  let text = interval > 1 ? t('calendar.repeat.everyN', { n: interval, unit }) : t(`calendar.repeat.every_${p.FREQ}`);
  if (p.BYDAY) {
    const names = p.BYDAY.split(',').map((day) => {
      const index = WEEKDAYS.indexOf(day.slice(-2));
      const date = dayjs('2024-01-01').add(index, 'day');
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' }).format(date.toDate());
    });
    text += p.BYDAY === 'MO,TU,WE,TH,FR' ? ` (${t('calendar.repeat.weekdaysShort')})` : `: ${names.join(', ')}`;
  }
  if (p.COUNT) text += `, ${t('calendar.repeat.times', { n: p.COUNT })}`;
  if (p.UNTIL) {
    const until = ruleDate(p.UNTIL);
    text += `, ${t('calendar.repeat.until', { date: new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(until.toDate()) })}`;
  }
  return text;
}
