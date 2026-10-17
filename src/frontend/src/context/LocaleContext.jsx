import dayjs from 'dayjs';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABLE_LOCALES, getDictionary, loadDictionary, setActiveLocale, translate } from '../i18n/translations';
import { REFERENCE_LOCALE, languageInfo, normalizeLocale, resolveLocale, sanitizeLocalization } from '../i18n/languages';
import { loadVendorLocales } from '../i18n/vendor';
import { tuneDayjsLocales } from '../lib/datetime';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { updateAccountProfile } from '../services/api';

const LocaleContext = createContext(null);
const DEVICE_KEY = 'da_locale';
const WAIT_MS = 1500;
// A language that failed to download (network blip) is tried once more by itself after this long.
const RETRY_MS = 5000;

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

const browserLanguages = () => {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
};

/** Applies a downloaded language to dayjs and the document. */
function activate(code) {
  const info = languageInfo(code);
  setActiveLocale(code);
  tuneDayjsLocales();
  if (dayjs.Ls[info.dayjs]) dayjs.locale(info.dayjs);
  document.documentElement.lang = info.tag;
  document.documentElement.dir = info.dir;
}

/**
 * Interface language (i18n/languages.js → resolveLocale), in this order:
 *  1. the language chosen in the person's profile (follows them to every device);
 *  2. the language chosen on this device (guests, or before the profile is set);
 *  3. the portal default from Settings → Languages: a language, or the first
 *     of the browser's languages that is enabled, else the fallback language.
 * Only languages the superadministrator enabled count: a saved choice of a
 * disabled language falls through to the next step.
 *
 * Each language is a separate chunk. The interface waits for the first one;
 * on a switch the previous language stays on screen until the new one is in.
 * When the wanted language cannot be downloaded, English is shown and the
 * download is tried once more after RETRY_MS; choosing a language again
 * (setLocale, even the same one) tries again at any time.
 */
export function LocaleProvider({ children }) {
  const { user, setUser, ready: authReady } = useAuth();
  const { settings, ready: settingsReady } = useSettings();
  const [device, setDevice] = useState(() => normalizeLocale(safeGet(DEVICE_KEY)));
  // Wait for the portal settings and the session before choosing, so the first
  // download is the right language — but never longer than WAIT_MS (an outage
  // page still needs texts).
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const known = (settingsReady && authReady) || waited;

  const localization = useMemo(
    () => sanitizeLocalization(settings?.localization, settings?.defaultLocale),
    [settings?.localization, settings?.defaultLocale]
  );
  const resolved = resolveLocale({ profile: user?.locale, device, localization, browser: browserLanguages() });
  const wanted = AVAILABLE_LOCALES.includes(resolved.locale) ? resolved.locale : REFERENCE_LOCALE;

  // What is on screen: a language whose dictionary (and dayjs/antd data) is downloaded.
  const [shown, setShown] = useState(() => ({ locale: null, dict: null, antd: undefined }));
  // Bumped to download the wanted language again: by setLocale, and once automatically after a failure.
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef(null);

  useEffect(() => {
    if (!known) return undefined;
    let alive = true;
    let retry = null;
    const load = (code) => Promise.all([loadDictionary(code), loadVendorLocales(code).catch(() => undefined)]);
    load(wanted)
      .catch(() => (wanted === REFERENCE_LOCALE ? Promise.reject(new Error('i18n')) : load(REFERENCE_LOCALE).then((pair) => ({ fallback: true, pair }))))
      .then((result) => {
        if (!alive) return;
        const [dict, antd] = result.fallback ? result.pair : result;
        const code = result.fallback ? REFERENCE_LOCALE : wanted;
        activate(code);
        setShown({ locale: code, dict, antd });
        if (!result.fallback) autoRetried.current = null;
        else if (autoRetried.current !== wanted) {
          // English is on screen instead of the wanted language: one more try by itself.
          autoRetried.current = wanted;
          retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
        }
      })
      .catch(() => {
        // Not even English could be downloaded (offline right after a deploy):
        // RootErrorBoundary offers a reload.
        if (alive) setShown((prev) => (prev.dict ? prev : { ...prev, failed: true }));
      });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [wanted, known, attempt]);

  /** `next` = a language code, or null to follow the portal default again. */
  const setLocale = useCallback(
    (next) => {
      const code = normalizeLocale(next);
      const value = code && localization.enabled.includes(code) ? code : null;
      safeSet(DEVICE_KEY, value);
      setDevice(value);
      // Same language again after a failed download: try it again.
      setAttempt((n) => n + 1);
      if (user && user.locale !== value) {
        setUser({ ...user, locale: value });
        updateAccountProfile({ locale: value || 'auto' })
          .then((res) => setUser(res.data.user))
          .catch(() => {});
      }
    },
    [user, setUser, localization]
  );

  const portalDefault = resolveLocale({ localization, browser: browserLanguages() }).locale;
  const locale = shown.locale;

  const value = useMemo(() => {
    if (!locale) return null;
    const info = languageInfo(locale);
    return {
      locale,
      /** BCP 47 tag for Intl: 'ru-RU'. */
      tag: info.tag,
      dir: info.dir,
      dict: shown.dict || getDictionary(locale),
      /** antd ConfigProvider locale of the language. */
      antdLocale: shown.antd,
      /** Enabled languages in the configured order: [{ code, name, tag, … }]. */
      languages: localization.enabled.map((code) => languageInfo(code)),
      localization,
      portalDefault,
      source: resolved.source,
      t: (path, params) => translate(locale, path, params) ?? path,
      setLocale,
    };
  }, [locale, shown, localization, portalDefault, resolved.source, setLocale]);

  if (shown.failed) throw new Error('Interface texts could not be loaded');
  // Nothing to show until the first language arrives (a few hundred ms at most).
  if (!value) return null;
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
