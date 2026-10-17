import { useSyncExternalStore } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import updateLocale from 'dayjs/plugin/updateLocale';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { normalizeLocale } from '../i18n/languages';
import { translate } from '../i18n/translations';
import { dayjsLocale } from '../i18n/vendor';

/*
 * Time zones and date/time formats in the browser — the counterpart of
 * backend/services/datetime.js (see docs/datetime.md).
 *
 * The portal sets a zone and formats (Settings → General → Region and time);
 * each person may override them (Account → Appearance → Date and time), with
 * "as on this device" for the zone. RegionalSync (App.jsx) computes what
 * applies and stores it here; everything that shows or edits a moment reads it:
 *
 *   fmtDate(v) / fmtTime(v) / fmtDateTime(v)   text in the person's zone and formats
 *   inZone(v)                                  a dayjs in the person's zone
 *   toPicker(v) / fromPicker(d)                antd pickers work in the device's
 *                                              zone; these move the wall-clock
 *                                              time across so a person in another
 *                                              zone picks *their* 9:00
 *   pickerFormat()                             format strings for antd pickers
 *
 * Instants travel as ISO strings (UTC). Date-only values ('YYYY-MM-DD', e.g. a
 * deal's close date) are calendar days and never shift with a zone.
 */

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(updateLocale);
dayjs.extend(customParseFormat);

export const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D MMM YYYY'];
export const TIME_FORMATS = ['24', '12'];
export const WEEK_STARTS = [1, 0, 6];

export const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export function isValidZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const DEFAULTS = { timeZone: deviceZone(), dateFormat: 'DD.MM.YYYY', timeFormat: '24', weekStart: 1, locale: 'en' };

let state = { ...DEFAULTS };
const listeners = new Set();

/** What applies: the person's overrides over the portal's settings. */
export function resolveRegional(portal = {}, own = {}, locale = 'en') {
  const base = {
    timeZone: isValidZone(portal.timeZone) ? portal.timeZone : DEFAULTS.timeZone,
    dateFormat: DATE_FORMATS.includes(portal.dateFormat) ? portal.dateFormat : DEFAULTS.dateFormat,
    timeFormat: TIME_FORMATS.includes(String(portal.timeFormat)) ? String(portal.timeFormat) : DEFAULTS.timeFormat,
    weekStart: WEEK_STARTS.includes(Number(portal.weekStart)) && portal.weekStart !== null ? Number(portal.weekStart) : DEFAULTS.weekStart,
  };
  const timeZone = own?.timeZone === 'device' ? deviceZone() : isValidZone(own?.timeZone) ? own.timeZone : base.timeZone;
  return {
    timeZone,
    dateFormat: DATE_FORMATS.includes(own?.dateFormat) ? own.dateFormat : base.dateFormat,
    timeFormat: TIME_FORMATS.includes(String(own?.timeFormat)) ? String(own.timeFormat) : base.timeFormat,
    weekStart: WEEK_STARTS.includes(Number(own?.weekStart)) && own?.weekStart !== null && own?.weekStart !== undefined ? Number(own.weekStart) : base.weekStart,
    locale: normalizeLocale(locale) || 'en',
  };
}

/** Week start and AM/PM for every downloaded dayjs locale (call again after loading one). */
export function tuneDayjsLocales() {
  for (const name of Object.keys(dayjs.Ls)) {
    try {
      // 12-hour time reads "2:30 PM" in every language, as Intl renders it (ru would say "дня").
      dayjs.updateLocale(name, { weekStart: state.weekStart, meridiem: (hour) => (hour < 12 ? 'AM' : 'PM') });
    } catch {
      /* locale not loaded yet */
    }
  }
}

export function setRegional(next) {
  const merged = { ...state, ...next };
  if (JSON.stringify(merged) === JSON.stringify(state)) return;
  state = merged;
  // antd pickers and dayjs weeks follow the week start.
  tuneDayjsLocales();
  dayjs.tz.setDefault(state.timeZone);
  listeners.forEach((listener) => listener());
}

export const getRegional = () => state;

export function useRegional() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

// ── Formatting ──────────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** dayjs format strings for the current settings (also used by antd pickers). */
export function pickerFormat(r = state) {
  const time = r.timeFormat === '12' ? 'h:mm A' : 'HH:mm';
  return { date: r.dateFormat, time, dateTime: `${r.dateFormat} ${time}`, month: r.dateFormat === 'YYYY-MM-DD' ? 'YYYY-MM' : 'MMMM YYYY' };
}

/** A moment as a dayjs in the person's zone (date-only values stay that calendar day). */
export function inZone(value, r = state) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) return dayjs.tz(value, r.timeZone);
  const d = dayjs(value);
  return d.isValid() ? d.tz(r.timeZone) : null;
}

export function fmtDate(value, r = state) {
  const d = inZone(value, r);
  return d ? d.locale(dayjsLocale(r.locale)).format(r.dateFormat) : '';
}

export function fmtTime(value, r = state) {
  const d = inZone(value, r);
  return d ? d.format(pickerFormat(r).time) : '';
}

export function fmtDateTime(value, r = state) {
  const d = inZone(value, r);
  return d ? `${d.locale(dayjsLocale(r.locale)).format(r.dateFormat)}, ${d.format(pickerFormat(r).time)}` : '';
}

/** "Today 14:30", "Tomorrow 09:00", "Yesterday 18:00", else the full date and time. */
export function fmtSmart(value, r = state) {
  const d = inZone(value, r);
  if (!d) return '';
  const today = dayjs().tz(r.timeZone).startOf('day');
  const diff = d.startOf('day').diff(today, 'day');
  const word = { 0: 'today', 1: 'tomorrow', '-1': 'yesterday' }[diff];
  if (word) return `${translate(r.locale, `format.${word}`) ?? word}, ${fmtTime(value, r)}`;
  return fmtDateTime(value, r);
}

