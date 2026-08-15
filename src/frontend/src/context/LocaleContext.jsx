import { createContext, useContext, useMemo, useState } from 'react';
import { dictionaries, translate } from '../i18n/translations';

const LocaleContext = createContext(null);

export function LocaleProvider({ children, userLocale }) {
  const [locale, setLocaleState] = useState(
    () => localStorage.getItem('da_locale') || userLocale || 'en'
  );

  const value = useMemo(() => {
    const dict = dictionaries[locale] || dictionaries.en;
    return {
      locale,
      dict,
      t: (path) => translate(locale, path) ?? path,
      setLocale: (next) => {
        localStorage.setItem('da_locale', next);
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
