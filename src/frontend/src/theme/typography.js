export const TYPOGRAPHY_PRESETS = [
  {
    id: 'manrope',
    name: { en: 'Manrope Variable', ru: 'Manrope' },
    summary: {
      en: 'Single variable grotesque, 200–800. Latin and Cyrillic subsets, no second typeface.',
      ru: 'Один вариативный гротеск 200–800. Латиница и кириллица, без второй гарнитуры.',
    },
    body: 'Manrope',
    heading: 'Manrope',
    fallback: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    google: ['Manrope:wght@200..800'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'gosuslugi',
    name: { en: 'Gosuslugi Lato', ru: 'Госуслуги · Lato' },
    summary: {
      en: 'One humanist grotesque. 400/700 only, modular 16→24→32, no tracking, no caps.',
      ru: 'Один гуманистический гротеск. Только 400/700, шкала 16→24→32, без трекинга и капса.',
    },
    body: 'Lato',
    heading: 'Lato',
    fallback: "Arial, 'Helvetica Neue', sans-serif",
    google: ['Lato:wght@400;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'google',
    name: { en: 'Google Material', ru: 'Google Material' },
    summary: {
      en: 'Roboto as the UI workhorse, Google Sans in the stack, Arial for speed fallback.',
      ru: 'Roboto для интерфейса, Google Sans в стеке, Arial как быстрый fallback.',
    },
    body: 'Roboto',
    heading: 'Roboto',
    fallback: "'Google Sans', Arial, sans-serif",
    google: ['Roboto:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 500,
    bodyWeight: 400,
  },
  {
    id: 'google-product',
    name: { en: 'Google Product', ru: 'Google Product' },
    summary: {
      en: 'Geometric Onest for brand lines, Roboto for interface — Product Sans character with Cyrillic.',
      ru: 'Геометрический Onest для бренда, Roboto для интерфейса — характер Product Sans с кириллицей.',
    },
    body: 'Roboto',
    heading: 'Onest',
    fallback: 'Arial, sans-serif',
    google: ['Onest:wght@400;500;700', 'Roboto:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ibm-carbon',
    name: { en: 'IBM Carbon', ru: 'IBM Carbon' },
    summary: {
      en: 'IBM Plex Sans — engineered corporate voice of Carbon Design System.',
      ru: 'IBM Plex Sans — инженерный корпоративный голос Carbon Design System.',
    },
    body: 'IBM Plex Sans',
    heading: 'IBM Plex Sans',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['IBM Plex Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'inter',
    name: { en: 'Inter Corporate', ru: 'Inter' },
    summary: {
      en: 'The default of modern SaaS. Screen-first metrics, excellent at small UI sizes.',
      ru: 'Де-факто стандарт современного SaaS. Экранные метрики, отлично читается в UI.',
    },
    body: 'Inter',
    heading: 'Inter',
    fallback: "system-ui, 'Segoe UI', sans-serif",
    google: ['Inter:wght@400;500;600;700'],
    baseFontSize: 15,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'source-sans',
    name: { en: 'Adobe Source Sans', ru: 'Adobe Source Sans' },
    summary: {
      en: 'Source Sans 3 — Adobe’s open corporate grotesque, calm and multilingual.',
      ru: 'Source Sans 3 — открытый корпоративный гротеск Adobe, спокойный и многоязычный.',
    },
    body: 'Source Sans 3',
    heading: 'Source Sans 3',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Source Sans 3:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'noto',
    name: { en: 'Noto Sans World', ru: 'Noto Sans' },
    summary: {
      en: 'Google’s universal grotesque. Designed so no language looks like a fallback.',
      ru: 'Универсальный гротеск Google. Ни один язык не выглядит как запасной.',
    },
    body: 'Noto Sans',
    heading: 'Noto Sans',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Noto Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'golos',
    name: { en: 'Golos Text', ru: 'Golos Text' },
    summary: {
      en: 'Paratype’s digital Russian grotesque — the voice of contemporary .ru products.',
      ru: 'Цифровой русский гротеск Paratype — голос современных .ru-продуктов.',
    },
    body: 'Golos Text',
    heading: 'Golos Text',
    fallback: "'PT Sans', Arial, sans-serif",
    google: ['Golos Text:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'pt-sans',
    name: { en: 'PT Sans', ru: 'PT Sans' },
    summary: {
      en: 'The classic public-domain Russian grotesque. Neutral, institutional, trusted.',
      ru: 'Классический общедоступный русский гротеск. Нейтральный и институциональный.',
    },
    body: 'PT Sans',
    heading: 'PT Sans',
    fallback: 'Arial, sans-serif',
    google: ['PT Sans:wght@400;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'fira',
    name: { en: 'Fira Sans', ru: 'Fira Sans' },
    summary: {
      en: 'Mozilla’s humanist grotesque. Open, civic, excellent in long UI copy.',
      ru: 'Гуманистический гротеск Mozilla. Открытый, гражданский, удобен в длинных текстах.',
    },
    body: 'Fira Sans',
    heading: 'Fira Sans',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Fira Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'open-sans',
    name: { en: 'Open Sans', ru: 'Open Sans' },
    summary: {
      en: 'The most deployed humanist web font. Safe, familiar, quietly professional.',
      ru: 'Самый распространённый гуманистический веб-шрифт. Безопасный и спокойно-деловой.',
    },
    body: 'Open Sans',
    heading: 'Open Sans',
    fallback: "Arial, 'Helvetica Neue', sans-serif",
    google: ['Open Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'montserrat',
    name: { en: 'Montserrat Brand', ru: 'Montserrat' },
    summary: {
      en: 'Urban geometric with poster confidence. Strong for brand sites and campaigns.',
      ru: 'Городской геометрический гротеск. Силён на бренд-сайтах и кампаниях.',
    },
    body: 'Montserrat',
    heading: 'Montserrat',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Montserrat:wght@400;500;600;700'],
    baseFontSize: 15,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'nunito',
    name: { en: 'Nunito Soft', ru: 'Nunito Sans' },
    summary: {
      en: 'Rounded terminals, approachable corporate. Used by education and fintech onboarding.',
      ru: 'Скруглённые терминалы, дружелюбный корпоратив. Образование и финтех-онбординг.',
    },
    body: 'Nunito Sans',
    heading: 'Nunito Sans',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Nunito Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'mulish',
    name: { en: 'Mulish', ru: 'Mulish' },
    summary: {
      en: 'A quieter Avenir cousin. Balanced for dashboards that must stay warm.',
      ru: 'Более тихий родственник Avenir. Баланс для тёплых дашбордов.',
    },
    body: 'Mulish',
    heading: 'Mulish',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Mulish:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'raleway',
    name: { en: 'Raleway Light', ru: 'Raleway' },
    summary: {
      en: 'Elegant wide grotesque. Headlines feel designed; body stays restrained.',
      ru: 'Элегантный широкий гротеск. Заголовки выглядят «сделанными», текст сдержан.',
    },
    body: 'Raleway',
    heading: 'Raleway',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Raleway:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ubuntu',
    name: { en: 'Ubuntu', ru: 'Ubuntu' },
    summary: {
      en: 'Canonical’s humanist. Distinctly open-source, still boardroom-safe.',
      ru: 'Гуманистический шрифт Canonical. Узнаваемо open-source, но уместен в совете директоров.',
    },
    body: 'Ubuntu',
    heading: 'Ubuntu',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Ubuntu:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'rubik',
    name: { en: 'Rubik', ru: 'Rubik' },
    summary: {
      en: 'Slightly rounded geometry. Popular with marketplaces and consumer brands.',
      ru: 'Чуть скруглённая геометрия. Маркетплейсы и потребительские бренды.',
    },
    body: 'Rubik',
    heading: 'Rubik',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Rubik:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'jost',
    name: { en: 'Jost Geometric', ru: 'Jost' },
    summary: {
      en: 'Bauhaus revival. Architectural, European, precise in large headings.',
      ru: 'Возрождение Баухауса. Архитектурный, европейский, точен в крупных заголовках.',
    },
    body: 'Jost',
    heading: 'Jost',
    fallback: "'Futura', Arial, sans-serif",
    google: ['Jost:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'geologica',
    name: { en: 'Geologica', ru: 'Geologica' },
    summary: {
      en: 'Variable geometric with Cyrillic. A credible Google Sans stand-in for CIS brands.',
      ru: 'Вариативная геометрия с кириллицей. Достойная замена Google Sans для CIS-брендов.',
    },
    body: 'Geologica',
    heading: 'Geologica',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Geologica:wght@400..700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'commissioner',
    name: { en: 'Commissioner', ru: 'Commissioner' },
    summary: {
      en: 'Low-contrast variable grotesque. Quiet luxury for reports and investor pages.',
      ru: 'Низкоконтрастный вариативный гротеск. Тихая роскошь для отчётов и investor pages.',
    },
    body: 'Commissioner',
    heading: 'Commissioner',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Commissioner:wght@400..700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'source-serif',
    name: { en: 'Source Editorial', ru: 'Source Editorial' },
    summary: {
      en: 'Source Serif 4 headlines, Source Sans 3 body — Adobe’s publishing pair.',
      ru: 'Source Serif 4 в заголовках, Source Sans 3 в тексте — издательская пара Adobe.',
    },
    body: 'Source Sans 3',
    heading: 'Source Serif 4',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Source Serif 4:wght@500;600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ibm-editorial',
    name: { en: 'IBM Editorial', ru: 'IBM Editorial' },
    summary: {
      en: 'Plex Serif + Plex Sans. The two-voice system of serious enterprise publishing.',
      ru: 'Plex Serif + Plex Sans. Двухголосая система серьёзного enterprise-издания.',
    },
    body: 'IBM Plex Sans',
    heading: 'IBM Plex Serif',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['IBM Plex Serif:wght@500;600;700', 'IBM Plex Sans:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'literata',
    name: { en: 'Literata Press', ru: 'Literata' },
    summary: {
      en: 'Google Play Books’ reading face with Source Sans. Long-form authority.',
      ru: 'Читальная гарнитура Google Play Books плюс Source Sans. Авторитет длинного текста.',
    },
    body: 'Source Sans 3',
    heading: 'Literata',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Literata:wght@500;600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 17,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'cormorant',
    name: { en: 'Cormorant Atelier', ru: 'Cormorant' },
    summary: {
      en: 'Display Garamond with Manrope. Heritage luxury, still usable in a product UI.',
      ru: 'Акцидентный гарамон с Manrope. Наследственная роскошь, уместная в продукте.',
    },
    body: 'Manrope',
    heading: 'Cormorant Garamond',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Cormorant Garamond:wght@600;700', 'Manrope:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'playfair',
    name: { en: 'Playfair Press', ru: 'Playfair' },
    summary: {
      en: 'High-contrast Didone headlines, Source Sans body. Fashion, culture, annual reports.',
      ru: 'Высококонтрастные дидоновские заголовки, Source Sans в тексте. Мода, культура, годовые отчёты.',
    },
    body: 'Source Sans 3',
    heading: 'Playfair Display',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Playfair Display:wght@600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'spectral',
    name: { en: 'Spectral Ledger', ru: 'Spectral' },
    summary: {
      en: 'News-grade serif with IBM Plex Sans. Banks, ministries, research institutes.',
      ru: 'Газетная антиква с IBM Plex Sans. Банки, ведомства, исследовательские институты.',
    },
    body: 'IBM Plex Sans',
    heading: 'Spectral',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Spectral:wght@500;600;700', 'IBM Plex Sans:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'merriweather',
    name: { en: 'Merriweather News', ru: 'Merriweather' },
    summary: {
      en: 'Screen serif designed for readability, paired with Source Sans.',
      ru: 'Экранная антиква для чтения в паре с Source Sans.',
    },
    body: 'Source Sans 3',
    heading: 'Merriweather',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Merriweather:wght@700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
];

export const FONT_OPTIONS = TYPOGRAPHY_PRESETS.map((item) => ({
  id: item.id,
  label: item.name.en,
}));

const LEGACY_FONT_TO_PRESET = {
  Manrope: 'manrope',
  Sora: 'manrope',
  'IBM Plex Sans': 'ibm-carbon',
  'Source Serif 4': 'source-serif',
  'Cormorant Garamond': 'cormorant',
};

export function getTypographyPreset(id) {
  return TYPOGRAPHY_PRESETS.find((item) => item.id === id) || TYPOGRAPHY_PRESETS[0];
}

export function resolveTypography(appearance = {}) {
  const stored = appearance.typography || {};
  const presetId =
    stored.preset || LEGACY_FONT_TO_PRESET[stored.fontFamily] || 'manrope';
  const preset = getTypographyPreset(presetId);
  return {
    ...preset,
    preset: preset.id,
    baseFontSize: Number(stored.baseFontSize) || preset.baseFontSize,
    headingWeight: Number(stored.headingWeight) || preset.headingWeight,
  };
}

export function fontStack(typo) {
  return `'${typo.body}', ${typo.fallback}`;
}

export function headingStack(typo) {
  return `'${typo.heading}', ${typo.fallback}`;
}

export function googleFontsHref(presets) {
  const families = new Map();
  for (const preset of presets.filter(Boolean)) {
    for (const spec of preset.google || []) {
      const colon = spec.indexOf(':');
      const name = colon === -1 ? spec : spec.slice(0, colon);
      const axis = colon === -1 ? 'wght@400;600;700' : spec.slice(colon + 1);
      families.set(name, axis);
    }
  }
  if (!families.size) return '';
  const query = [...families]
    .map(([name, axis]) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:${axis}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