/** Intl options with the person's zone and hour cycle (for custom layouts like "13 окт."). */
export function intlOptions(options = {}, r = state) {
  const withTime = 'hour' in options || 'timeStyle' in options;
  return { timeZone: r.timeZone, ...(withTime ? { hourCycle: r.timeFormat === '12' ? 'h12' : 'h23' } : {}), ...options };
}

// ── Pickers (device zone) ↔ the person's zone ───────────────────────────────

/** ISO instant → dayjs for an antd picker showing the person's wall-clock time. */
export function toPicker(value, r = state) {
  const z = inZone(value, r);
  return z ? dayjs(z.format('YYYY-MM-DDTHH:mm:ss')) : null;
}

/** dayjs from an antd picker (wall-clock in the person's zone) → ISO instant. */
export function fromPicker(d, r = state) {
  if (!d) return null;
  return dayjs.tz(d.format('YYYY-MM-DDTHH:mm:ss'), r.timeZone).toISOString();
}

/** Date-only helpers: 'YYYY-MM-DD' ↔ picker dayjs (no zone involved). */
export const dayToPicker = (value) => (value ? dayjs(value, 'YYYY-MM-DD') : null);
export const dayFromPicker = (d) => (d ? d.format('YYYY-MM-DD') : null);

/** "Now" and day boundaries in the person's zone (e.g. "today 18:00" presets). */
export const nowInZone = (r = state) => dayjs().tz(r.timeZone);
export const todayISO = (r = state) => dayjs().tz(r.timeZone).format('YYYY-MM-DD');

/** Russian names of common cities, so "Бишкек" or "Нью-Йорк" finds its zone. */
const CITY_RU = {
  'Asia/Bishkek': 'Бишкек Кыргызстан', 'Asia/Almaty': 'Алматы Казахстан', 'Asia/Qostanay': 'Костанай', 'Asia/Aqtobe': 'Актобе', 'Asia/Tashkent': 'Ташкент Узбекистан',
  'Asia/Dushanbe': 'Душанбе Таджикистан', 'Asia/Ashgabat': 'Ашхабад Туркменистан', 'Asia/Baku': 'Баку Азербайджан', 'Asia/Tbilisi': 'Тбилиси Грузия',
  'Asia/Yerevan': 'Ереван Армения', 'Europe/Moscow': 'Москва Россия Санкт-Петербург', 'Europe/Kaliningrad': 'Калининград', 'Europe/Samara': 'Самара',
  'Asia/Yekaterinburg': 'Екатеринбург', 'Asia/Omsk': 'Омск', 'Asia/Novosibirsk': 'Новосибирск', 'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск',
  'Asia/Yakutsk': 'Якутск', 'Asia/Vladivostok': 'Владивосток', 'Asia/Magadan': 'Магадан', 'Asia/Kamchatka': 'Камчатка', 'Europe/Minsk': 'Минск Беларусь',
  'Europe/Kyiv': 'Киев Украина', 'Europe/Kiev': 'Киев Украина', 'Europe/Istanbul': 'Стамбул Турция', 'Asia/Dubai': 'Дубай ОАЭ', 'Asia/Shanghai': 'Пекин Шанхай Китай',
  'Asia/Hong_Kong': 'Гонконг', 'Asia/Seoul': 'Сеул Корея', 'Asia/Tokyo': 'Токио Япония', 'Asia/Kolkata': 'Дели Индия', 'Asia/Singapore': 'Сингапур',
  'Asia/Bangkok': 'Бангкок Таиланд', 'Europe/London': 'Лондон Великобритания', 'Europe/Berlin': 'Берлин Германия', 'Europe/Paris': 'Париж Франция',
  'Europe/Rome': 'Рим Италия', 'Europe/Madrid': 'Мадрид Испания', 'Europe/Prague': 'Прага Чехия', 'Europe/Warsaw': 'Варшава Польша', 'Europe/Riga': 'Рига Латвия',
  'Europe/Vilnius': 'Вильнюс Литва', 'Europe/Tallinn': 'Таллин Эстония', 'Europe/Helsinki': 'Хельсинки Финляндия', 'America/New_York': 'Нью-Йорк США',
  'America/Chicago': 'Чикаго США', 'America/Denver': 'Денвер США', 'America/Los_Angeles': 'Лос-Анджелес США', 'America/Toronto': 'Торонто Канада',
  'Australia/Sydney': 'Сидней Австралия', UTC: 'UTC Гринвич всемирное',
};

/** A zone for people: "America/New York". */
export const zoneName = (zone) => String(zone || '').replace(/_/g, ' ');

/** Zone list for selects: [{ value, label: "Asia/Bishkek (UTC+6)", offset }], sorted by offset. */
export function zoneOptions() {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['UTC', 'Asia/Bishkek', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Moscow', 'Europe/London', 'America/New_York'];
  }
  const now = new Date();
  return zones
    .map((zone) => {
      const offset = dayjs(now).tz(zone).utcOffset();
      const sign = offset >= 0 ? '+' : '−';
      const abs = Math.abs(offset);
      const label = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
      return { value: zone, label: `${zoneName(zone)} (${label})`, offset, search: `${zone} ${zoneName(zone)} ${label} ${CITY_RU[zone] || ''}`.toLowerCase() };
    })
    .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value));
}

export function zoneLabel(zone, at = new Date()) {
  const offset = dayjs(at).tz(zone).utcOffset();
  const sign = offset >= 0 ? '+' : '−';
  const abs = Math.abs(offset);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
}
