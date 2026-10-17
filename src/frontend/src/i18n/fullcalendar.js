import { useEffect, useMemo, useState } from 'react';
import { languageInfo } from './languages';
import { translate } from './translations';

/*
 * FullCalendar locale of a portal language. FullCalendar's own locale files
 * (loaded on demand) give the week rules; every text — "all-day", "+2 more",
 * the screen-reader hints "Go to 12 October 2026", "Previous month" … — comes
 * from the portal dictionaries (locales/<lang>/fullcalendar.js), so languages
 * FullCalendar lacks or only half covers (Kyrgyz; the hints in ru/tr/zh) read
 * fully translated. Month and day names come from Intl (i18n/intl-fallback.js
 * fills in Kyrgyz where the browser has no data).
 */
const LOADERS = {
  'en-gb': () => import('@fullcalendar/core/locales/en-gb'),
  ru: () => import('@fullcalendar/core/locales/ru'),
  tr: () => import('@fullcalendar/core/locales/tr'),
  'zh-cn': () => import('@fullcalendar/core/locales/zh-cn'),
};

// Week rules of languages FullCalendar has no file for.
const WEEK = { ky: { dow: 1, doy: 7 } };

const cache = new Map();

/** The texts of a FullCalendar locale, from the dictionary of `code`. */
export function fullCalendarTexts(code) {
  const tx = (key, params) => translate(code, `fullcalendar.${key}`, params) ?? undefined;
  const hint = (key, name) => tx(key, { [name]: '$0' });
  return {
    buttonText: {
      prev: tx('buttons.prev'),
      next: tx('buttons.next'),
      today: tx('buttons.today'),
      year: tx('buttons.year'),
      month: tx('buttons.month'),
      week: tx('buttons.week'),
      day: tx('buttons.day'),
      list: tx('buttons.list'),
    },
    weekText: tx('weekShort'),
    weekTextLong: tx('weekLong'),
    allDayText: tx('allDay'),
    moreLinkText: (count) => tx('moreLink', { count }),
    moreLinkHint: (count) => tx('moreLinkHint', { count }),
    noEventsText: tx('noEvents'),
    buttonHints: { prev: hint('hints.prev', 'unit'), next: hint('hints.next', 'unit'), today: hint('hints.today', 'unit') },
    viewHint: hint('hints.view', 'view'),
    navLinkHint: hint('hints.navLink', 'date'),
    closeHint: tx('hints.close'),
    timeHint: tx('hints.time'),
    eventHint: tx('hints.event'),
  };
}

/** `{ locales, locale }` props for <FullCalendar> in the interface language. */
export function useFullCalendarLocale(code) {
  const name = languageInfo(code).dayjs; // FullCalendar uses the same codes as dayjs
  const [loaded, setLoaded] = useState(() => cache.get(name) || null);
  useEffect(() => {
    let alive = true;
    if (!LOADERS[name]) {
      setLoaded(null);
      return undefined;
    }
    if (cache.has(name)) setLoaded(cache.get(name));
    else
      LOADERS[name]()
        .then((mod) => {
          cache.set(name, mod.default);
          if (alive) setLoaded(mod.default);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name]);
  return useMemo(() => {
    const base = loaded && loaded.code === name ? loaded : { code: name, week: WEEK[code] || { dow: 1, doy: 4 } };
    const locale = { ...base, ...fullCalendarTexts(code), code: name };
    return { locales: [locale], locale: name };
  }, [loaded, name, code]);
}
