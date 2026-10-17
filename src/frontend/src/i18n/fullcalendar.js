import { useEffect, useState } from 'react';
import { languageInfo } from './languages';

/*
 * FullCalendar locale of a portal language, loaded on demand. FullCalendar
 * formats dates through Intl, so a language without a locale file (Kyrgyz)
 * still gets its month and day names; only a few button texts stay English.
 */
const LOADERS = {
  ru: () => import('@fullcalendar/core/locales/ru'),
  tr: () => import('@fullcalendar/core/locales/tr'),
  'zh-cn': () => import('@fullcalendar/core/locales/zh-cn'),
};

const cache = new Map();

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
  return { locales: loaded ? [loaded] : [], locale: loaded ? loaded.code : name };
}
