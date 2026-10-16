import { useMemo } from 'react';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { resolveColors } from './templates';
import { THEMES, themeTokens } from './themes';
import './theme-ui.css';

const GROUPS = ['base', 'palette', 'dynamic', 'custom'];

/** Little picture of a theme: ground, side panel, card with text lines and an accent button. */
export function ThemeSwatch({ theme, colors, image }) {
  const live = theme.kind === 'dynamic' ? theme.backdrop?.colors || [] : [];
  const ground = image
    ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : live.length
      ? { background: `radial-gradient(60% 70% at 25% 30%, ${live[0]}${theme.scheme === 'dark' ? '88' : ''}, transparent), radial-gradient(60% 70% at 80% 70%, ${live[live.length - 1]}${theme.scheme === 'dark' ? '77' : ''}, transparent), ${colors.colorBgLayout}` }
      : { background: colors.colorBgLayout };
  if (theme.id === 'system') {
    return (
      <span className="ts-swatch is-split" aria-hidden="true">
        <span style={{ background: colors.light.colorBgLayout }}>
          <i style={{ background: colors.light.colorBgContainer, borderColor: colors.light.colorBorder }}>
            <b style={{ background: colors.light.colorPrimary }} />
          </i>
        </span>
        <span style={{ background: colors.dark.colorBgLayout }}>
          <i style={{ background: colors.dark.colorBgContainer, borderColor: colors.dark.colorBorder }}>
            <b style={{ background: colors.dark.colorPrimary }} />
          </i>
        </span>
      </span>
    );
  }
  return (
    <span className="ts-swatch" style={ground} aria-hidden="true">
      <span className="ts-swatch__side" style={{ background: colors.colorBgContainer, borderColor: colors.colorBorder }}>
        <i style={{ background: colors.colorPrimary }} />
        <i style={{ background: colors.colorBorder }} />
        <i style={{ background: colors.colorBorder }} />
      </span>
      <span className="ts-swatch__card" style={{ background: colors.colorBgContainer, borderColor: colors.colorBorder }}>
        <i style={{ background: colors.colorTextBase, width: '62%' }} />
        <i style={{ background: colors.colorTextSecondary, width: '84%' }} />
        <b style={{ background: colors.colorPrimary }} />
      </span>
    </span>
  );
}

/**
 * Theme cards as a radio group (Form.Item value / onChange). `themes`: ids to
 * offer; `custom`: { image url, accent, scheme } for the «Своя» card, or null to hide it.
 */
export default function ThemePicker({ value, onChange, themes, custom = null, compact = false }) {
  const { t, locale } = useLocale();
  const { appearance } = useThemeMode();
  const offered = useMemo(() => THEMES.filter((theme) => (theme.kind === 'custom' ? Boolean(custom) : themes.includes(theme.id))), [themes, custom]);

  const colorsOf = (theme) => {
    const brand = (scheme) => resolveColors(appearance, scheme);
    if (theme.id === 'system') {
      return { light: themeTokens(THEMES[0], 'light', brand), dark: themeTokens(THEMES[1], 'dark', brand) };
    }
    if (theme.kind === 'custom') return themeTokens(theme, custom?.scheme || 'light', brand, custom);
    return themeTokens(theme, theme.scheme, brand);
  };

  const onKey = (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const index = offered.findIndex((theme) => theme.id === value);
    const next = offered[(index + keys[event.key] + offered.length) % offered.length];
    onChange?.(next.id);
    event.currentTarget.querySelector(`[data-theme-id="${next.id}"]`)?.focus();
  };

  return (
    <div className={`ts-groups${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label={t('themes.title')} onKeyDown={onKey}>
      {GROUPS.map((group) => {
        const items = offered.filter((theme) => theme.kind === group);
        if (!items.length) return null;
        return (
          <div key={group} className="ts-group">
            {!compact && <div className="ts-group__title">{t(`themes.groups.${group}`)}</div>}
            <div className="ts-grid">
              {items.map((theme) => {
                const active = value === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active || (!value && theme.id === offered[0].id) ? 0 : -1}
                    data-theme-id={theme.id}
                    className={`ts-card${active ? ' is-active' : ''}`}
                    onClick={() => onChange?.(theme.id)}
                  >
                    <ThemeSwatch theme={theme} colors={colorsOf(theme)} image={theme.kind === 'custom' ? custom?.thumb : null} />
                    <span className="ts-card__name">
                      {theme.name[locale] || theme.name.en}
                      {theme.kind === 'dynamic' && <em className="ts-card__live">{t('themes.live')}</em>}
                    </span>
                    {!compact && <span className="ts-card__desc">{theme.desc[locale] || theme.desc.en}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
