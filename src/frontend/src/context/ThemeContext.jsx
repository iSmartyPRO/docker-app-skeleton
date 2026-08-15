import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { theme as antdTheme } from 'antd';
import { buildAntdTheme, resolveColors } from '../theme/templates';
import { fontStack, headingStack, resolveTypography } from '../theme/typography';
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

export function ThemeProvider({ children }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const savedAppearance = settings?.appearance || {};
  const [preview, setPreview] = useState(null);
  const [manual, setManual] = useState(() => localStorage.getItem('da_theme'));

  const appearance = useMemo(
    () => mergeAppearance(savedAppearance, preview),
    [savedAppearance, preview]
  );

  const mode = useMemo(() => {
    const preferred = manual || user?.theme || appearance.defaultTheme || 'light';
    if (preferred === 'system') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return preferred === 'dark' ? 'dark' : 'light';
  }, [manual, user?.theme, appearance.defaultTheme]);

  const antdConfig = useMemo(() => {
    const built = buildAntdTheme(appearance, mode);
    return {
      ...built,
      algorithm:
        mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    };
  }, [appearance, mode]);

  useEffect(() => {
    const colors = resolveColors(appearance, mode);
    const typography = resolveTypography(appearance);
    const root = document.documentElement;
    root.style.setProperty('--da-primary', colors.colorPrimary);
    root.style.setProperty('--da-bg', colors.colorBgContainer);
    root.style.setProperty('--da-border', colors.colorBorder);
    root.style.setProperty('--da-text', colors.colorTextBase);
    root.style.setProperty('--da-font', fontStack(typography));
    root.style.setProperty('--da-font-heading', headingStack(typography));
    root.style.setProperty('--da-font-size', `${typography.baseFontSize}px`);
    document.body.style.background = colors.colorBgLayout;
    document.body.style.color = colors.colorTextBase;
    document.body.style.fontFamily = fontStack(typography);
  }, [appearance, mode]);

  const clearPreview = useCallback(() => setPreview(null), []);

  const value = useMemo(
    () => ({
      mode,
      setMode: (next) => {
        localStorage.setItem('da_theme', next);
        setManual(next);
      },
      antdConfig,
      appearance,
      savedAppearance,
      isPreviewing: Boolean(preview),
      setPreview,
      clearPreview,
    }),
    [mode, antdConfig, appearance, savedAppearance, preview, clearPreview]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}
