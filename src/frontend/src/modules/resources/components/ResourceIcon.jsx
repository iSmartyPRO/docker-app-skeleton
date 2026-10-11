import { createElement, useMemo } from 'react';
import { useThemeMode } from '../../../context/ThemeContext';
import { iconUrl } from '../api';
import { MenuIcon } from '../../../components/icons/menuIcons';

function shade(hex, amount) {
  const value = hex.replace('#', '');
  const n = parseInt(value, 16);
  const mix = (channel) => Math.round(channel + (amount > 0 ? (255 - channel) * amount : channel * amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

function Glyph({ icon }) {
  const stroke = icon.mode !== 'fill';
  return (
    <svg
      viewBox="0 0 24 24"
      className="rs-icon__glyph"
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 1.9 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(icon.nodes || []).map(([tag, attrs], index) =>
        // Shapes were whitelisted by the server: only geometry attributes.
        createElement(tag, { key: index, ...Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])) })
      )}
    </svg>
  );
}

/**
 * A resource's icon on its tile. Styles: gradient · soft · solid · plain.
 * Dark theme uses the dark colour or dark image when one is set.
 */
export default function ResourceIcon({ icon = {}, size = 56, title = '', forceMode }) {
  const { mode: themeMode } = useThemeMode();
  const mode = forceMode || themeMode;
  const dark = mode === 'dark';
  const color = (dark && icon.colorDark) || icon.color || '#6366F1';
  const style = icon.style || 'gradient';

  const tile = useMemo(() => {
    if (style === 'gradient') {
      const from = icon.color2 && !(dark && icon.colorDark) ? icon.color2 : shade(color, 0.28);
      return { background: `linear-gradient(140deg, ${from} 0%, ${color} 58%, ${shade(color, -0.18)} 100%)`, color: '#fff' };
    }
    if (style === 'solid') return { background: color, color: '#fff' };
    if (style === 'soft') return { background: `color-mix(in srgb, ${color} ${dark ? 22 : 13}%, var(--da-surface, #fff))`, color: dark ? shade(color, 0.25) : color };
    return { background: 'transparent', color };
  }, [style, color, icon.color2, icon.colorDark, dark]);

  let body;
  if (icon.type === 'image') {
    const file = (dark && icon.dark) || icon.light;
    body = <img className="rs-icon__img" src={iconUrl(file)} alt="" draggable="false" />;
  } else if (icon.type === 'glyph') {
    body = <Glyph icon={icon} />;
  } else if (icon.type === 'menu') {
    body = (
      <span className="rs-icon__menu" style={{ '--rs-hole': style === 'soft' || style === 'plain' ? 'var(--da-surface, #fff)' : color }}>
        <MenuIcon name={icon.name} variant="mono" />
      </span>
    );
  } else {
    body = <span className="rs-icon__letter">{(icon.text || title.slice(0, 1) || '•').toUpperCase()}</span>;
  }

  return (
    <span
      className={`rs-icon is-${style} is-${icon.type || 'letter'}`}
      style={{ ...tile, width: size, height: size, '--rs-size': `${size}px` }}
      aria-hidden="true"
    >
      {body}
    </span>
  );
}
