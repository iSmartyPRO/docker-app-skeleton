import { fontStack, resolveTypography } from './typography.js';

export { FONT_OPTIONS, TYPOGRAPHY_PRESETS } from './typography.js';

export const THEME_TEMPLATES = {
  navy: {
    id: 'navy',
    name: { en: 'Navy', ky: 'Кочкул көк', tr: 'Lacivert', zh: '藏青', ru: 'Тёмно-синий' },
    light: {
      colorPrimary: '#1E3A6E',
      colorInfo: '#1E3A6E',
      colorSuccess: '#2F6F55',
      colorWarning: '#C47B1A',
      colorError: '#B0423B',
      colorBgBase: '#F4F7FB',
      colorBgContainer: '#FFFFFF',
      colorBgLayout: '#E8EEF5',
      colorTextBase: '#122033',
      colorBorder: '#C5D0DE',
    },
    dark: {
      colorPrimary: '#7BA3D4',
      colorInfo: '#7BA3D4',
      colorSuccess: '#6FA888',
      colorWarning: '#E0A04A',
      colorError: '#D46A62',
      colorBgBase: '#0B1220',
      colorBgContainer: '#121A2A',
      colorBgLayout: '#080E18',
      colorTextBase: '#E8EEF6',
      colorBorder: '#243044',
    },
  },
  aurora: {
    id: 'aurora',
    name: { en: 'Aurora Gold', ky: 'Аврора алтыны', tr: 'Aurora altını', zh: '极光金', ru: 'Аврора' },
    light: {
      colorPrimary: '#B8863B',
      colorInfo: '#B8863B',
      colorSuccess: '#3F7D5B',
      colorWarning: '#C46A1B',
      colorError: '#A33B32',
      colorBgBase: '#F7F1E6',
      colorBgContainer: '#FFF9F0',
      colorBgLayout: '#F3EADF',
      colorTextBase: '#1C1710',
      colorBorder: '#E2D3BC',
    },
    dark: {
      colorPrimary: '#D4B06A',
      colorInfo: '#D4B06A',
      colorSuccess: '#6FA888',
      colorWarning: '#E09A4A',
      colorError: '#D46A62',
      colorBgBase: '#14110D',
      colorBgContainer: '#1C1813',
      colorBgLayout: '#100E0B',
      colorTextBase: '#F4EBD9',
      colorBorder: '#3A3228',
    },
  },
  merlot: {
    id: 'merlot',
    name: { en: 'Merlot', ky: 'Мерло', tr: 'Merlot', zh: '梅洛红', ru: 'Мерло' },
    light: {
      colorPrimary: '#7A2E3A',
      colorInfo: '#7A2E3A',
      colorSuccess: '#3E6B4F',
      colorWarning: '#B86A2D',
      colorError: '#8C2430',
      colorBgBase: '#F8F1EC',
      colorBgContainer: '#FFF8F4',
      colorBgLayout: '#F3E8E2',
      colorTextBase: '#241614',
      colorBorder: '#E4D0C8',
    },
    dark: {
      colorPrimary: '#E08A96',
      colorInfo: '#E08A96',
      colorSuccess: '#7DA88C',
      colorWarning: '#E0A36A',
      colorError: '#E27880',
      colorBgBase: '#160F10',
      colorBgContainer: '#1F1517',
      colorBgLayout: '#120C0D',
      colorTextBase: '#F6E8E6',
      colorBorder: '#3C2A2D',
    },
  },
  graphite: {
    id: 'graphite',
    name: { en: 'Graphite Copper', ky: 'Графит жана жез', tr: 'Grafit bakır', zh: '石墨铜', ru: 'Графит' },
    light: {
      colorPrimary: '#9A5B34',
      colorInfo: '#9A5B34',
      colorSuccess: '#4A6B4E',
      colorWarning: '#B7791F',
      colorError: '#9B3A2F',
      colorBgBase: '#F4F1EC',
      colorBgContainer: '#FBFAF7',
      colorBgLayout: '#EDE9E2',
      colorTextBase: '#1A1916',
      colorBorder: '#D8D2C8',
    },
    dark: {
      colorPrimary: '#D08A58',
      colorInfo: '#D08A58',
      colorSuccess: '#86A88A',
      colorWarning: '#D7A04A',
      colorError: '#D67A6E',
      colorBgBase: '#121211',
      colorBgContainer: '#1A1A18',
      colorBgLayout: '#0E0E0C',
      colorTextBase: '#EFEBE3',
      colorBorder: '#33322E',
    },
  },
  glacier: {
    id: 'glacier',
    name: { en: 'Glacier', ky: 'Мөңгү', tr: 'Buzul', zh: '冰川', ru: 'Ледник' },
    light: {
      colorPrimary: '#2F5E73',
      colorInfo: '#2F5E73',
      colorSuccess: '#3B6D5A',
      colorWarning: '#B07A2C',
      colorError: '#9A3F3A',
      colorBgBase: '#F2F5F6',
      colorBgContainer: '#FFFFFF',
      colorBgLayout: '#E7EEF0',
      colorTextBase: '#152026',
      colorBorder: '#C9D5DA',
    },
    dark: {
      colorPrimary: '#7FB3C4',
      colorInfo: '#7FB3C4',
      colorSuccess: '#7EAE99',
      colorWarning: '#D4A35A',
      colorError: '#D4847E',
      colorBgBase: '#0F1417',
      colorBgContainer: '#161C20',
      colorBgLayout: '#0B0F12',
      colorTextBase: '#E6EEF1',
      colorBorder: '#2A343A',
    },
  },
};

export function resolveColors(appearance = {}, mode = 'light') {
  const template = THEME_TEMPLATES[appearance.template] || THEME_TEMPLATES.navy;
  const base = template[mode] || template.light;
  return { ...base, ...(appearance.customColors || {}) };
}

export function buildAntdTheme(appearance = {}, mode = 'light') {
  const colors = resolveColors(appearance, mode);
  const typography = resolveTypography(appearance);
  return {
    token: {
      ...colors,
      fontFamily: fontStack(typography),
      fontSize: Number(typography.baseFontSize) || 16,
      borderRadius: 10,
      fontWeightStrong: Number(typography.headingWeight) || 600,
      // Motion: a touch slower than antd's defaults, with a soft "expo out"
      // curve, so modals, drawers and menus glide rather than snap.
      motionDurationFast: '0.14s',
      motionDurationMid: '0.24s',
      motionDurationSlow: '0.34s',
      motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
      motionEaseOutCirc: 'cubic-bezier(0.16, 1, 0.3, 1)',
      motionEaseInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    },
    algorithm: undefined,
  };
}
