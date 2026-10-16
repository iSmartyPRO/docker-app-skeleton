import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { theme as antdTheme } from 'antd';
import { buildAntdTheme, resolveColors } from '../theme/templates';
import { fontStack, headingStack, resolveTypography } from '../theme/typography';
import { cleanCustom, pickTheme, themePolicy, themeTokens, THEMES } from '../theme/themes';
import Backdrop from '../theme/Backdrop';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';

const ThemeContext = createContext(null);

function mergeAppearance(saved, preview) {
  if (!preview) return saved;
  return {
    ...saved,
    ...preview,
    customColors:
      preview.customColors !== undefined ? preview.customColors : saved.customColors,
    typography: {
      ...(saved.typography || {}),
      ...(preview.typography || {}),
    },
    icons: preview.icons
      ? {
          style: preview.icons.style || saved.icons?.style || 'colored',
          menu: {
            ...(saved.icons?.menu || {}),
            ...(preview.icons.menu || {}),
          },
        }
      : saved.icons,
  };
}

// antd tokens taken from the resolved theme (theme/themes.js → themeTokens).
const ANTD_COLOR_KEYS = [
  'colorPrimary',
  'colorInfo',
  'colorSuccess',
  'colorWarning',
  'colorError',
  'colorBgBase',
  'colorBgContainer',
  'colorBgLayout',
  'colorTextBase',
  'colorBorder',
  'colorLink',
  'colorTextSecondary',
  'colorTextTertiary',
];

/**
 * Theme of the portal for this person: the administrator's brand palette and
 * rules (Settings → Theme), the person's theme (Account → Appearance; a device
 * may override it with the header switch) and live previews of both.
 *
 *   mode      'light' | 'dark' — the colour scheme (<html data-theme>)
 *   themeId   the theme worn (<html data-skin>), see theme/themes.js
 *   tokens    resolved colours of it
 */
export function ThemeProvider({ children }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const savedAppearance = settings?.appearance || {};
  const [preview, setPreview] = useState(null);
  // Account → Appearance before saving: { theme, custom, motion }.
  const [personalPreview, setPersonalPreview] = useState(null);
  const [manual, setManual] = useState(() => {
    try {
      return localStorage.getItem('da_theme');
    } catch {
      return null;
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const appearance = useMemo(
    () => mergeAppearance(savedAppearance, preview),
    [savedAppearance, preview]
  );

  const policy = useMemo(() => themePolicy(appearance), [appearance]);
  const ui = user?.ui || {};
  const custom = useMemo(() => cleanCustom(personalPreview?.custom ?? ui.custom), [personalPreview?.custom, ui.custom]);
  const motionPref = personalPreview?.motion ?? ui.motion ?? 'auto';

  const picked = useMemo(
    () =>
      pickTheme({
        manual: personalPreview?.theme || manual,
        userTheme: user?.theme,
        portalDefault: appearance.defaultTheme,
        policy,
        systemDark,
        hasCustom: Boolean(custom.image || custom.accent),
      }),
    [personalPreview?.theme, manual, user?.theme, appearance.defaultTheme, policy, systemDark, custom]
  );
  const themeId = picked.id;
  const mode = picked.theme.kind === 'custom' ? custom.scheme : picked.scheme;

  const tokens = useMemo(
    () => themeTokens(picked.theme, mode, (scheme) => resolveColors(appearance, scheme), custom),
    [picked.theme, mode, appearance, custom]
  );

  const antdConfig = useMemo(() => {
    const built = buildAntdTheme(appearance, mode);
    const colors = Object.fromEntries(ANTD_COLOR_KEYS.filter((key) => tokens[key]).map((key) => [key, tokens[key]]));
    if (picked.theme.colors?.colorBgElevated) colors.colorBgElevated = tokens.colorBgElevated;
    const contrast = themeId === 'contrast';
    return {
      ...built,
      token: {
        ...built.token,
        ...colors,
        colorTextDescription: tokens.colorTextSecondary,
        ...(contrast ? { colorBorderSecondary: '#5C5C5C', controlOutlineWidth: 3, lineWidthFocus: 3 } : {}),
      },
      components: {
        // Labels of primary buttons: the readable one of white / dark ink (AA).
        Button: { primaryColor: tokens.onPrimary },
      },
      algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    };
  }, [appearance, mode, tokens, themeId, picked.theme]);

  useEffect(() => {
    const typography = resolveTypography(appearance);
    const root = document.documentElement;
    root.style.setProperty('--da-primary', tokens.colorPrimary);
    root.style.setProperty('--da-on-primary', tokens.onPrimary);
    root.style.setProperty('--da-bg', tokens.colorBgContainer);
    root.style.setProperty('--da-elevated', tokens.colorBgElevated);
    root.style.setProperty('--da-border', tokens.colorBorder);
    root.style.setProperty('--da-text', tokens.colorTextBase);
    root.style.setProperty('--da-muted', tokens.colorTextSecondary);
    root.style.setProperty('--da-font', fontStack(typography));
    root.style.setProperty('--da-font-heading', headingStack(typography));
    root.style.setProperty('--da-font-size', `${typography.baseFontSize}px`);
    root.style.setProperty('--da-layout', tokens.colorBgLayout);
    root.style.setProperty('--da-success', tokens.colorSuccess);
    root.style.setProperty('--da-warning', tokens.colorWarning);
    root.style.setProperty('--da-error', tokens.colorError);
    root.style.colorScheme = mode;
    root.style.setProperty('--da-logo-h', `${Number(appearance.logoHeight) || 32}px`);
    root.dataset.skin = themeId === 'system' ? mode : themeId;
    document.body.style.background = tokens.colorBgLayout;
    document.body.style.color = tokens.colorTextBase;
    document.body.style.fontFamily = fontStack(typography);
    // Installed app (PWA): the status bar wears the theme's ground.
    document.head.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.colorBgLayout);
  }, [appearance, mode, tokens, themeId]);

  const clearPreview = useCallback(() => setPreview(null), []);
  const clearPersonalPreview = useCallback(() => setPersonalPreview(null), []);

  const value = useMemo(
    () => ({
      mode,
      themeId,
      theme: picked.theme,
      tokens,
      themes: THEMES,
      policy,
      custom,
      motion: motionPref,
      preference: manual || user?.theme || appearance.defaultTheme || 'light',
      setMode: (next) => {
        try {
          localStorage.setItem('da_theme', next);
        } catch {
          /* ignore */
        }
        setManual(next);
      },
      antdConfig,
      appearance,
      savedAppearance,
      isPreviewing: Boolean(preview),
      setPreview,
      clearPreview,
      isPersonalPreview: Boolean(personalPreview),
      setPersonalPreview,
      clearPersonalPreview,
    }),
    [mode, themeId, picked.theme, tokens, policy, custom, motionPref, manual, user?.theme, antdConfig, appearance, savedAppearance, preview, clearPreview, personalPreview, clearPersonalPreview]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <Backdrop theme={picked.theme} mode={mode} custom={custom} motion={motionPref} policy={policy} signedIn={Boolean(user)} />
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}
