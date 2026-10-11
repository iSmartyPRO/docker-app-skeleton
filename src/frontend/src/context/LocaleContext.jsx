import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/en-gb';
import { createContext, useContext, useMemo, useState } from 'react';
import { dictionaries, translate } from '../i18n/translations';

const LocaleContext = createContext(null);

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — preference lives for this tab only */
  }
}

export function LocaleProvider({ children, userLocale }) {
  const [locale, setLocaleState] = useState(() => {
    const saved = safeGet('da_locale');
    if (saved && dictionaries[saved]) return saved;
    if (userLocale) return userLocale;
    return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  });

  // Date pickers, calendars and relative dates follow the UI language (ru: week starts on Monday).
  dayjs.locale(locale === 'ru' ? 'ru' : 'en-gb');

  const value = useMemo(() => {
    const dict = dictionaries[locale] || dictionaries.en;
    return {
      locale,
      dict,
      t: (path, params) => translate(locale, path, params) ?? path,
      setLocale: (next) => {
        safeSet('da_locale', next);
        setLocaleState(next);
      },
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
