import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/en-gb';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { dictionaries, translate } from '../i18n/translations';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { updateAccountProfile } from '../services/api';

const LocaleContext = createContext(null);
const DEVICE_KEY = 'da_locale';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode — preference lives for this tab only */
  }
}

const known = (value) => (value && dictionaries[value] ? value : null);
const browserLocale = () => (navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');

/**
 * Interface language, in this order:
 *  1. the language chosen in the person's profile (follows them to every device);
 *  2. the language chosen on this device (guests, or before the profile is set);
 *  3. the portal default from Settings → General;
 *  4. the browser's language.
 */
export function LocaleProvider({ children }) {
  const { user, setUser } = useAuth();
  const { settings } = useSettings();
  const [device, setDevice] = useState(() => known(safeGet(DEVICE_KEY)));

  const portalDefault = known(settings?.defaultLocale);
  const locale = known(user?.locale) || device || portalDefault || browserLocale();

  // Date pickers, calendars and relative dates follow the UI language (ru: week starts on Monday).
  dayjs.locale(locale === 'ru' ? 'ru' : 'en-gb');

  /** `next` = 'ru' | 'en', or null to follow the portal default again. */
  const setLocale = useCallback(
    (next) => {
      const value = known(next);
      safeSet(DEVICE_KEY, value);
      setDevice(value);
      if (user && user.locale !== value) {
        setUser({ ...user, locale: value });
        updateAccountProfile({ locale: value || 'auto' })
          .then((res) => setUser(res.data.user))
          .catch(() => {});
      }
    },
    [user, setUser]
  );

  const value = useMemo(() => {
    const dict = dictionaries[locale] || dictionaries.en;
    return {
      locale,
      dict,
      portalDefault,
      source: known(user?.locale) ? 'profile' : device ? 'device' : portalDefault ? 'portal' : 'browser',
      t: (path, params) => translate(locale, path, params) ?? path,
      setLocale,
    };
  }, [locale, portalDefault, user?.locale, device, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
